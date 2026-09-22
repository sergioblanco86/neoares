import { useEffect, useRef, useState } from "react";
import { CircleAlert, CircleCheck, LoaderCircle, Pause, Play, Radio, SkipBack, SkipForward, Square, Volume2, VolumeX, WandSparkles } from "lucide-react";
import { calculateCrossfadeDelay, DualDeckMixer, type BeatAnalysis, type DeckSlot, type PlayerSnapshot } from "../audio/dual-deck-mixer";
import { getUpcoming, insertUpcoming, removeUpcomingTrack, reorderUpcoming, replaceUpcomingTrack, setUpcoming, type QueuePlacement } from "../domain/queue-operations";
import { buildDjSearchPlan, findCandidateArtist, isSearchCandidateAllowed, normalizeSearchText } from "../domain/search-strategy";
import type { DjProfile, PreparedYouTubeSource, YouTubeSource } from "../shared/contracts";
import { AddTrackDialog } from "./AddTrackDialog";
import { UpcomingQueue } from "./UpcomingQueue";

type SessionPhase = "IDLE" | "DISCOVERING" | "PREPARING" | "PLAYING" | "PAUSED" | "TRANSITIONING" | "ERROR";

const EMPTY_PLAYER: PlayerSnapshot = { durationSeconds: 0, positionSeconds: 0, playbackRate: 1, waveform: [], bpm: null, playing: false };
const AUTO_CROSSFADE_SECONDS = 6;
const TRANSITION_SAFETY_SECONDS = 0.5;
const MIN_NEXT_INSERTION_SECONDS = 15;
const RECENT_TRACKS_STORAGE_KEY = "neoares.recent-tracks.v1";
const recentSessionIdsByDj = new Map<string, string[]>();

