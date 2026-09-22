import { useEffect, useState } from "react";
import { CircleAlert, CircleCheck, Disc3, LoaderCircle, Pause, Play, Radio, WandSparkles } from "lucide-react";
import { DualDeckMixer, type DeckSlot } from "../audio/dual-deck-mixer";
import { displayCreator, displayTitle } from "../i18n/content";
import { readableError } from "../i18n/errors";
import { useI18n } from "../i18n/i18n";
import type { PreparedYouTubeSource } from "../shared/contracts";

type DeckPhase = "EMPTY" | "PREPARING" | "READY" | "PLAYING" | "ERROR";

type DeckState = {
  url: string;
  phase: DeckPhase;
  source: PreparedYouTubeSource | null;
  error: string | null;
};

const EMPTY_DECK: DeckState = { url: "", phase: "EMPTY", source: null, error: null };
const DEMO_URLS = {
  A: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  B: "https://www.youtube.com/watch?v=9bZkp7q19f0",
} as const;
const wave = [28, 52, 76, 43, 91, 64, 35, 82, 57, 39, 71, 48, 88, 61, 31, 69, 53, 79, 42, 66, 34, 85, 56, 46];

export function YouTubeMixerPanel() {
  const { t } = useI18n();
  const [mixer] = useState(() => new DualDeckMixer());
  const [decks, setDecks] = useState<Record<DeckSlot, DeckState>>({
    A: { ...EMPTY_DECK, url: DEMO_URLS.A },
    B: { ...EMPTY_DECK, url: DEMO_URLS.B },
  });
  const [activeDeck, setActiveDeck] = useState<DeckSlot | null>(null);
  const [mixing, setMixing] = useState(false);

  useEffect(() => () => { void mixer.dispose(); }, [mixer]);

  function updateDeck(slot: DeckSlot, patch: Partial<DeckState>) {
    setDecks((current) => ({ ...current, [slot]: { ...current[slot], ...patch } }));
  }

  async function prepare(slot: DeckSlot): Promise<void> {
    const url = decks[slot].url.trim();
    if (!url) return;
    if (!window.desktop) {
      updateDeck(slot, { phase: "ERROR", error: t("mixer.desktopOnly") });
      return;
    }

    updateDeck(slot, { phase: "PREPARING", source: null, error: null });
    let leaseId: string | null = null;
    try {
      const inspected = await window.desktop.sources.inspect(url);
      const source = await window.desktop.sources.prepare(inspected);
      leaseId = source.leaseId;
      const bytes = await window.desktop.sources.read(source.leaseId);
      await mixer.load(slot, bytes);
      updateDeck(slot, { phase: "READY", source, error: null });
    } catch (cause) {
      updateDeck(slot, { phase: "ERROR", source: null, error: readableError(cause, t, "mixer.prepareFailed") });
    } finally {
      if (leaseId) await window.desktop.sources.release(leaseId);
    }
  }

  async function prepareBoth(): Promise<void> {
    await Promise.all((["A", "B"] as const).map((slot) => prepare(slot)));
  }

  async function play(slot: DeckSlot): Promise<void> {
    try {
      await mixer.play(slot);
      setActiveDeck(slot);
      updateDeck(slot, { phase: "PLAYING", error: null });
    } catch (cause) {
      updateDeck(slot, { phase: "ERROR", error: readableError(cause, t, "mixer.prepareFailed") });
    }
  }

  async function mixAToB(): Promise<void> {
    setMixing(true);
    try {
      await mixer.crossfade("A", "B", 8);
      setActiveDeck("B");
      updateDeck("A", { phase: "READY" });
      updateDeck("B", { phase: "PLAYING" });
      window.setTimeout(() => setMixing(false), 8_000);
    } catch (cause) {
      setMixing(false);
      updateDeck("B", { phase: "ERROR", error: readableError(cause, t, "mixer.prepareFailed") });
    }
  }

  function stop(): void {
    mixer.stopAll();
    setActiveDeck(null);
    setMixing(false);
    setDecks((current) => ({
      A: { ...current.A, phase: current.A.source ? "READY" : current.A.phase },
      B: { ...current.B, phase: current.B.source ? "READY" : current.B.phase },
    }));
  }

  const bothReady = Boolean(decks.A.source && decks.B.source);
  const canPrepareBoth = Boolean(decks.A.url.trim() && decks.B.url.trim())
    && decks.A.phase !== "PREPARING" && decks.B.phase !== "PREPARING";

  function loadDemo(): void {
    stop();
    setDecks({
      A: { ...EMPTY_DECK, url: DEMO_URLS.A },
      B: { ...EMPTY_DECK, url: DEMO_URLS.B },
    });
  }

  return (
    <section className="panel real-mixer" aria-labelledby="real-mixer-title">
      <div className="real-mixer-heading">
        <div>
          <span className="eyebrow">{t("mixer.eyebrow")}</span>
          <h2 id="real-mixer-title">{t("mixer.title")}</h2>
          <p>{t("mixer.description")}</p>
        </div>
        <div className="mixer-heading-actions">
          <span className={`engine-state ${bothReady ? "passed" : "idle"}`}>
            {bothReady ? <CircleCheck size={14} /> : <Radio size={14} />}
            {bothReady ? t("mixer.decksReady") : t("mixer.waiting")}
          </span>
          <button className="secondary-button" onClick={loadDemo} type="button">{t("mixer.loadExample")}</button>
          <button className="primary-button" disabled={!canPrepareBoth} onClick={() => void prepareBoth()} type="button">
            <WandSparkles size={16} /> {t("mixer.prepareBoth")}
          </button>
        </div>
      </div>

      <div className="real-deck-grid">
        {(["A", "B"] as const).map((slot) => (
          <Deck key={slot} active={activeDeck === slot} deck={decks[slot]} onPrepare={() => void prepare(slot)} onUrlChange={(url) => updateDeck(slot, { url, phase: "EMPTY", source: null, error: null })} slot={slot} />
        ))}
      </div>

      <div className="mixer-console">
        <div className="mix-path" aria-label={t("mixer.mixPath")}>
          <span className={activeDeck === "A" ? "active" : ""}>A</span>
          <i><b style={{ width: mixing ? "100%" : activeDeck === "B" ? "100%" : "0%" }} /></i>
          <span className={activeDeck === "B" ? "active" : ""}>B</span>
        </div>
        <div className="console-actions">
          <button className="secondary-button" disabled={!decks.A.source} onClick={() => void play("A")} type="button"><Play size={15} fill="currentColor" /> {t("mixer.playA")}</button>
          <button className="primary-button" disabled={!bothReady || mixing} onClick={() => void mixAToB()} type="button"><Disc3 size={16} /> {mixing ? t("mixer.mixing") : t("mixer.mixAToB")}</button>
          <button className="ghost-button" disabled={!activeDeck} onClick={stop} type="button"><Pause size={15} /> {t("mixer.stop")}</button>
        </div>
      </div>

      <div className="mixer-note"><CircleAlert size={15} /><span>{t("mixer.note")}</span></div>
    </section>
  );
}

