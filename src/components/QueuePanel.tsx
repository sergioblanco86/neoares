import { CircleCheck, Clock4, GripVertical, ListMusic, LoaderCircle } from "lucide-react";

const queue = [
  { title: "Rebelión", artist: "Joe Arroyo", bpm: "104 BPM", state: "Preparada", ready: true },
  { title: "Cali Pachanguero", artist: "Grupo Niche", bpm: "101 BPM", state: "Analizando", ready: false },
  { title: "Periódico de Ayer", artist: "Héctor Lavoe", bpm: "98 BPM", state: "En reserva", ready: false },
];

export function QueuePanel() {
  return (
    <section className="panel queue-panel" aria-labelledby="queue-title">
      <div className="panel-heading compact">
        <div>
          <span className="eyebrow">Continuidad</span>
          <h2 id="queue-title">Próximas</h2>
        </div>
        <span className="queue-count">3 en cola</span>
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
                {item.state}
              </small>
            </div>
          </div>
        ))}
      </div>

      <div className="queue-note">
        <ListMusic size={16} />
        El orquestador conservará dos pistas listas antes de cada transición.
      </div>
    </section>
  );
}
