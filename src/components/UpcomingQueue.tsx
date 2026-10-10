import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpToLine, Grip, ListPlus, RefreshCw, Trash2 } from "lucide-react";
import { displayCreator, displayTitle } from "../i18n/content";
import { useI18n } from "../i18n/i18n";
import type { YouTubeSource } from "../shared/contracts";
import type { PreparationStatus } from "../domain/upcoming-preparation";
import { TrackArtwork } from "./TrackArtwork";
import { FloatingQueueMenu } from "./FloatingQueueMenu";

type UpcomingQueueProps = {
  addDisabled: boolean;
  busyLabel: string | null;
  disabled: boolean;
  nextReady: boolean;
  preparationStatuses?: Record<string, PreparationStatus>;
  tracks: YouTubeSource[];
  onAdd(): void;
  onMove(fromIndex: number, toIndex: number): void;
  onRefreshAll(): void;
  onRemove(index: number): void;
  onReplace(index: number): void;
};

export function UpcomingQueue({ addDisabled, busyLabel, disabled, nextReady, preparationStatuses = {}, tracks, onAdd, onMove, onRefreshAll, onRemove, onReplace }: UpcomingQueueProps) {
  const { t } = useI18n();
  const [openMenu, setOpenMenu] = useState<number | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const menuAreaRef = useRef<HTMLDivElement>(null);
  const menuAnchorRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const closeMenu = (event: PointerEvent) => {
      if (!menuAreaRef.current?.contains(event.target as Node) && !(event.target as Element).closest(".queue-floating-menu")) setOpenMenu(null);
    };
    document.addEventListener("pointerdown", closeMenu);
    const key = (event: KeyboardEvent) => { if (event.key === "Escape" && openMenu !== null) { event.preventDefault(); event.stopPropagation(); setOpenMenu(null); } };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", closeMenu); document.removeEventListener("keydown", key); };
  }, [openMenu]);

  function move(fromIndex: number, toIndex: number): void {
    setOpenMenu(null);
    if (fromIndex !== toIndex) onMove(fromIndex, toIndex);
  }

  return (
    <div className="auto-queue" ref={menuAreaRef}>
      <div className="auto-queue-title">
        <div><span>{t("queue.upNext")}</span><small>{tracks.length ? t("queue.count", { count: tracks.length }) : t("queue.createdOnStart")}</small></div>
        <div className="queue-toolbar">
          <button className="queue-tool-button" disabled={addDisabled} onClick={onAdd} type="button"><ListPlus size={14} /> {t("common.add")}</button>
          <button aria-label={t("queue.changeAllLabel")} className="queue-tool-button" disabled={disabled || tracks.length === 0} onClick={onRefreshAll} title={t("queue.findOtherFour")} type="button"><RefreshCw className={busyLabel ? "spin" : ""} size={14} /> {t("queue.changeFour")}</button>
        </div>
      </div>

      {busyLabel ? <div className="queue-busy"><RefreshCw className="spin" size={12} /> {busyLabel}</div> : null}

      {tracks.length ? (
        <div className="auto-queue-list">
          {tracks.map((track, index) => (
            <div
              className={`auto-queue-item${draggedIndex === index ? " dragging" : ""}${dragOverIndex === index ? " drag-over" : ""}`}
              key={track.id}
              onDragEnd={() => { setDraggedIndex(null); setDragOverIndex(null); }}
              onDragOver={(event) => { if (!disabled) { event.preventDefault(); setDragOverIndex(index); } }}
              onDragStart={(event) => { setDraggedIndex(index); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", String(index)); }}
              onDrop={(event) => {
                event.preventDefault();
                const value = event.dataTransfer.getData("text/plain");
                const fromIndex = Number(value);
                setDraggedIndex(null);
                setDragOverIndex(null);
                if (!disabled && value !== "" && Number.isInteger(fromIndex) && fromIndex >= 0 && fromIndex < tracks.length) move(fromIndex, index);
              }}
            >
              <TrackArtwork className="queue-track-artwork" track={track} />
              <div className="queue-track-copy"><strong>{displayTitle(track.title, t)}</strong><small>{displayCreator(track.creator, t)}</small></div>
              <em className={preparationStatuses[track.id] === "ready" || (index === 0 && nextReady) ? "queue-ready-status" : ""} data-preparation={preparationStatuses[track.id] ?? "queued"}>{preparationStatuses[track.id] === "ready" || (index === 0 && nextReady) ? t("queue.ready") : preparationStatuses[track.id] === "failed" ? t("queue.failed") : preparationStatuses[track.id] === "preparing" ? t("queue.preparing") : t("queue.queued")}</em>
              <div className="queue-menu-wrap">
                <button draggable={!disabled} aria-expanded={openMenu === index} aria-haspopup="menu" aria-label={t("queue.optionsFor", { title: displayTitle(track.title, t) })} className="queue-menu-trigger" disabled={disabled} onClick={event => { menuAnchorRef.current = event.currentTarget; setOpenMenu((current) => current === index ? null : index); }} title={t("queue.dragToReorder")} type="button"><Grip size={18} /></button>
                {openMenu === index ? (
                  <FloatingQueueMenu anchor={menuAnchorRef.current} onClose={() => setOpenMenu(null)}>
                    <button onClick={() => { setOpenMenu(null); onReplace(index); }} role="menuitem" type="button"><RefreshCw size={13} /> {t("queue.replace")}</button>
                    <button disabled={index === 0} onClick={() => move(index, 0)} role="menuitem" type="button"><ArrowUpToLine size={13} /> {t("queue.moveFirst")}</button>
                    <button disabled={index === 0} onClick={() => move(index, index - 1)} role="menuitem" type="button"><ArrowUp size={13} /> {t("queue.moveUp")}</button>
                    <button disabled={index === tracks.length - 1} onClick={() => move(index, index + 1)} role="menuitem" type="button"><ArrowDown size={13} /> {t("queue.moveDown")}</button>
                    {tracks.length > 4 ? <button className="danger" onClick={() => { setOpenMenu(null); onRemove(index); }} role="menuitem" type="button"><Trash2 size={13} /> {t("queue.remove")}</button> : null}
                  </FloatingQueueMenu>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : <div className="queue-placeholder">{t("queue.placeholder")}</div>}
    </div>
  );
}
