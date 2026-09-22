import { useEffect, useRef, useState } from "react";
import { AudioLines, CircleAlert, MoreHorizontal, PanelLeftClose, Pencil, Plus, Trash2 } from "lucide-react";
import neoAresIcon from "../../logos/icon.png";
import type { DjProfile } from "../shared/contracts";

type SidebarProps = {
  djs: DjProfile[];
  loadState: "LOADING" | "READY" | "ERROR";
  selectedId: string | null;
  onClose(): void;
  onCreate(): void;
  onDelete(dj: DjProfile): void;
  onEdit(dj: DjProfile): void;
  onRetry(): void;
  onSelect(dj: DjProfile): void;
};

export function Sidebar({ djs, loadState, selectedId, onClose, onCreate, onDelete, onEdit, onRetry, onSelect }: SidebarProps) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuAreaRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const closeMenu = (event: PointerEvent) => {
      if (!menuAreaRef.current?.contains(event.target as Node)) setOpenMenuId(null);
    };
    document.addEventListener("pointerdown", closeMenu);
    return () => document.removeEventListener("pointerdown", closeMenu);
  }, []);

  return (
    <aside aria-label="DJs" className="sidebar" ref={menuAreaRef}>
      <div className="sidebar-brand-row">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true"><img alt="" src={neoAresIcon} /></div>
          <div><strong>NeoAres</strong><span>Cabina privada</span></div>
        </div>
        <button aria-label="Ocultar DJs" className="icon-button sidebar-close" onClick={onClose} title="Ocultar sidebar" type="button"><PanelLeftClose size={17} /></button>
      </div>

      <div className="sidebar-section-heading">
        <div><span className="eyebrow">Biblioteca</span><h2>Mis DJs</h2></div>
        <button aria-label="Crear DJ" className="sidebar-add-button" onClick={onCreate} title="Nuevo DJ" type="button"><Plus size={16} /></button>
      </div>

      <div className="sidebar-dj-list">
        {loadState === "LOADING" ? [0, 1, 2, 3].map((item) => <div className="sidebar-dj-skeleton" key={item} />) : null}
        {loadState === "ERROR" ? (
          <div className="sidebar-error"><CircleAlert size={18} /><span>No pudimos abrir tus DJs.</span><button onClick={onRetry} type="button">Reintentar</button></div>
        ) : null}
        {loadState === "READY" && djs.length === 0 ? (
          <div className="sidebar-empty"><AudioLines size={20} /><strong>Aún no tienes DJs</strong><span>Crea el primero para comenzar.</span></div>
        ) : null}
        {loadState === "READY" ? djs.map((dj) => (
          <div className={`sidebar-dj${dj.id === selectedId ? " selected" : ""}`} key={dj.id}>
            <button className="sidebar-dj-select" onClick={() => onSelect(dj)} type="button">
              <span className="sidebar-dj-icon" aria-hidden="true"><AudioLines size={16} /></span>
              <span className="sidebar-dj-copy"><strong>{dj.name}</strong><small>{dj.intent.genres.slice(0, 2).join(" · ") || "DJ personal"}</small></span>
            </button>
            <div className="sidebar-dj-menu-wrap">
              <button aria-expanded={openMenuId === dj.id} aria-haspopup="menu" aria-label={`Opciones para ${dj.name}`} className="sidebar-dj-menu-trigger" onClick={() => setOpenMenuId((current) => current === dj.id ? null : dj.id)} type="button"><MoreHorizontal size={16} /></button>
              {openMenuId === dj.id ? (
                <div className="sidebar-dj-menu" role="menu">
                  <button onClick={() => { setOpenMenuId(null); onEdit(dj); }} role="menuitem" type="button"><Pencil size={14} /> Editar DJ</button>
                  <button className="danger" onClick={() => { setOpenMenuId(null); onDelete(dj); }} role="menuitem" type="button"><Trash2 size={14} /> Eliminar DJ</button>
                </div>
              ) : null}
            </div>
          </div>
        )) : null}
      </div>

      <button className="sidebar-create-wide" onClick={onCreate} type="button"><Plus size={16} /> Nuevo DJ</button>
    </aside>
  );
}
