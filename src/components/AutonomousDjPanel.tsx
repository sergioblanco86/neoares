import { useEffect, useRef, useState } from "react";
import { CircleAlert, CircleCheck, LoaderCircle, Pause, Play, Radio, SkipBack, SkipForward, Square, Volume2, VolumeX, WandSparkles } from "lucide-react";
import { calculateCrossfadeDelay, DualDeckMixer, type BeatAnalysis, type DeckSlot, type PlayerSnapshot } from "../audio/dual-deck-mixer";
import { getUpcoming, insertUpcoming, removeUpcomingTrack, reorderUpcoming, replaceUpcomingTrack, setUpcoming, type QueuePlacement } from "../domain/queue-operations";
import { assessMusicCandidate, buildDjSearchPlan, findCandidateArtist, isSearchCandidateAllowed, normalizeSearchText } from "../domain/search-strategy";
import { createSingleFlight } from "../domain/single-flight";
import { resolveBackAction, resolveTransportKeyboardCommand, type TransportCommand } from "../domain/transport-controls";
import { displayCreator, displayTitle } from "../i18n/content";
import { readableError } from "../i18n/errors";
import { useI18n } from "../i18n/i18n";
import type { TranslationKey } from "../i18n/locales/es";
import type { DjProfile, PreparedYouTubeSource, RestorableSessionPhase, SessionSnapshot, YouTubeSource } from "../shared/contracts";
import { AddTrackDialog } from "./AddTrackDialog";
import { UpcomingQueue } from "./UpcomingQueue";

type SessionPhase = "IDLE" | "RESTORABLE" | "DISCOVERING" | "PREPARING" | "PLAYING" | "PAUSED" | "TRANSITIONING" | "RECOVERING" | "ERROR";

const EMPTY_PLAYER: PlayerSnapshot = { durationSeconds: 0, positionSeconds: 0, playbackRate: 1, waveform: [], bpm: null, playing: false };
const AUTO_CROSSFADE_SECONDS = 6;
const TRANSITION_SAFETY_SECONDS = 0.5;
const MIN_NEXT_INSERTION_SECONDS = 15;
const REFILL_TARGET = 6;
const RECOVERY_RETRY_MS = 2_000;
const TRANSITION_RECHECK_MS = 500;
const RECENT_TRACKS_STORAGE_KEY = "neoares.recent-tracks.v1";
const recentSessionIdsByDj = new Map<string, string[]>();
type MessageDescriptor = { key: TranslationKey; values?: Record<string, string | number> };

