import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Menus escape the queue scroller; even a 360px window can expose every action. */
export function FloatingQueueMenu({ anchor, children, onClose }: { anchor: HTMLElement | null; children: ReactNode; onClose(): void }) {
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 8, top: 8 });
  useLayoutEffect(() => {
    const place = () => {
      if (!anchor || !menu.current) return;
      const box = anchor.getBoundingClientRect(), rect = menu.current.getBoundingClientRect();
      setPosition({ left: Math.max(8, Math.min(box.right - rect.width, innerWidth - rect.width - 8)), top: Math.max(8, Math.min(box.bottom, innerHeight - rect.height - 8)) });
    };
    place(); menu.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    window.addEventListener("resize", onClose);
    return () => { window.removeEventListener("resize", onClose); if (anchor?.isConnected) anchor.focus(); };
  }, [anchor]);
  return createPortal(<div className="queue-item-menu queue-floating-menu" ref={menu} role="menu" style={position} onKeyDown={event => {
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    }
    if (event.key === "Escape" || event.key === "Tab") { event.preventDefault(); event.stopPropagation(); onClose(); }
  }}>{children}</div>, document.body);
}
