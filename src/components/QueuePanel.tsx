import { CircleCheck, Clock4, GripVertical, ListMusic, LoaderCircle } from "lucide-react";
import { useI18n } from "../i18n/i18n";

const queue = [
  { title: "Rebelión", artist: "Joe Arroyo", bpm: "104 BPM", state: "ready", ready: true },
  { title: "Cali Pachanguero", artist: "Grupo Niche", bpm: "101 BPM", state: "analyzing", ready: false },
  { title: "Periódico de Ayer", artist: "Héctor Lavoe", bpm: "98 BPM", state: "reserve", ready: false },
];

export function QueuePanel() {
  const { t } = useI18n();
  return (
    <section className="panel queue-panel" aria-labelledby="queue-title">
      <div className="panel-heading compact">
        <div>
          <span className="eyebrow">{t("queuePanel.continuity")}</span>
          <h2 id="queue-title">{t("queue.upNext")}</h2>
        </div>
        <span className="queue-count">{t("queue.count", { count: 3 })}</span>
      </div>

      <div className="queue-list">
        {queue.map((item, index) => (
          <div className="queue-item" key={item.title}>
            <GripVertical className="grip" size={16} aria-hidden="true" />
            <span className="queue-index">{String(index + 1).padStart(2, "0")}</span>
            <div className="queue-copy">
              <strong>{item.title}</strong>
              <span>{item.artist}</span>
            </div>
            <div className="queue-metadata">
              <span>{item.bpm}</span>
              <small className={item.ready ? "ready" : ""}>
                {item.ready ? <CircleCheck size={13} /> : index === 1 ? <LoaderCircle size={13} /> : <Clock4 size={13} />}
                {item.state === "ready" ? t("queue.ready") : item.state === "analyzing" ? t("queuePanel.analyzing") : t("queuePanel.reserve")}
              </small>
            </div>
          </div>
        ))}
      </div>

      <div className="queue-note">
        <ListMusic size={16} />
        {t("queuePanel.note")}
      </div>
    </section>
  );
}