function Deck({ active, deck, onPrepare, onUrlChange, slot }: { active: boolean; deck: DeckState; onPrepare(): void; onUrlChange(url: string): void; slot: DeckSlot }) {
  const { t } = useI18n();
  const isPreparing = deck.phase === "PREPARING";
  return (
    <article className={`real-deck ${active ? "active" : ""}`}>
      <div className="real-deck-topline">
        <span>Deck {slot}</span>
        <Status phase={deck.phase} />
      </div>
      <label className="deck-source-field">
        <span>{t("mixer.videoUrl")}</span>
        <div>
          <input aria-label={t("mixer.sourceUrl", { slot })} disabled={isPreparing} onChange={(event) => onUrlChange(event.target.value)} placeholder={t("mixer.pasteUrl")} value={deck.url} />
          <button className="secondary-button" disabled={!deck.url.trim() || isPreparing} onClick={onPrepare} type="button">{isPreparing ? <LoaderCircle className="spin" size={15} /> : null}{isPreparing ? t("mixer.preparing") : t("mixer.prepareSlot", { slot })}</button>
        </div>
      </label>

      <div className="real-waveform" aria-hidden="true">
        {wave.map((height, index) => <i key={`${slot}-${index}`} style={{ height: `${slot === "B" ? Math.max(24, 100 - height) : height}%` }} />)}
        {active ? <span className="moving-playhead" /> : null}
      </div>

      {deck.source ? (
        <div className="track-summary">
          <div><strong>{displayTitle(deck.source.title, t)}</strong><span>{displayCreator(deck.source.creator, t)}</span></div>
          <time>{formatDuration(deck.source.durationSeconds)}</time>
        </div>
      ) : deck.error ? (
        <div className="deck-error" role="alert"><CircleAlert size={14} /><span>{deck.error}</span></div>
      ) : (
        <div className="deck-empty">{t("mixer.audioEmpty")}</div>
      )}
    </article>
  );
}

function Status({ phase }: { phase: DeckPhase }) {
  const { t } = useI18n();
  if (phase === "PREPARING") return <span className="deck-status working"><LoaderCircle className="spin" size={12} /> {t("mixer.downloading")}</span>;
  if (phase === "READY") return <span className="deck-status ready"><CircleCheck size={12} /> {t("mixer.ready")}</span>;
  if (phase === "PLAYING") return <span className="deck-status playing"><Radio size={12} /> {t("mixer.onAir")}</span>;
  if (phase === "ERROR") return <span className="deck-status error"><CircleAlert size={12} /> {t("common.error").toLowerCase()}</span>;
  return <span className="deck-status">{t("mixer.empty")}</span>;
}

function formatDuration(seconds: number): string {
  if (!seconds) return "—";
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}