export function AutonomousDjPanel({ dj }: { dj: DjProfile | null }) {
  const [mixer] = useState(() => new DualDeckMixer());
  const [phase, setPhase] = useState<SessionPhase>("IDLE");
  const [queue, setQueue] = useState<YouTubeSource[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [nextReady, setNextReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mixDetail, setMixDetail] = useState("Fade entre canciones · velocidad y tono originales");
  const [player, setPlayer] = useState<PlayerSnapshot>(EMPTY_PLAYER);
  const [seekDraft, setSeekDraft] = useState<number | null>(null);
  const [volume, setVolume] = useState(0.9);
  const [queueAction, setQueueAction] = useState<string | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const queueRef = useRef<YouTubeSource[]>([]);
  const indexRef = useRef(0);
  const currentSlotRef = useRef<DeckSlot>("A");
  const nextReadyRef = useRef(false);
  const transitioningRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const generationRef = useRef(0);
  const discoveryRoundRef = useRef(0);
  const extendingRef = useRef(false);
  const queueActionRef = useRef(false);
  const phaseRef = useRef<SessionPhase>("IDLE");

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => () => {
    generationRef.current += 1;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    void mixer.dispose();
  }, [mixer]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (queueRef.current[indexRef.current]) setPlayer(mixer.getPlayerSnapshot(currentSlotRef.current));
    }, 200);
    return () => window.clearInterval(interval);
  }, [mixer]);

  async function start(): Promise<void> {
    if (!dj || !window.desktop) return;
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    clearTimer();
    mixer.stopAll();
    setError(null);
    setQueueError(null);
    setQueueAction(null);
    setSearchOpen(false);
    queueActionRef.current = false;
    setQueue([]);
    setCurrentIndex(0);
    setNextReady(false);
    setMixDetail("Preparando ambos decks para una transición sin alterar el audio…");
    nextReadyRef.current = false;
    transitioningRef.current = false;

    try {
      await mixer.unlock();
      setPhase("DISCOVERING");
      discoveryRoundRef.current = randomInteger(0, Math.max(8, dj.seeds.artists.length * 2));
      const recentIds = new Set(getRecentTrackIds(dj.id));
      const candidates = await discoverFresh(5, recentIds, 1);
      if (generation !== generationRef.current) return;
      if (candidates.length < 2) throw new Error("No encontré suficientes canciones para iniciar este DJ. Intenta nuevamente.");

      setPhase("PREPARING");
      setQueue(candidates);
      const initial = await prepareInitialDeck(mixer, candidates);
      if (generation !== generationRef.current) return;
      const initialQueue = initial.queue;
      queueRef.current = initialQueue;
      setQueue(initialQueue);
      rememberTracks(dj.id, initialQueue);

      indexRef.current = 0;
      currentSlotRef.current = "A";
      nextReadyRef.current = false;
      setNextReady(false);
      await mixer.play("A");
      setPlayer(mixer.getPlayerSnapshot("A"));
      setMixDetail(`Deck A ${initial.analysisA.bpm} BPM · preparando la siguiente canción · reproducción original 100%`);
      setPhase("PLAYING");
      scheduleFromCurrent();
      void prepareFollowing("B", 1, generation);
    } catch (cause) {
      if (generation !== generationRef.current) return;
      setError(readableError(cause));
      setPhase("ERROR");
    }
  }

  async function advance(): Promise<void> {
    if (transitioningRef.current || !nextReadyRef.current) return;
    const nextIndex = indexRef.current + 1;
    const nextTrack = queueRef.current[nextIndex];
    if (!nextTrack) {
      setError("La cola automática se agotó antes de poder ampliarse.");
      setPhase("ERROR");
      return;
    }

    transitioningRef.current = true;
    nextReadyRef.current = false;
    setNextReady(false);
    clearTimer();
    setPhase("TRANSITIONING");
    const from = currentSlotRef.current;
    const to: DeckSlot = from === "A" ? "B" : "A";

    try {
      const report = await mixer.crossfade(from, to, AUTO_CROSSFADE_SECONDS);
      setMixDetail(`Fade out + fade in de ${report.durationSeconds.toFixed(1)} s · velocidad y tono originales`);
      indexRef.current = nextIndex;
      currentSlotRef.current = to;
      setCurrentIndex(nextIndex);
      setPlayer(mixer.getPlayerSnapshot(to));
      scheduleFromCurrent();
      if (queueRef.current.length - nextIndex <= 4) void extendQueue(generationRef.current);

      window.setTimeout(() => {
        void prepareFollowing(from, nextIndex + 1, generationRef.current);
      }, report.durationSeconds * 1_000 + 200);
    } catch (cause) {
      transitioningRef.current = false;
      setError(readableError(cause));
      setPhase("ERROR");
    }
  }

  async function prepareFollowing(slot: DeckSlot, index: number, generation: number): Promise<void> {
    if (generation !== generationRef.current) return;
    if (!queueRef.current[index]) await extendQueue(generation);
    while (generation === generationRef.current) {
      const source = queueRef.current[index];
      if (!source) break;
      try {
        await prepareOnDeck(mixer, slot, source);
        if (generation !== generationRef.current) return;
        nextReadyRef.current = true;
        transitioningRef.current = false;
        setNextReady(true);
        setPhase("PLAYING");
        if (phaseRef.current === "PLAYING") scheduleFromCurrent();
        return;
      } catch {
        queueRef.current = queueRef.current.filter((_, candidateIndex) => candidateIndex !== index);
        setQueue([...queueRef.current]);
      }
    }
    transitioningRef.current = false;
    setError("No quedan canciones descargables en la cola.");
    setPhase("ERROR");
  }

  function scheduleFromCurrent(): void {
    clearTimer();
    const snapshot = mixer.getPlayerSnapshot(currentSlotRef.current);
    const delaySeconds = calculateCrossfadeDelay(snapshot.durationSeconds, snapshot.positionSeconds, AUTO_CROSSFADE_SECONDS, TRANSITION_SAFETY_SECONDS);
    timerRef.current = window.setTimeout(() => void advance(), delaySeconds * 1_000);
  }

  function clearTimer(): void {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }

  function stop(): void {
    generationRef.current += 1;
    clearTimer();
    mixer.stopAll();
    queueRef.current = [];
    setQueue([]);
    setCurrentIndex(0);
    setNextReady(false);
    nextReadyRef.current = false;
    transitioningRef.current = false;
    queueActionRef.current = false;
    setError(null);
    setQueueAction(null);
    setQueueError(null);
    setSearchOpen(false);
    setPlayer(EMPTY_PLAYER);
    setSeekDraft(null);
    setMixDetail("Fade entre canciones · velocidad y tono originales");
    phaseRef.current = "IDLE";
    setPhase("IDLE");
  }

  async function pausePlayback(): Promise<void> {
    clearTimer();
    await mixer.pause();
    setPlayer(mixer.getPlayerSnapshot(currentSlotRef.current));
    phaseRef.current = "PAUSED";
    setPhase("PAUSED");
  }

  async function resumePlayback(): Promise<void> {
    await mixer.resume();
    phaseRef.current = "PLAYING";
    setPhase("PLAYING");
    if (!queueActionRef.current) scheduleFromCurrent();
  }

  function seekTo(positionSeconds: number): void {
    mixer.seek(currentSlotRef.current, positionSeconds);
    setSeekDraft(null);
    setPlayer(mixer.getPlayerSnapshot(currentSlotRef.current));
    if (phase === "PLAYING") scheduleFromCurrent();
  }

  function changeVolume(nextVolume: number): void {
    const normalized = Math.min(1, Math.max(0, nextVolume));
    mixer.setVolume(normalized);
    setVolume(normalized);
  }

  async function runQueueAction(label: string, action: () => Promise<boolean>): Promise<boolean> {
    if (queueActionRef.current || !dj) return false;
    const generation = generationRef.current;
    queueActionRef.current = true;
    if (phaseRef.current === "PLAYING") clearTimer();
    setQueueAction(label);
    setQueueError(null);
    try {
      return await action();
    } catch (cause) {
      setQueueError(readableError(cause));
      return false;
    } finally {
      queueActionRef.current = false;
      setQueueAction(null);
      if (generation === generationRef.current && phaseRef.current === "PLAYING" && !transitioningRef.current) scheduleFromCurrent();
    }
  }

  async function commitUpcoming(nextUpcoming: YouTubeSource[]): Promise<boolean> {
    if (!dj) return false;
    const generation = generationRef.current;
    const previousQueue = queueRef.current;
    const previousUpcoming = getUpcoming(previousQueue, indexRef.current);
    const firstChanged = previousUpcoming[0]?.id !== nextUpcoming[0]?.id;
    const nextQueue = setUpcoming(previousQueue, indexRef.current, nextUpcoming);
    queueRef.current = nextQueue;
    setQueue([...nextQueue]);

    if (!firstChanged || !nextUpcoming[0]) {
      rememberTracks(dj.id, nextUpcoming);
      return true;
    }

    nextReadyRef.current = false;
    setNextReady(false);
    const inactiveSlot: DeckSlot = currentSlotRef.current === "A" ? "B" : "A";
    try {
      await prepareOnDeck(mixer, inactiveSlot, nextUpcoming[0]);
      if (generation !== generationRef.current) return false;
      nextReadyRef.current = true;
      setNextReady(true);
      rememberTracks(dj.id, nextUpcoming);
      if (phase === "PLAYING") scheduleFromCurrent();
      return true;
    } catch (cause) {
      const currentUpcoming = getUpcoming(queueRef.current, indexRef.current);
      const attemptedIds = new Set(nextUpcoming.map(({ id }) => id));
      const concurrentAdditions = currentUpcoming.filter(({ id }) => !attemptedIds.has(id) && !previousUpcoming.some((track) => track.id === id));
      const restoredUpcoming = [...previousUpcoming, ...concurrentAdditions];
      queueRef.current = setUpcoming(queueRef.current, indexRef.current, restoredUpcoming);
      setQueue([...queueRef.current]);
      nextReadyRef.current = true;
      setNextReady(true);
      throw cause;
    }
  }

  function moveUpcoming(fromIndex: number, toIndex: number): void {
    void runQueueAction("Reorganizando la cola…", () => commitUpcoming(reorderUpcoming(getUpcoming(queueRef.current, indexRef.current), fromIndex, toIndex)));
  }

  function replaceOne(index: number): void {
    void runQueueAction("Buscando una canción relacionada…", async () => {
      const upcomingTracks = getUpcoming(queueRef.current, indexRef.current);
      const excludedIds = new Set(queueRef.current.map(({ id }) => id));
      for (const id of getRecentTrackIds(dj!.id)) excludedIds.add(id);
      const [replacement] = await discoverFresh(1, excludedIds, 5);
      if (!replacement) throw new Error("No encontré otra canción relacionada que no estuviera ya en la cola.");
      return commitUpcoming(replaceUpcomingTrack(upcomingTracks, index, replacement));
    });
  }

  function refreshAllUpcoming(): void {
    void runQueueAction("Buscando otras cuatro canciones…", async () => {
      const excludedIds = new Set(queueRef.current.map(({ id }) => id));
      for (const id of getRecentTrackIds(dj!.id)) excludedIds.add(id);
      const replacements = await discoverFresh(4, excludedIds, 7);
      if (replacements.length < 4) throw new Error("No encontré cuatro canciones nuevas para reemplazar la cola completa.");
      return commitUpcoming(replacements.slice(0, 4));
    });
  }

  function removeOne(index: number): void {
    void runQueueAction("Actualizando la cola…", () => commitUpcoming(removeUpcomingTrack(getUpcoming(queueRef.current, indexRef.current), index)));
  }

  async function addRequestedTrack(track: YouTubeSource, placement: QueuePlacement): Promise<boolean> {
    const upcomingTracks = getUpcoming(queueRef.current, indexRef.current);
    if (upcomingTracks.some(({ id }) => id === track.id)) throw new Error("Esa canción ya está entre las próximas.");

    if (placement === "END") {
      const nextUpcoming = insertUpcoming(upcomingTracks, track, "END");
      queueRef.current = setUpcoming(queueRef.current, indexRef.current, nextUpcoming);
      setQueue([...queueRef.current]);
      if (dj) rememberTracks(dj.id, [track]);
      return true;
    }

    if (phaseRef.current === "TRANSITIONING") {
      throw new Error("La transición ya comenzó. Espera a que la siguiente canción entre y vuelve a intentarlo.");
    }
    if (queueActionRef.current || !nextReadyRef.current) {
      throw new Error("El siguiente deck todavía se está preparando. Puedes seguir buscando o agregar la canción al final.");
    }
    if (phaseRef.current === "PLAYING") {
      const snapshot = mixer.getPlayerSnapshot(currentSlotRef.current);
      const remainingSeconds = snapshot.durationSeconds - snapshot.positionSeconds;
      if (remainingSeconds <= MIN_NEXT_INSERTION_SECONDS) {
        throw new Error(`Quedan ${Math.max(0, Math.ceil(remainingSeconds))} segundos y la transición ya está demasiado cerca. Agrégala al final o espera a que comience la siguiente canción.`);
      }
    }

    return runQueueAction(placement === "NEXT" ? "Preparando la canción solicitada…" : "Agregando a la cola…", async () => {
      return commitUpcoming(insertUpcoming(upcomingTracks, track, placement));
    });
  }

  async function discoverFresh(count: number, excludedIds: Set<string>, attempts: number): Promise<YouTubeSource[]> {
    if (!dj) return [];
    const found: YouTubeSource[] = [];
    const usedIds = new Set(excludedIds);
    for (let attempt = 0; attempt < attempts && found.length < count; attempt += 1) {
      const discovered = await discover(dj, discoveryRoundRef.current, usedIds);
      discoveryRoundRef.current += 1;
      for (const track of discovered) {
        if (usedIds.has(track.id)) continue;
        found.push(track);
        usedIds.add(track.id);
        if (found.length === count) break;
      }
    }
    return found;
  }

  const busy = phase === "DISCOVERING" || phase === "PREPARING";
  const running = phase === "PLAYING" || phase === "PAUSED" || phase === "TRANSITIONING";
  const audible = phase === "PLAYING" || phase === "PAUSED" || phase === "TRANSITIONING";
  const current = audible ? queue[currentIndex] ?? null : null;
  const upcoming = queue.slice(audible ? currentIndex + 1 : 0);
  const queueEditingDisabled = !running || phase === "TRANSITIONING" || queueAction !== null;
  const displayedPosition = seekDraft ?? player.positionSeconds;
  const progress = player.durationSeconds ? displayedPosition / player.durationSeconds : 0;

  return (
    <>
      <section className="panel autopilot-panel" aria-labelledby="autopilot-title">
      <div className="autopilot-heading">
        <div>
          <span className="eyebrow">DJ autónomo</span>
          <h2 id="autopilot-title">{dj?.name ?? "Selecciona un DJ"}</h2>
          <p>{dj?.description ?? "Elige un perfil para iniciar una sesión."}</p>
        </div>
        <div className="autopilot-actions">
          <SessionStatus phase={phase} />
          {running ? (
            <button className="secondary-button" onClick={stop} type="button"><Square size={14} fill="currentColor" /> Terminar</button>
          ) : (
            <button className="primary-button" disabled={!dj || busy} onClick={() => void start()} type="button">
              {busy ? <LoaderCircle className="spin" size={16} /> : <WandSparkles size={16} />}
              {phase === "DISCOVERING" ? "Buscando música…" : phase === "PREPARING" ? "Preparando decks…" : "Iniciar DJ"}
            </button>
          )}
        </div>
      </div>

      {error ? <div className="session-error" role="alert"><CircleAlert size={16} /><span>{error}</span></div> : null}
      {queueError ? <div className="session-error queue-error" role="alert"><CircleAlert size={16} /><span>{queueError}</span></div> : null}

      <div className="autopilot-body">
        <div className={`now-playing ${audible ? "active" : ""}`}>
          <div className="now-playing-label"><Radio size={15} /><span>{audible ? phase === "PAUSED" ? "En pausa" : "Sonando ahora" : busy ? "Preparando primera pista" : "Sesión detenida"}</span></div>
          {current ? (
            <div className="now-track">
              <div><strong>{current.title}</strong><span>{current.creator}</span></div>
              <time>{player.bpm ? `${player.bpm} BPM` : formatDuration(current.durationSeconds)}</time>
            </div>
          ) : (
            <p>Presiona “Iniciar DJ”. La selección y la cola se construyen automáticamente.</p>
          )}
          <div className="player-waveform">
            <div aria-hidden="true" className="waveform-bars">
              {player.waveform.map((height, index) => <i className={index / player.waveform.length <= progress ? "played" : ""} key={index} style={{ height: `${Math.round(height * 100)}%` }} />)}
            </div>
            {player.durationSeconds ? (
              <input
                aria-label="Posición de la canción"
                className="waveform-seek"
                max={player.durationSeconds}
                min={0}
                onChange={(event) => setSeekDraft(Number(event.target.value))}
                onKeyUp={(event) => seekTo(Number(event.currentTarget.value))}
                onPointerUp={(event) => seekTo(Number(event.currentTarget.value))}
                step={0.1}
                type="range"
                value={displayedPosition}
                disabled={phase === "TRANSITIONING" || queueAction !== null}
              />
            ) : null}
          </div>
          <div className="player-time"><time>{formatDuration(displayedPosition)}</time><time>−{formatDuration(Math.max(0, player.durationSeconds - displayedPosition))}</time><time>{formatDuration(player.durationSeconds)}</time></div>
          <div className="player-controls" aria-label="Controles de reproducción">
            <button aria-label="Reiniciar canción" className="transport-button" disabled={!audible || phase === "TRANSITIONING" || queueAction !== null} onClick={() => seekTo(0)} type="button"><SkipBack size={20} fill="currentColor" /></button>
            <button aria-label={phase === "PAUSED" ? "Continuar" : "Pausar"} className="transport-button primary-transport" disabled={!audible || phase === "TRANSITIONING"} onClick={() => void (phase === "PAUSED" ? resumePlayback() : pausePlayback())} type="button">{phase === "PAUSED" ? <Play size={22} fill="currentColor" /> : <Pause size={22} fill="currentColor" />}</button>
            <button aria-label="Siguiente y mezclar" className="transport-button" disabled={!running || !nextReady || phase === "TRANSITIONING" || phase === "PAUSED" || queueAction !== null} onClick={() => void advance()} type="button"><SkipForward size={20} fill="currentColor" /></button>
            <div className="volume-control">
              <button aria-label={volume === 0 ? "Activar sonido" : "Silenciar"} className="volume-button" onClick={() => changeVolume(volume === 0 ? 0.8 : 0)} type="button">{volume === 0 ? <VolumeX size={17} /> : <Volume2 size={17} />}</button>
              <input aria-label="Volumen" max={1} min={0} onChange={(event) => changeVolume(Number(event.target.value))} step={0.01} type="range" value={volume} />
            </div>
          </div>
        </div>

        <UpcomingQueue
          addDisabled={!running}
          busyLabel={queueAction}
          disabled={queueEditingDisabled}
          nextReady={nextReady}
          onAdd={() => setSearchOpen(true)}
          onMove={moveUpcoming}
          onRefreshAll={refreshAllUpcoming}
          onRemove={removeOne}
          onReplace={replaceOne}
          tracks={upcoming}
        />
      </div>

      <div className="autopilot-footer">
        <span>{mixDetail}</span>
        <span>La siguiente pista permanece preparada en el segundo deck.</span>
      </div>
      </section>
      <AddTrackDialog
        existingIds={new Set(upcoming.map(({ id }) => id))}
        onAdd={addRequestedTrack}
        onClose={() => setSearchOpen(false)}
        open={searchOpen}
      />
    </>
  );

  async function extendQueue(generation: number): Promise<void> {
    if (!dj || extendingRef.current || generation !== generationRef.current) return;
    extendingRef.current = true;
    try {
      const excludedIds = new Set(queueRef.current.map(({ id }) => id));
      for (const id of getRecentTrackIds(dj.id)) excludedIds.add(id);
      const additions = await discoverFresh(5, excludedIds, 5);
      if (generation !== generationRef.current) return;
      if (additions.length === 0) return;
      queueRef.current = [...queueRef.current, ...additions];
      setQueue([...queueRef.current]);
      rememberTracks(dj.id, additions);
    } finally {
      extendingRef.current = false;
    }
  }
}