export function AutonomousDjPanel({ dj }: { dj: DjProfile | null }) {
  const { t } = useI18n();
  const [mixer] = useState(() => new DualDeckMixer());
  const [phase, setPhase] = useState<SessionPhase>("IDLE");
  const [queue, setQueue] = useState<YouTubeSource[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [nextReady, setNextReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mixDetail, setMixDetail] = useState<MessageDescriptor>({ key: "mix.default" });
  const [player, setPlayer] = useState<PlayerSnapshot>(EMPTY_PLAYER);
  const [seekDraft, setSeekDraft] = useState<number | null>(null);
  const [volume, setVolume] = useState(0.9);
  const [queueAction, setQueueAction] = useState<TranslationKey | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [transportBusy, setTransportBusy] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [restorableSnapshot, setRestorableSnapshot] = useState<SessionSnapshot | null>(null);
  const queueRef = useRef<YouTubeSource[]>([]);
  const indexRef = useRef(0);
  const currentSlotRef = useRef<DeckSlot>("A");
  const nextReadyRef = useRef(false);
  const transitioningRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const preparationTimerRef = useRef<number | null>(null);
  const generationRef = useRef(0);
  const discoveryRoundRef = useRef(0);
  const queueRefillRef = useRef(createSingleFlight<number>());
  const nextPreparationRef = useRef<Promise<void> | null>(null);
  const queueActionRef = useRef(false);
  const phaseRef = useRef<SessionPhase>("IDLE");
  const sessionIdRef = useRef<string | null>(null);
  const snapshotWriteChainRef = useRef<Promise<void>>(Promise.resolve());
  const lastBackPressAtRef = useRef<number | null>(null);
  const lastMediaCommandRef = useRef<{ command: TransportCommand; at: number } | null>(null);
  const transportCommandRef = useRef<(command: TransportCommand) => void>(() => undefined);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    let active = true;
    void window.desktop?.sessions.loadActive().then((snapshot) => {
      if (!active || phaseRef.current !== "IDLE" || !snapshot || snapshot.djId !== dj?.id) return;
      if (snapshot.djRevision !== dj.revision) {
        void clearActiveSnapshot();
        return;
      }
      sessionIdRef.current = snapshot.sessionId;
      discoveryRoundRef.current = snapshot.discoveryRound;
      queueRef.current = snapshot.queue;
      indexRef.current = snapshot.currentIndex;
      setQueue(snapshot.queue);
      setCurrentIndex(snapshot.currentIndex);
      setRestorableSnapshot(snapshot);
      phaseRef.current = "RESTORABLE";
      setPhase("RESTORABLE");
    }).catch((cause) => {
      if (active) setError(readableError(cause, t, "error.sessionFailed"));
    });
    return () => {
      active = false;
    };
  }, [dj]);

  useEffect(() => {
    if (!isPersistablePhase(phase) || !sessionIdRef.current) return;
    persistActiveSession();
  }, [currentIndex, phase, queue]);

  useEffect(() => {
    if (!isPersistablePhase(phase) || !sessionIdRef.current) return;
    const interval = window.setInterval(() => persistActiveSession(), 5_000);
    return () => window.clearInterval(interval);
  }, [phase]);

  useEffect(() => () => {
    persistActiveSession();
    generationRef.current += 1;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    if (preparationTimerRef.current) window.clearTimeout(preparationTimerRef.current);
    void window.desktop?.runtime.setAudioActive(false);
    void window.desktop?.sources.cancelPlayback();
    void mixer.dispose();
  }, [mixer]);

  useEffect(() => {
    if (phase !== "PLAYING" && phase !== "TRANSITIONING" && phase !== "RECOVERING") return;
    const interval = window.setInterval(() => {
      if (queueRef.current[indexRef.current]) setPlayer(mixer.getPlayerSnapshot(currentSlotRef.current));
    }, 250);
    return () => window.clearInterval(interval);
  }, [mixer, phase]);

  useEffect(() => {
    const audioActive = phase === "PLAYING" || phase === "TRANSITIONING" || phase === "RECOVERING";
    void window.desktop?.runtime.setAudioActive(audioActive);
  }, [phase]);

  async function start(): Promise<void> {
    if (!dj || !window.desktop) return;
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    clearTimer();
    mixer.reset();
    setError(null);
    setQueueError(null);
    setQueueAction(null);
    setSearchOpen(false);
    setTransportBusy(false);
    queueActionRef.current = false;
    queueRefillRef.current = createSingleFlight<number>();
    nextPreparationRef.current = null;
    setQueue([]);
    setCurrentIndex(0);
    setNextReady(false);
    setMixDetail({ key: "mix.preparing" });
    nextReadyRef.current = false;
    transitioningRef.current = false;
    setRestorableSnapshot(null);
    await clearActiveSnapshot();
    sessionIdRef.current = crypto.randomUUID();

    try {
      await mixer.unlock();
      phaseRef.current = "DISCOVERING";
      setPhase("DISCOVERING");
      discoveryRoundRef.current = randomInteger(0, Math.max(8, dj.seeds.artists.length * 2));
      const recentIds = new Set(getRecentTrackIds(dj.id));
      const candidates = await discoverFresh(5, recentIds, 1);
      if (generation !== generationRef.current) return;
      if (candidates.length < 2) throw new Error(t("error.notEnoughTracks"));

      phaseRef.current = "PREPARING";
      setPhase("PREPARING");
      setQueue(candidates);
      const initial = await prepareInitialDeck(mixer, candidates, () => generation === generationRef.current);
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
      setMixDetail({ key: "mix.deckReady", values: { bpm: initial.analysisA.bpm } });
      phaseRef.current = "PLAYING";
      setPhase("PLAYING");
      scheduleFromCurrent();
      void prepareFollowing("B", 1, generation);
    } catch (cause) {
      if (generation !== generationRef.current) return;
      setError(readableError(cause, t, "error.sessionFailed"));
      phaseRef.current = "ERROR";
      setPhase("ERROR");
    }
  }

  async function continueRestoredSession(): Promise<void> {
    if (!restorableSnapshot || !window.desktop) return;
    const snapshot = restorableSnapshot;
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    clearTimer();
    setError(null);
    setQueueError(null);
    phaseRef.current = "PREPARING";
    setPhase("PREPARING");

    try {
      await mixer.unlock();
      const currentSource = queueRef.current[indexRef.current];
      if (!currentSource) throw new Error(t("error.invalidSavedSession"));
      await prepareOnDeck(mixer, "A", currentSource, () => generation === generationRef.current);
      if (generation !== generationRef.current) return;
      currentSlotRef.current = "A";
      nextReadyRef.current = false;
      setNextReady(false);
      await mixer.play("A", snapshot.positionSeconds);
      setPlayer(mixer.getPlayerSnapshot("A"));
      setRestorableSnapshot(null);
      phaseRef.current = "PLAYING";
      setPhase("PLAYING");
      scheduleFromCurrent();
      void prepareFollowing("B", indexRef.current + 1, generation);
      void ensureQueueDepth(generation);
    } catch (cause) {
      if (generation !== generationRef.current) return;
      setError(readableError(cause, t, "error.sessionFailed"));
      phaseRef.current = "RESTORABLE";
      setPhase("RESTORABLE");
    }
  }

  async function discardRestoredSession(): Promise<void> {
    generationRef.current += 1;
    sessionIdRef.current = null;
    setRestorableSnapshot(null);
    queueRef.current = [];
    indexRef.current = 0;
    setQueue([]);
    setCurrentIndex(0);
    setPlayer(EMPTY_PLAYER);
    setError(null);
    phaseRef.current = "IDLE";
    setPhase("IDLE");
    await clearActiveSnapshot();
  }

  async function advance(): Promise<void> {
    if (transitioningRef.current) return;
    if (!nextReadyRef.current) {
      if (phaseRef.current !== "PAUSED") {
        phaseRef.current = "RECOVERING";
        setPhase("RECOVERING");
      }
      setQueueError(t("continuity.nextPreparing"));
      const inactiveSlot: DeckSlot = currentSlotRef.current === "A" ? "B" : "A";
      void prepareFollowing(inactiveSlot, indexRef.current + 1, generationRef.current);
      scheduleTransitionRecheck();
      return;
    }
    const nextIndex = indexRef.current + 1;
    const nextTrack = queueRef.current[nextIndex];
    if (!nextTrack) {
      const generation = generationRef.current;
      nextReadyRef.current = false;
      setNextReady(false);
      phaseRef.current = "RECOVERING";
      setPhase("RECOVERING");
      setQueueError(t("continuity.expandingQueue"));
      const inactiveSlot: DeckSlot = currentSlotRef.current === "A" ? "B" : "A";
      void ensureQueueDepth(generation).then(() => {
        if (generation === generationRef.current) return prepareFollowing(inactiveSlot, nextIndex, generation);
      });
      scheduleTransitionRecheck();
      return;
    }

    transitioningRef.current = true;
    const generation = generationRef.current;
    nextReadyRef.current = false;
    setNextReady(false);
    clearTimer();
    phaseRef.current = "TRANSITIONING";
    setPhase("TRANSITIONING");
    const from = currentSlotRef.current;
    const to: DeckSlot = from === "A" ? "B" : "A";

    try {
      const report = await mixer.crossfade(from, to, AUTO_CROSSFADE_SECONDS);
      setMixDetail({ key: "mix.completed", values: { seconds: report.durationSeconds.toFixed(1) } });
      indexRef.current = nextIndex;
      currentSlotRef.current = to;
      setCurrentIndex(nextIndex);
      setPlayer(mixer.getPlayerSnapshot(to));
      setQueueError(null);
      scheduleFromCurrent();
      void ensureQueueDepth(generation);

      if (preparationTimerRef.current) window.clearTimeout(preparationTimerRef.current);
      preparationTimerRef.current = window.setTimeout(() => {
        preparationTimerRef.current = null;
        void prepareFollowing(from, nextIndex + 1, generation);
      }, report.durationSeconds * 1_000 + 200);
    } catch (cause) {
      transitioningRef.current = false;
      setError(readableError(cause, t, "error.sessionFailed"));
      phaseRef.current = "ERROR";
      setPhase("ERROR");
    }
  }

  async function prepareFollowing(slot: DeckSlot, index: number, generation: number): Promise<void> {
    if (nextPreparationRef.current) return nextPreparationRef.current;
    const preparation = runPrepareFollowing(slot, index, generation);
    nextPreparationRef.current = preparation;
    try {
      await preparation;
    } finally {
      if (nextPreparationRef.current === preparation) nextPreparationRef.current = null;
    }
  }

  async function runPrepareFollowing(slot: DeckSlot, index: number, generation: number): Promise<void> {
    if (generation !== generationRef.current) return;
    if (!queueRef.current[index]) await ensureQueueDepth(generation);
    while (generation === generationRef.current) {
      const source = queueRef.current[index];
      if (!source) {
        transitioningRef.current = false;
        phaseRef.current = phaseRef.current === "PAUSED" ? "PAUSED" : "RECOVERING";
        if (phaseRef.current === "RECOVERING") setPhase("RECOVERING");
        setQueueError(t("continuity.findingAlternative"));
        schedulePreparationRetry(slot, index, generation);
        return;
      }
      try {
        await prepareOnDeck(mixer, slot, source, () => generation === generationRef.current);
        if (generation !== generationRef.current) return;
        nextReadyRef.current = true;
        transitioningRef.current = false;
        setNextReady(true);
        setQueueError(null);
        if (phaseRef.current !== "PAUSED") {
          phaseRef.current = "PLAYING";
          setPhase("PLAYING");
          scheduleFromCurrent();
        }
        void ensureQueueDepth(generation);
        return;
      } catch (cause) {
        if (generation !== generationRef.current) return;
        if (isSupersededDeckLoad(cause)) {
          console.info("[continuity] deck-load-superseded", { generation, index, slot, sourceId: source.id });
          return;
        }
        console.warn("[continuity] track-preparation-failed", {
          generation,
          index,
          slot,
          sourceId: source.id,
          message: readableError(cause, t),
        });
        queueRef.current = queueRef.current.filter((_, candidateIndex) => candidateIndex !== index);
        setQueue([...queueRef.current]);
      }
    }
  }

  function scheduleFromCurrent(): void {
    clearTimer();
    const snapshot = mixer.getPlayerSnapshot(currentSlotRef.current);
    const delaySeconds = calculateCrossfadeDelay(snapshot.durationSeconds, snapshot.positionSeconds, AUTO_CROSSFADE_SECONDS, TRANSITION_SAFETY_SECONDS);
    timerRef.current = window.setTimeout(() => void advance(), delaySeconds * 1_000);
  }

  function scheduleTransitionRecheck(): void {
    clearTimer();
    timerRef.current = window.setTimeout(() => void advance(), TRANSITION_RECHECK_MS);
  }

  function schedulePreparationRetry(slot: DeckSlot, index: number, generation: number): void {
    if (preparationTimerRef.current) window.clearTimeout(preparationTimerRef.current);
    preparationTimerRef.current = window.setTimeout(() => {
      preparationTimerRef.current = null;
      if (generation !== generationRef.current) return;
      void prepareFollowing(slot, index, generation);
    }, RECOVERY_RETRY_MS);
  }

  function clearTimer(): void {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }

  function stop(): void {
    generationRef.current += 1;
    clearTimer();
    if (preparationTimerRef.current) window.clearTimeout(preparationTimerRef.current);
    preparationTimerRef.current = null;
    void window.desktop?.sources.cancelPlayback();
    mixer.reset();
    queueRef.current = [];
    setQueue([]);
    setCurrentIndex(0);
    setNextReady(false);
    nextReadyRef.current = false;
    transitioningRef.current = false;
    queueActionRef.current = false;
    queueRefillRef.current = createSingleFlight<number>();
    nextPreparationRef.current = null;
    setError(null);
    setQueueAction(null);
    setQueueError(null);
    setSearchOpen(false);
    setTransportBusy(false);
    setPlayer(EMPTY_PLAYER);
    setSeekDraft(null);
    setMixDetail({ key: "mix.default" });
    setRestorableSnapshot(null);
    sessionIdRef.current = null;
    void clearActiveSnapshot();
    phaseRef.current = "IDLE";
    setPhase("IDLE");
  }

  async function pausePlayback(): Promise<void> {
    clearTimer();
    phaseRef.current = "PAUSED";
    setPhase("PAUSED");
    await mixer.pause();
    setPlayer(mixer.getPlayerSnapshot(currentSlotRef.current));
  }

  async function resumePlayback(): Promise<void> {
    await mixer.resume();
    const resumedPhase: SessionPhase = nextReadyRef.current ? "PLAYING" : "RECOVERING";
    phaseRef.current = resumedPhase;
    setPhase(resumedPhase);
    if (queueActionRef.current) return;
    if (nextReadyRef.current) {
      scheduleFromCurrent();
    } else {
      const inactiveSlot: DeckSlot = currentSlotRef.current === "A" ? "B" : "A";
      void prepareFollowing(inactiveSlot, indexRef.current + 1, generationRef.current);
      scheduleTransitionRecheck();
    }
  }

  async function togglePlayback(): Promise<void> {
    if (transitioningRef.current) return;
    if (phaseRef.current === "PAUSED") {
      await resumePlayback();
      return;
    }
    if (phaseRef.current === "PLAYING" || phaseRef.current === "RECOVERING") await pausePlayback();
  }

  function runTransportCommand(command: TransportCommand): void {
    if (command === "TOGGLE_PLAYBACK") {
      void togglePlayback();
      return;
    }
    if (command === "NEXT") {
      if (phaseRef.current === "PLAYING" && nextReadyRef.current && !transitioningRef.current && !queueActionRef.current) void advance();
      return;
    }
    handleBackCommand();
  }

  function runMediaControlCommand(command: TransportCommand): void {
    const now = performance.now();
    const previous = lastMediaCommandRef.current;
    if (previous?.command === command && now - previous.at >= 0 && now - previous.at < 100) return;
    lastMediaCommandRef.current = { command, at: now };
    transportCommandRef.current(command);
  }

  function handleBackCommand(): void {
    if (!isActivePlaybackPhase(phaseRef.current) || transitioningRef.current || queueActionRef.current) return;
    const pressedAt = performance.now();
    const action = resolveBackAction(lastBackPressAtRef.current, pressedAt, indexRef.current > 0);
    lastBackPressAtRef.current = action === "PREVIOUS" ? null : pressedAt;
    if (action === "PREVIOUS") {
      void returnToPrevious();
      return;
    }
    seekTo(0);
  }

  async function returnToPrevious(): Promise<void> {
    const previousIndex = indexRef.current - 1;
    const previousTrack = queueRef.current[previousIndex];
    if (!previousTrack || transitioningRef.current || queueActionRef.current) return;

    const wasPaused = phaseRef.current === "PAUSED";
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    clearTimer();
    if (preparationTimerRef.current) window.clearTimeout(preparationTimerRef.current);
    preparationTimerRef.current = null;
    nextPreparationRef.current = null;
    transitioningRef.current = true;
    setTransportBusy(true);
    nextReadyRef.current = false;
    setNextReady(false);
    setQueueError(null);

    const from = currentSlotRef.current;
    const to: DeckSlot = from === "A" ? "B" : "A";
    try {
      await prepareOnDeck(mixer, to, previousTrack, () => generation === generationRef.current);
      if (generation !== generationRef.current) return;

      mixer.activateImmediately(from, to);
      completePreviousNavigation(previousIndex, to, wasPaused);
    } catch (cause) {
      if (generation !== generationRef.current) return;
      transitioningRef.current = false;
      setTransportBusy(false);
      nextReadyRef.current = false;
      setNextReady(false);
      phaseRef.current = wasPaused ? "PAUSED" : "RECOVERING";
      setPhase(wasPaused ? "PAUSED" : "RECOVERING");
      void prepareFollowing(to, indexRef.current + 1, generation);
      if (!wasPaused) scheduleFromCurrent();
      console.warn("[transport] previous-track-failed", { message: readableError(cause, t) });
    }
  }

  function completePreviousNavigation(previousIndex: number, slot: DeckSlot, paused: boolean): void {
    indexRef.current = previousIndex;
    currentSlotRef.current = slot;
    nextReadyRef.current = true;
    transitioningRef.current = false;
    setTransportBusy(false);
    setCurrentIndex(previousIndex);
    setNextReady(true);
    setPlayer(mixer.getPlayerSnapshot(slot));
    setQueueError(null);
    phaseRef.current = paused ? "PAUSED" : "PLAYING";
    setPhase(paused ? "PAUSED" : "PLAYING");
    if (!paused) scheduleFromCurrent();
    persistActiveSession();
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

  async function runQueueAction(label: TranslationKey, action: () => Promise<boolean>): Promise<boolean> {
    if (queueActionRef.current || !dj) return false;
    const generation = generationRef.current;
    queueActionRef.current = true;
    if (phaseRef.current === "PLAYING") clearTimer();
    setQueueAction(label);
    setQueueError(null);
    try {
      return await action();
    } catch (cause) {
      setQueueError(readableError(cause, t));
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
      await prepareOnDeck(mixer, inactiveSlot, nextUpcoming[0], () => generation === generationRef.current);
      if (generation !== generationRef.current) return false;
      nextReadyRef.current = true;
      setNextReady(true);
      rememberTracks(dj.id, nextUpcoming);
      if (phase === "PLAYING") scheduleFromCurrent();
      return true;
    } catch (cause) {
      if (generation !== generationRef.current) return false;
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
    void runQueueAction("queueAction.reordering", () => commitUpcoming(reorderUpcoming(getUpcoming(queueRef.current, indexRef.current), fromIndex, toIndex)));
  }

  function replaceOne(index: number): void {
    void runQueueAction("queueAction.findingRelated", async () => {
      const upcomingTracks = getUpcoming(queueRef.current, indexRef.current);
      const excludedIds = new Set(queueRef.current.map(({ id }) => id));
      for (const id of getRecentTrackIds(dj!.id)) excludedIds.add(id);
      const [replacement] = await discoverFresh(1, excludedIds, 5);
      if (!replacement) throw new Error(t("error.noReplacement"));
      return commitUpcoming(replaceUpcomingTrack(upcomingTracks, index, replacement));
    });
  }

  function refreshAllUpcoming(): void {
    void runQueueAction("queueAction.findingFour", async () => {
      const excludedIds = new Set(queueRef.current.map(({ id }) => id));
      for (const id of getRecentTrackIds(dj!.id)) excludedIds.add(id);
      const replacements = await discoverFresh(4, excludedIds, 7);
      if (replacements.length < 4) throw new Error(t("error.noFourReplacements"));
      return commitUpcoming(replacements.slice(0, 4));
    });
  }

  function removeOne(index: number): void {
    void runQueueAction("queueAction.updating", () => commitUpcoming(removeUpcomingTrack(getUpcoming(queueRef.current, indexRef.current), index)));
  }

  async function addRequestedTrack(track: YouTubeSource, placement: QueuePlacement): Promise<boolean> {
    const requestedTrack: YouTubeSource = { ...track, catalog: track.catalog ?? "YOUTUBE", requestedByUser: true };
    const upcomingTracks = getUpcoming(queueRef.current, indexRef.current);
    if (upcomingTracks.some(({ id }) => id === requestedTrack.id)) throw new Error(t("error.alreadyUpcoming"));

    if (placement === "END") {
      const nextUpcoming = insertUpcoming(upcomingTracks, requestedTrack, "END");
      queueRef.current = setUpcoming(queueRef.current, indexRef.current, nextUpcoming);
      setQueue([...queueRef.current]);
      if (dj) rememberTracks(dj.id, [requestedTrack]);
      return true;
    }

    if (phaseRef.current === "TRANSITIONING") {
      throw new Error(t("error.transitionStarted"));
    }
    if (queueActionRef.current || !nextReadyRef.current) {
      throw new Error(t("error.nextDeckPreparing"));
    }
    if (phaseRef.current === "PLAYING") {
      const snapshot = mixer.getPlayerSnapshot(currentSlotRef.current);
      const remainingSeconds = snapshot.durationSeconds - snapshot.positionSeconds;
      if (remainingSeconds <= MIN_NEXT_INSERTION_SECONDS) {
        throw new Error(t("error.transitionTooClose", { seconds: Math.max(0, Math.ceil(remainingSeconds)) }));
      }
    }

    return runQueueAction(placement === "NEXT" ? "queueAction.preparingRequested" : "queueAction.adding", async () => {
      return commitUpcoming(insertUpcoming(upcomingTracks, requestedTrack, placement));
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
  const running = phase === "PLAYING" || phase === "PAUSED" || phase === "TRANSITIONING" || phase === "RECOVERING";
  const audible = running;
  const hasLoadedCurrent = player.durationSeconds > 0 && Boolean(queue[currentIndex]);
  const hasRestorableCurrent = phase === "RESTORABLE" && Boolean(queue[currentIndex]);
  const current = hasLoadedCurrent || hasRestorableCurrent ? queue[currentIndex] : null;
  const upcoming = hasLoadedCurrent || hasRestorableCurrent ? getUpcoming(queue, currentIndex) : queue;
  const queueEditingDisabled = !running || !nextReady || transportBusy || phase === "TRANSITIONING" || phase === "RECOVERING" || queueAction !== null;
  const displayedDuration = player.durationSeconds || (hasRestorableCurrent ? current?.durationSeconds ?? 0 : 0);
  const displayedPosition = seekDraft ?? (hasRestorableCurrent ? restorableSnapshot?.positionSeconds ?? 0 : player.positionSeconds);
  const progress = displayedDuration ? displayedPosition / displayedDuration : 0;
  transportCommandRef.current = runTransportCommand;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const command = resolveTransportKeyboardCommand({
        code: event.code,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        repeat: event.repeat,
        editable: isEditableTarget(event.target),
        modalOpen: document.querySelector('[role="dialog"]') !== null,
      });
      if (!command) return;
      event.preventDefault();
      transportCommandRef.current(command);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const handlers: Array<[MediaSessionAction, MediaSessionActionHandler]> = [
      ["play", () => { if (phaseRef.current === "PAUSED") runMediaControlCommand("TOGGLE_PLAYBACK"); }],
      ["pause", () => { if (phaseRef.current === "PLAYING" || phaseRef.current === "RECOVERING") runMediaControlCommand("TOGGLE_PLAYBACK"); }],
      ["nexttrack", () => runMediaControlCommand("NEXT")],
      ["previoustrack", () => runMediaControlCommand("BACK")],
    ];
    for (const [action, handler] of handlers) setMediaSessionHandler(action, handler);
    return () => {
      for (const [action] of handlers) setMediaSessionHandler(action, null);
    };
  }, []);

  useEffect(() => window.desktop?.runtime.onMediaControl((command) => runMediaControlCommand(command)), []);

  useEffect(() => {
    void window.desktop?.runtime.setMediaControlsActive(running);
    return () => {
      if (running) void window.desktop?.runtime.setMediaControlsActive(false);
    };
  }, [running]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = phase === "PAUSED"
      ? "paused"
      : phase === "PLAYING" || phase === "TRANSITIONING" || phase === "RECOVERING"
        ? "playing"
        : "none";
    navigator.mediaSession.metadata = current ? new MediaMetadata({
      title: current.title,
      artist: current.creator,
      album: dj?.name ?? "NeoAres",
      artwork: current.thumbnailUrl ? [{ src: current.thumbnailUrl }] : [],
    }) : null;
  }, [current, dj?.name, phase]);

  useEffect(() => {
    if (!("mediaSession" in navigator) || displayedDuration <= 0) return;
    try {
      navigator.mediaSession.setPositionState({
        duration: displayedDuration,
        playbackRate: 1,
        position: Math.min(displayedDuration, Math.max(0, displayedPosition)),
      });
    } catch {
      // Position reporting is optional and must never interrupt playback.
    }
  }, [displayedDuration, displayedPosition]);

  return (
    <>
      <section className="panel autopilot-panel" aria-labelledby="autopilot-title">
      <div className="autopilot-heading">
        <div>
          <span className="eyebrow">{t("session.autonomousDj")}</span>
          <h2 id="autopilot-title">{dj?.name ?? t("session.selectDj")}</h2>
          <p>{dj?.description ?? t("session.selectDescription")}</p>
        </div>
        <div className="autopilot-actions">
          <SessionStatus phase={phase} />
          {phase === "RESTORABLE" ? (
            <>
              <button className="secondary-button" onClick={() => void discardRestoredSession()} type="button">{t("session.discard")}</button>
              <button className="primary-button" onClick={() => void continueRestoredSession()} type="button"><Play size={16} fill="currentColor" /> {t("session.continue")}</button>
            </>
          ) : running ? (
            <button className="secondary-button" onClick={stop} type="button"><Square size={14} fill="currentColor" /> {t("session.end")}</button>
          ) : (
            <button className="primary-button" disabled={!dj || busy} onClick={() => void start()} type="button">
              {busy ? <LoaderCircle className="spin" size={16} /> : <WandSparkles size={16} />}
              {phase === "DISCOVERING" ? t("session.searchingMusic") : phase === "PREPARING" ? t("session.preparingDecks") : t("session.start")}
            </button>
          )}
        </div>
      </div>

      {error ? <div className="session-error" role="alert"><CircleAlert size={16} /><span>{error}</span></div> : null}
      {queueError ? <div className="session-error queue-error" role="alert"><CircleAlert size={16} /><span>{queueError}</span></div> : null}

      <div className="autopilot-body">
        <div className={`now-playing ${audible ? "active" : ""}`}>
          <div className="now-playing-label"><Radio size={15} /><span>{phase === "RESTORABLE" ? t("session.saved") : phase === "RECOVERING" ? t("session.recoveringContinuity") : audible ? phase === "PAUSED" ? t("session.paused") : t("session.nowPlaying") : busy ? t("session.preparingFirst") : t("session.stopped")}</span></div>
          {current ? (
            <div className="now-track">
              <div><strong>{displayTitle(current.title, t)}</strong><span>{displayCreator(current.creator, t)}</span></div>
              <time>{player.bpm ? `${player.bpm} BPM` : formatDuration(current.durationSeconds)}</time>
            </div>
          ) : (
            <p>{t("session.startHint")}</p>
          )}
          <div className="player-waveform">
            <div aria-hidden="true" className="waveform-bars">
              {player.waveform.map((height, index) => <i className={index / player.waveform.length <= progress ? "played" : ""} key={index} style={{ height: `${Math.round(height * 100)}%` }} />)}
            </div>
            {player.durationSeconds ? (
              <input
                aria-label={t("player.songPosition")}
                className="waveform-seek"
                max={player.durationSeconds}
                min={0}
                onChange={(event) => setSeekDraft(Number(event.target.value))}
                onKeyUp={(event) => seekTo(Number(event.currentTarget.value))}
                onPointerUp={(event) => seekTo(Number(event.currentTarget.value))}
                step={0.1}
                type="range"
                value={displayedPosition}
                disabled={transportBusy || phase === "TRANSITIONING" || queueAction !== null}
              />
            ) : null}
          </div>
          <div className="player-time"><time>{formatDuration(displayedPosition)}</time><time>−{formatDuration(Math.max(0, displayedDuration - displayedPosition))}</time><time>{formatDuration(displayedDuration)}</time></div>
          <div className="player-controls" aria-label={t("player.controls")}>
            <button aria-label={t("player.back")} className="transport-button" disabled={!audible || transportBusy || phase === "TRANSITIONING" || queueAction !== null} onClick={handleBackCommand} title={t("player.backShortcut")} type="button"><SkipBack size={20} fill="currentColor" /></button>
            <button aria-label={phase === "PAUSED" ? t("player.resume") : t("player.pause")} className="transport-button primary-transport" disabled={!audible || transportBusy || phase === "TRANSITIONING"} onClick={() => void togglePlayback()} title={t("player.pauseShortcut")} type="button">{phase === "PAUSED" ? <Play size={22} fill="currentColor" /> : <Pause size={22} fill="currentColor" />}</button>
            <button aria-label={t("player.nextAndMix")} className="transport-button" disabled={!running || !nextReady || transportBusy || phase === "TRANSITIONING" || phase === "PAUSED" || queueAction !== null} onClick={() => void advance()} title={t("player.nextShortcut")} type="button"><SkipForward size={20} fill="currentColor" /></button>
            <div className="volume-control">
              <button aria-label={volume === 0 ? t("player.unmute") : t("player.mute")} className="volume-button" onClick={() => changeVolume(volume === 0 ? 0.8 : 0)} type="button">{volume === 0 ? <VolumeX size={17} /> : <Volume2 size={17} />}</button>
              <input aria-label={t("player.volume")} max={1} min={0} onChange={(event) => changeVolume(Number(event.target.value))} step={0.01} type="range" value={volume} />
            </div>
          </div>
        </div>

        <UpcomingQueue
          addDisabled={!running}
          busyLabel={queueAction ? t(queueAction) : null}
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
        <span>{t(mixDetail.key, mixDetail.values)}</span>
        <span>{t("session.nextPrepared")}</span>
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

  async function ensureQueueDepth(generation: number): Promise<number> {
    if (!dj || generation !== generationRef.current) return 0;
    return queueRefillRef.current.run(async () => {
      const upcomingCount = Math.max(0, queueRef.current.length - indexRef.current - 1);
      const requested = Math.max(0, REFILL_TARGET - upcomingCount);
      if (requested === 0) return 0;

      try {
        const strictExcludedIds = new Set(queueRef.current.map(({ id }) => id));
        for (const id of getRecentTrackIds(dj.id)) strictExcludedIds.add(id);
        const additions = await discoverFresh(requested, strictExcludedIds, 5);

        if (generation !== generationRef.current) return 0;
        if (additions.length < requested) {
          const relaxedExcludedIds = new Set(queueRef.current.map(({ id }) => id));
          for (const { id } of additions) relaxedExcludedIds.add(id);
          additions.push(...await discoverFresh(requested - additions.length, relaxedExcludedIds, 3));
        }

        if (generation !== generationRef.current || additions.length === 0) return 0;
        queueRef.current = [...queueRef.current, ...additions];
        setQueue([...queueRef.current]);
        rememberTracks(dj.id, additions);
        return additions.length;
      } catch (cause) {
        if (generation === generationRef.current) {
          console.warn("[continuity] queue-refill-failed", { generation, message: readableError(cause, t) });
          setQueueError(t("continuity.refillFailed"));
        }
        return 0;
      }
    });
  }

  function persistActiveSession(): void {
    const sessionId = sessionIdRef.current;
    if (!sessionId || !dj || !window.desktop || !isPersistablePhase(phaseRef.current)) return;
    const current = queueRef.current[indexRef.current];
    if (!current) return;
    const positionSeconds = mixer.getPlayerSnapshot(currentSlotRef.current).positionSeconds;
    const snapshot: SessionSnapshot = {
      schemaVersion: 1,
      sessionId,
      djId: dj.id,
      djRevision: dj.revision,
      phase: persistedPhase(phaseRef.current),
      queue: [...queueRef.current],
      currentIndex: indexRef.current,
      positionSeconds,
      discoveryRound: discoveryRoundRef.current,
      savedAt: new Date().toISOString(),
      recoverable: true,
    };
    snapshotWriteChainRef.current = snapshotWriteChainRef.current
      .catch(() => undefined)
      .then(async () => {
        if (sessionIdRef.current !== sessionId) return;
        await window.desktop!.sessions.saveActive(snapshot);
      })
      .catch((cause) => console.warn("[session] snapshot-save-failed", { message: readableError(cause, t) }));
  }

  async function clearActiveSnapshot(): Promise<void> {
    if (!window.desktop) return;
    snapshotWriteChainRef.current = snapshotWriteChainRef.current
      .catch(() => undefined)
      .then(() => window.desktop!.sessions.clearActive());
    await snapshotWriteChainRef.current;
  }
}

async function discover(dj: DjProfile, round: number, excludedIds = new Set<string>()): Promise<YouTubeSource[]> {
  const plan = buildDjSearchPlan(dj, round);
  let searchedGroups: YouTubeSource[][];
  try {
    searchedGroups = await window.desktop!.sources.searchMusicMany(plan.musicQueries, 6, dj.curation.popularityLevel ?? 3, "playback");
    if (searchedGroups.every((group) => group.length === 0)) throw new Error("MUSIC_SEARCH_EMPTY_RESULTS");
  } catch (cause) {
    console.warn("[discovery] music-catalog-unavailable", {
      message: cause instanceof Error ? cause.message : "UNKNOWN",
    });
    searchedGroups = await window.desktop!.sources.searchMany(plan.queries, 6, "playback");
  }
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

async function prepareOnDeck(
  mixer: DualDeckMixer,
  slot: DeckSlot,
  source: YouTubeSource,
  isCurrent: () => boolean = () => true,
): Promise<BeatAnalysis> {
  const musicAssessment = assessMusicCandidate(source);
  if (!musicAssessment.allowed) {
    throw new Error(`CONTENT_REJECTED: ${musicAssessment.negativeReasons.join(", ")}`);
  }
  const bytes = await readPreparedSource(source);
  if (!isCurrent()) throw new StalePreparationError();
  const cachedLoudness = await window.desktop!.cache.getLoudness(source.id);
  const analysis = await mixer.load(slot, bytes, cachedLoudness);
  if (!cachedLoudness) {
    void window.desktop!.cache.saveLoudness(source.id, analysis.loudness).catch((cause) => {
      console.warn("[audio] loudness-cache-save-failed", { sourceId: source.id, message: cause instanceof Error ? cause.message : "UNKNOWN" });
    });
  }
  return analysis;
}

async function readPreparedSource(source: YouTubeSource): Promise<Uint8Array> {
  const prepared: PreparedYouTubeSource = await window.desktop!.sources.prepare(source, "playback");
  try {
    return await window.desktop!.sources.read(prepared.leaseId);
  } finally {
    await window.desktop!.sources.release(prepared.leaseId);
  }
}

async function prepareInitialDeck(mixer: DualDeckMixer, candidates: YouTubeSource[], isCurrent: () => boolean): Promise<{
  queue: YouTubeSource[];
  analysisA: BeatAnalysis;
}> {
  const rejectedIds = new Set<string>();

  for (const source of candidates) {
    try {
      const analysisA = await prepareOnDeck(mixer, "A", source, isCurrent);
      return {
        queue: [source, ...candidates.filter(({ id }) => id !== source.id && !rejectedIds.has(id))],
        analysisA,
      };
    } catch (cause) {
      if (!isCurrent() || cause instanceof StalePreparationError) throw new StalePreparationError();
      rejectedIds.add(source.id);
    }
  }

  throw new Error("NO_PLAYABLE_TRACK");
}

function SessionStatus({ phase }: { phase: SessionPhase }) {
  const { t } = useI18n();
  if (phase === "RESTORABLE") return <span className="session-chip"><Pause size={12} /> {t("session.saved")}</span>;
  if (phase === "PLAYING") return <span className="session-chip live"><Radio size={12} /> {t("session.onAir")}</span>;
  if (phase === "PAUSED") return <span className="session-chip"><Pause size={12} /> {t("session.paused")}</span>;
  if (phase === "TRANSITIONING") return <span className="session-chip working"><LoaderCircle className="spin" size={12} /> {t("session.mixing")}</span>;
  if (phase === "RECOVERING") return <span className="session-chip working"><LoaderCircle className="spin" size={12} /> {t("session.recovering")}</span>;
  if (phase === "DISCOVERING" || phase === "PREPARING") return <span className="session-chip working"><LoaderCircle className="spin" size={12} /> {t("session.preparing")}</span>;
  if (phase === "ERROR") return <span className="session-chip error"><CircleAlert size={12} /> {t("common.error")}</span>;
  return <span className="session-chip"><CircleCheck size={12} /> {t("session.readyToStart")}</span>;
}

function isPersistablePhase(phase: SessionPhase): phase is "PLAYING" | "PAUSED" | "TRANSITIONING" | "RECOVERING" {
  return phase === "PLAYING" || phase === "PAUSED" || phase === "TRANSITIONING" || phase === "RECOVERING";
}

function isActivePlaybackPhase(phase: SessionPhase): boolean {
  return phase === "PLAYING" || phase === "PAUSED" || phase === "RECOVERING";
}

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof Element
    && target.closest('input, textarea, select, button, [contenteditable="true"], [role="slider"]') !== null;
}

function setMediaSessionHandler(action: MediaSessionAction, handler: MediaSessionActionHandler | null): void {
  try {
    navigator.mediaSession.setActionHandler(action, handler);
  } catch {
    // Some operating systems expose Media Session without every transport action.
  }
}

function persistedPhase(phase: SessionPhase): RestorableSessionPhase {
  if (phase === "PAUSED") return "PAUSED";
  if (phase === "RECOVERING") return "RECOVERING";
  return "PLAYING";
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

function isSupersededDeckLoad(cause: unknown): boolean {
  return cause instanceof Error && cause.message.includes("DECK_LOAD_SUPERSEDED");
}

class StalePreparationError extends Error {
  constructor() {
    super("STALE_PREPARATION");
    this.name = "StalePreparationError";
  }
}
