import { Activity, Check, LoaderCircle, Play, RadioTower } from "lucide-react";

type DeckPanelProps = {
  onTest(): Promise<void>;
  testState: "IDLE" | "RUNNING" | "PASSED" | "FAILED";
};

const wave = [26, 45, 62, 38, 74, 52, 88, 64, 44, 79, 58, 36, 67, 47, 82, 55, 32, 71, 48, 60, 39, 75, 51, 30];

export function DeckPanel({ onTest, testState }: DeckPanelProps) {
  return (
    <section className="panel deck-panel" aria-labelledby="deck-title">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Motor local</span>
          <h2 id="deck-title">Dos decks preparados</h2>
        </div>
        <span className={`engine-state ${testState.toLowerCase()}`}>
          {testState === "RUNNING" ? <LoaderCircle size={14} className="spin" /> : null}
          {testState === "PASSED" ? <Check size={14} /> : null}
          {testState === "IDLE" ? <Activity size={14} /> : null}
          {testState === "FAILED" ? <RadioTower size={14} /> : null}
          {testState === "IDLE" ? "Sin probar" : testState === "RUNNING" ? "Mezclando" : testState === "PASSED" ? "Prueba superada" : "Necesita atención"}
        </span>
      </div>

      <div className="deck-stage">
        <div className="deck-meta">
          <span>Deck A</span>
          <strong>220 Hz</strong>
          <small>MASTER</small>
        </div>
        <div className="waveform" aria-label="Representación del deck A">
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
        <div className="waveform" aria-label="Representación del deck B">
          {[...wave].reverse().map((height, index) => (
            <i key={`b-${index}`} style={{ height: `${Math.max(22, height - 8)}%` }} />
          ))}
        </div>
        <span className="deck-time">−00:01.4</span>
      </div>

      <div className="deck-footer">
        <div className="transition-readout">
          <span>Transición</span>
          <strong>Equal power · 1.4 s</strong>
        </div>
        <button className="secondary-button" disabled={testState === "RUNNING"} onClick={() => void onTest()} type="button">
          <Play size={16} fill="currentColor" />
          {testState === "RUNNING" ? "Ejecutando…" : "Probar mezcla"}
        </button>
      </div>
    </section>
  );
}
