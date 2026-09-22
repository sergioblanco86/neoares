import { Activity, Check, LoaderCircle, Play, RadioTower } from "lucide-react";
import { useI18n } from "../i18n/i18n";

type DeckPanelProps = {
  onTest(): Promise<void>;
  testState: "IDLE" | "RUNNING" | "PASSED" | "FAILED";
};

const wave = [26, 45, 62, 38, 74, 52, 88, 64, 44, 79, 58, 36, 67, 47, 82, 55, 32, 71, 48, 60, 39, 75, 51, 30];

export function DeckPanel({ onTest, testState }: DeckPanelProps) {
  const { t } = useI18n();
  return (
    <section className="panel deck-panel" aria-labelledby="deck-title">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">{t("deckPanel.localEngine")}</span>
          <h2 id="deck-title">{t("deckPanel.twoDecks")}</h2>
        </div>
        <span className={`engine-state ${testState.toLowerCase()}`}>
          {testState === "RUNNING" ? <LoaderCircle size={14} className="spin" /> : null}
          {testState === "PASSED" ? <Check size={14} /> : null}
          {testState === "IDLE" ? <Activity size={14} /> : null}
          {testState === "FAILED" ? <RadioTower size={14} /> : null}
          {testState === "IDLE" ? t("deckPanel.untested") : testState === "RUNNING" ? t("deckPanel.mixing") : testState === "PASSED" ? t("deckPanel.passed") : t("deckPanel.attention")}
        </span>
      </div>

      <div className="deck-stage">
        <div className="deck-meta">
          <span>Deck A</span>
          <strong>220 Hz</strong>
          <small>MASTER</small>
        </div>
        <div className="waveform" aria-label={t("deckPanel.waveformA")}>
          {wave.map((height, index) => (
            <i key={`a-${index}`} style={{ height: `${height}%` }} />
          ))}
          <span className="playhead" />
        </div>
        <span className="deck-time">00:02.6</span>
      </div>

      <div className="deck-stage incoming">
        <div className="deck-meta">
          <span>Deck B</span>
          <strong>329.63 Hz</strong>
          <small>CUED</small>
        </div>
        <div className="waveform" aria-label={t("deckPanel.waveformB")}>
          {[...wave].reverse().map((height, index) => (
            <i key={`b-${index}`} style={{ height: `${Math.max(22, height - 8)}%` }} />
          ))}
        </div>
        <span className="deck-time">−00:01.4</span>
      </div>

      <div className="deck-footer">
        <div className="transition-readout">
          <span>{t("deckPanel.transition")}</span>
          <strong>Equal power · 1.4 s</strong>
        </div>
        <button className="secondary-button" disabled={testState === "RUNNING"} onClick={() => void onTest()} type="button">
          <Play size={16} fill="currentColor" />
          {testState === "RUNNING" ? t("deckPanel.running") : t("deckPanel.testMix")}
        </button>
      </div>
    </section>
  );
}