async function discover(dj: DjProfile, round: number, excludedIds = new Set<string>()): Promise<YouTubeSource[]> {
  const plan = buildDjSearchPlan(dj, round);
  const searchedGroups = await window.desktop!.sources.searchMany(plan.queries, 6);
  const groups = shuffled(searchedGroups.map((group) => shuffled(group)));
  const interleaved: YouTubeSource[] = [];
  const seen = new Set(excludedIds);
  const seenArtists = new Set<string>();

  for (let index = 0; index < 6; index += 1) {
    for (const group of groups) {
      const source = group[index];
      if (!source || seen.has(source.id)) continue;
      if (!isSearchCandidateAllowed(dj, source, plan)) continue;
      const artistKey = normalizeSearchText(findCandidateArtist(source, plan) ?? source.creator);
      if (seenArtists.has(artistKey)) continue;
      seen.add(source.id);
      seenArtists.add(artistKey);
      interleaved.push(source);
    }
  }
  return interleaved.slice(0, 12);
}

function shuffled<T>(values: T[]): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInteger(0, index + 1);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function randomInteger(minimum: number, maximumExclusive: number): number {
  if (maximumExclusive <= minimum) return minimum;
  const range = maximumExclusive - minimum;
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return minimum + (values[0] % range);
}

function rememberTracks(djId: string, tracks: YouTubeSource[]): void {
  const previous = getRecentTrackIds(djId);
  const newestFirst = [...tracks.map(({ id }) => id), ...previous];
  const next = [...new Set(newestFirst)].slice(0, 80);
  recentSessionIdsByDj.set(djId, next);
  try {
    const stored = readStoredRecentTracks();
    stored[djId] = next;
    localStorage.setItem(RECENT_TRACKS_STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // The in-memory history still prevents repeats for the current app session.
  }
}

function getRecentTrackIds(djId: string): string[] {
  const cached = recentSessionIdsByDj.get(djId);
  if (cached) return cached;
  try {
    const stored = readStoredRecentTracks()[djId] ?? [];
    recentSessionIdsByDj.set(djId, stored);
    return stored;
  } catch {
    return [];
  }
}

function readStoredRecentTracks(): Record<string, string[]> {
  const parsed = JSON.parse(localStorage.getItem(RECENT_TRACKS_STORAGE_KEY) ?? "{}") as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  return Object.fromEntries(Object.entries(parsed).flatMap(([djId, ids]) => {
    if (!Array.isArray(ids)) return [];
    return [[djId, ids.filter((id): id is string => typeof id === "string").slice(0, 80)]];
  }));
}

async function prepareOnDeck(mixer: DualDeckMixer, slot: DeckSlot, source: YouTubeSource): Promise<BeatAnalysis> {
  const bytes = await readPreparedSource(source);
  return mixer.load(slot, bytes);
}

async function readPreparedSource(source: YouTubeSource): Promise<Uint8Array> {
  const prepared: PreparedYouTubeSource = await window.desktop!.sources.prepare(source);
  try {
    return await window.desktop!.sources.read(prepared.leaseId);
  } finally {
    await window.desktop!.sources.release(prepared.leaseId);
  }
}

async function prepareInitialDeck(mixer: DualDeckMixer, candidates: YouTubeSource[]): Promise<{
  queue: YouTubeSource[];
  analysisA: BeatAnalysis;
}> {
  const rejectedIds = new Set<string>();

  for (const source of candidates) {
    try {
      const analysisA = await prepareOnDeck(mixer, "A", source);
      return {
        queue: [source, ...candidates.filter(({ id }) => id !== source.id && !rejectedIds.has(id))],
        analysisA,
      };
    } catch {
      rejectedIds.add(source.id);
    }
  }

  throw new Error("La fuente no permitió preparar ninguna canción de esta selección.");
}

function SessionStatus({ phase }: { phase: SessionPhase }) {
  if (phase === "PLAYING") return <span className="session-chip live"><Radio size={12} /> Al aire</span>;
  if (phase === "PAUSED") return <span className="session-chip"><Pause size={12} /> En pausa</span>;
  if (phase === "TRANSITIONING") return <span className="session-chip working"><LoaderCircle className="spin" size={12} /> Mezclando</span>;
  if (phase === "DISCOVERING" || phase === "PREPARING") return <span className="session-chip working"><LoaderCircle className="spin" size={12} /> Preparando</span>;
  if (phase === "ERROR") return <span className="session-chip error"><CircleAlert size={12} /> Error</span>;
  return <span className="session-chip"><CircleCheck size={12} /> Listo para iniciar</span>;
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

function readableError(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : "La sesión no pudo continuar.";
  return message.replace(/^Error invoking remote method '[^']+': Error: /, "");
}
