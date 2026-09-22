import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Languages } from "lucide-react";
import { useI18n } from "../i18n/i18n";
import type { LanguagePreference } from "../shared/contracts";

const OPTIONS: LanguagePreference[] = ["system", "en", "es"];

export function LanguageSelector({ placement = "topbar" }: { placement?: "topbar" | "connectivity" }) {
  const { locale, preference, setLanguagePreference, systemLocale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const areaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!areaRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  function label(option: LanguagePreference): { title: string; detail?: string } {
    if (option === "system") return {
      title: t("language.system"),
      detail: t("language.systemDetail", {
        language: systemLocale === "es" ? t("language.currentSpanish") : t("language.currentEnglish"),
      }),
    };
    return { title: option === "es" ? t("language.spanish") : t("language.english") };
  }

  return (
    <div className={`language-selector ${placement}`} ref={areaRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t("language.selectorLabel")}
        className="language-trigger"
        onClick={() => setOpen((current) => !current)}
        title={t("language.selectorLabel")}
        type="button"
      >
        <Languages size={16} />
        <span>{preference === "system" ? `AUTO · ${locale.toUpperCase()}` : locale.toUpperCase()}</span>
        <ChevronDown size={13} />
      </button>
      {open ? (
        <div aria-label={t("language.menuLabel")} className="language-menu" role="menu">
          {OPTIONS.map((option) => {
            const copy = label(option);
            return (
              <button
                aria-checked={preference === option}
                className={preference === option ? "selected" : ""}
                key={option}
                onClick={() => {
                  setOpen(false);
                  void setLanguagePreference(option).catch((cause) => console.warn("[locale] preference-save-failed", cause));
                }}
                role="menuitemradio"
                type="button"
              >
                <span><strong>{copy.title}</strong>{copy.detail ? <small>{copy.detail}</small> : null}</span>
                {preference === option ? <Check size={15} /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
