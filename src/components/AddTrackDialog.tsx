import { useEffect, useRef, useState, type FormEvent } from "react";
import { Check, ListEnd, ListStart, LoaderCircle, Search, X } from "lucide-react";
import type { QueuePlacement } from "../domain/queue-operations";
import { displayCreator, displayTitle } from "../i18n/content";
import { readableError } from "../i18n/errors";
import { useI18n } from "../i18n/i18n";
import type { YouTubeSource } from "../shared/contracts";
import { TrackArtwork } from "./TrackArtwork";

type AddTrackDialogProps = {
  existingIds: Set<string>;
  open: boolean;
  onAdd(track: YouTubeSource, placement: QueuePlacement): Promise<boolean>;
  onClose(): void;
};

export function AddTrackDialog({ existingIds, open, onAdd, onClose }: AddTrackDialogProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<YouTubeSource[]>([]);
  const [searching, setSearching] = useState(false);
  const [pendingActions, setPendingActions] = useState<Map<string, QueuePlacement>>(new Map());
  const pendingIds = useRef(new Set<string>());
  const generation = useRef(0);
  const panel = useRef<HTMLElement>(null);
  const close = useRef(onClose); close.current = onClose;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    generation.current++;
    const previous = document.activeElement;
    setQuery("");
    setResults([]);
    setSearching(false);
    pendingIds.current.clear();
    setPendingActions(new Map());
    setError(null);
    panel.current?.querySelector<HTMLInputElement>("input")?.focus();
    return () => {
      generation.current++;
      if (previous instanceof HTMLElement && previous.isConnected) {
        previous.focus();
        if (document.activeElement !== previous) document.querySelector<HTMLButtonElement>(".queue-toggle")?.focus();
      }
    };
  }, [open]);

  if (!open) return null;

  async function search(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!window.desktop || searching || query.trim().length < 2) return;
    const current = generation.current;
    setSearching(true);
    setError(null);
    try {
      const found = await window.desktop.sources.search(query.trim(), 10);
      if (current === generation.current) setResults(found);
    } catch (cause) {
      if (current === generation.current) setError(readableError(cause, t, "error.searchFailed"));
    } finally {
      if (current === generation.current) setSearching(false);
    }
  }

  async function add(track: YouTubeSource, placement: QueuePlacement): Promise<void> {
    if (existingIds.has(track.id) || pendingIds.current.has(track.id)) return;
    const current = generation.current;
    pendingIds.current.add(track.id);
    setPendingActions(actions => new Map(actions).set(track.id, placement));
    setError(null);
    try {
      const added = await onAdd(track, placement);
      if (!added && current === generation.current) setError(t("search.addFailed"));
    } catch (cause) {
      if (current === generation.current) setError(readableError(cause, t));
    } finally {
      if (current === generation.current) {
        pendingIds.current.delete(track.id);
        setPendingActions(actions => { const next = new Map(actions); next.delete(track.id); return next; });
      }
    }
  }

  return (
    <div className="dialog-backdrop track-search-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section aria-labelledby="add-track-title" aria-modal="true" className="dialog track-search-dialog" ref={panel} role="dialog" onKeyDown={event => {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close.current(); }
        if (event.key === "Tab") {
          const nodes = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)')];
          const first = nodes[0], last = nodes.at(-1);
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
      }}>
        <div className="dialog-heading">
          <div><span className="eyebrow">{t("search.catalog")}</span><h2 id="add-track-title">{t("search.addSongs")}</h2></div>
          <button aria-label={t("common.close")} className="icon-button" onClick={onClose} type="button"><X size={18} /></button>
        </div>

        <form className="track-search-form" onSubmit={(event) => void search(event)}>
          <div className="track-search-input"><Search size={16} /><input aria-label={t("search.placeholder")} onChange={(event) => setQuery(event.target.value)} placeholder={t("search.placeholder")} value={query} /></div>
          <button className="primary-button" disabled={searching || query.trim().length < 2} type="submit">{searching ? <LoaderCircle className="spin" size={15} /> : <Search size={15} />} {t("common.search")}</button>
        </form>

        {error ? <div className="form-error" role="alert">{error}</div> : null}

        <div className="track-search-results" aria-live="polite">
          {results.length ? results.map((track) => {
            const alreadyAdded = existingIds.has(track.id);
            const pending = pendingActions.get(track.id);
            return (
              <article className="track-search-result" key={track.id}>
                <TrackArtwork className="track-thumbnail" track={track} />
                <div><strong>{displayTitle(track.title, t)}</strong><span>{displayCreator(track.creator, t)} · {formatDuration(track.durationSeconds)}</span></div>
                <div className="track-result-actions" role="group" aria-label={t("search.actionsFor", { title: displayTitle(track.title, t) })}>
                  {alreadyAdded ? <span className="track-in-queue" role="status"><Check size={14} />{t("search.inQueue")}</span> : <>
                    <button aria-label={t("search.nextFor", { title: displayTitle(track.title, t) })} className="secondary-button" data-placement="NEXT" disabled={!!pending} onClick={() => void add(track, "NEXT")} title={t("search.afterCurrent")} type="button">
                      {pending === "NEXT" ? <LoaderCircle className="spin" size={14} /> : <ListStart size={14} />}{t(pending === "NEXT" ? "search.adding" : "search.playNext")}
                    </button>
                    <button aria-label={t("search.endFor", { title: displayTitle(track.title, t) })} className="secondary-button" data-placement="END" disabled={!!pending} onClick={() => void add(track, "END")} type="button">
                      {pending === "END" ? <LoaderCircle className="spin" size={14} /> : <ListEnd size={14} />}{t(pending === "END" ? "search.adding" : "search.addToEnd")}
                    </button>
                  </>}
                </div>
              </article>
            );
          }) : <div className="track-search-empty"><Search size={22} /><span>{searching ? t("search.searching") : t("search.empty")}</span></div>}
        </div>
      </section>
    </div>
  );
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}
