import { useEffect, useState, type FormEvent } from "react";
import { Check, ListEnd, ListStart, LoaderCircle, Music2, Plus, Search, X } from "lucide-react";
import type { QueuePlacement } from "../domain/queue-operations";
import type { YouTubeSource } from "../shared/contracts";

type AddTrackDialogProps = {
  existingIds: Set<string>;
  open: boolean;
  onAdd(track: YouTubeSource, placement: QueuePlacement): Promise<boolean>;
  onClose(): void;
};

export function AddTrackDialog({ existingIds, open, onAdd, onClose }: AddTrackDialogProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<YouTubeSource[]>([]);
  const [placement, setPlacement] = useState<QueuePlacement>("END");
  const [searching, setSearching] = useState(false);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setResults([]);
    setPlacement("END");
    setPendingIds(new Set());
    setError(null);
  }, [open]);

  if (!open) return null;

  async function search(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!window.desktop || query.trim().length < 2) return;
    setSearching(true);
    setError(null);
    try {
      setResults(await window.desktop.sources.search(query.trim(), 10));
    } catch (cause) {
      setError(readableError(cause));
    } finally {
      setSearching(false);
    }
  }

  async function add(track: YouTubeSource): Promise<void> {
    setPendingIds((current) => new Set([...current, track.id]));
    setError(null);
    try {
      if (!await onAdd(track, placement)) setError("No se pudo agregar la canción en este momento.");
    } catch (cause) {
      setError(readableError(cause));
    } finally {
      setPendingIds((current) => {
        const next = new Set(current);
        next.delete(track.id);
        return next;
      });
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section aria-labelledby="add-track-title" aria-modal="true" className="dialog track-search-dialog" role="dialog">
        <div className="dialog-heading">
          <div><span className="eyebrow">Catálogo musical</span><h2 id="add-track-title">Agregar canciones</h2></div>
          <button aria-label="Cerrar" className="icon-button" onClick={onClose} type="button"><X size={18} /></button>
        </div>

        <form className="track-search-form" onSubmit={(event) => void search(event)}>
          <div className="track-search-input"><Search size={16} /><input autoFocus onChange={(event) => setQuery(event.target.value)} placeholder="Busca una canción o artista…" value={query} /></div>
          <button className="primary-button" disabled={searching || query.trim().length < 2} type="submit">{searching ? <LoaderCircle className="spin" size={15} /> : <Search size={15} />} Buscar</button>
        </form>

        <div className="placement-picker" aria-label="Dónde agregar la canción" role="group">
          <button className={placement === "NEXT" ? "active" : ""} onClick={() => setPlacement("NEXT")} type="button"><ListStart size={14} /> Después de la actual</button>
          <button className={placement === "END" ? "active" : ""} onClick={() => setPlacement("END")} type="button"><ListEnd size={14} /> Al final</button>
        </div>

        {error ? <div className="form-error" role="alert">{error}</div> : null}

        <div className="track-search-results" aria-live="polite">
          {results.length ? results.map((track) => {
            const alreadyAdded = existingIds.has(track.id);
            const isPending = pendingIds.has(track.id);
            return (
              <article className="track-search-result" key={track.id}>
                <div className="track-thumbnail">
                  {track.thumbnailUrl ? <img alt="" loading="lazy" referrerPolicy="no-referrer" src={track.thumbnailUrl} /> : <Music2 size={18} />}
                </div>
                <div><strong>{track.title}</strong><span>{track.creator} · {formatDuration(track.durationSeconds)}</span></div>
                <button className="secondary-button" disabled={alreadyAdded || isPending} onClick={() => void add(track)} type="button">
                  {alreadyAdded ? <><Check size={14} /> En cola</> : isPending ? <><LoaderCircle className="spin" size={14} /> Agregando</> : <><Plus size={14} /> Agregar</>}
                </button>
              </article>
            );
          }) : <div className="track-search-empty"><Search size={22} /><span>{searching ? "Buscando canciones…" : "Busca por canción, artista o ambos."}</span></div>}
        </div>
      </section>
    </div>
  );
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

function readableError(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : "No se pudo completar la búsqueda.";
  return message.replace(/^Error invoking remote method '[^']+': Error: /, "");
}
