import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { AppState, LanguagePreference, SupportedLocale } from "../shared/contracts";
import { resolveLocale } from "./locale";
import { en } from "./locales/en";
import { es, type TranslationKey } from "./locales/es";

type TranslationValues = Record<string, string | number>;
export type Translate = (key: TranslationKey, values?: TranslationValues) => string;

type I18nContextValue = {
  appState: AppState;
  locale: SupportedLocale;
  preference: LanguagePreference;
  systemLocale: SupportedLocale;
  setLanguagePreference(preference: LanguagePreference): Promise<void>;
  setLastSelectedDjId(id: string | null): Promise<void>;
  t: Translate;
};

const DEFAULT_APP_STATE: AppState = {
  schemaVersion: 2,
  lastSelectedDjId: null,
  languagePreference: "system",
  updatedAt: new Date(0).toISOString(),
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [appState, setAppState] = useState<AppState | null>(null);
  const [preferredLanguages, setPreferredLanguages] = useState<string[]>(() => browserLanguages());
  const stateRef = useRef<AppState>(DEFAULT_APP_STATE);
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let active = true;
    void Promise.all([
      window.desktop?.appState.load() ?? Promise.resolve(DEFAULT_APP_STATE),
      window.desktop?.locale.getPreferredLanguages() ?? Promise.resolve(browserLanguages()),
    ]).then(([storedState, systemLanguages]) => {
      if (!active) return;
      stateRef.current = storedState;
      setAppState(storedState);
      setPreferredLanguages(systemLanguages.length ? systemLanguages : browserLanguages());
    }).catch((cause) => {
      console.warn("[locale] bootstrap-failed", cause);
      if (!active) return;
      stateRef.current = DEFAULT_APP_STATE;
      setAppState(DEFAULT_APP_STATE);
    });
    return () => { active = false; };
  }, []);

  const preference = appState?.languagePreference ?? "system";
  const systemLocale = resolveLocale("system", preferredLanguages);
  const locale = resolveLocale(preference, preferredLanguages);

  useEffect(() => {
    if (!appState) return;
    document.documentElement.lang = locale;
    document.title = "NeoAres";
    void window.desktop?.locale.apply(locale).catch((cause) => console.warn("[locale] native-menu-update-failed", cause));
  }, [appState, locale]);

  function updateAppState(patch: Partial<Pick<AppState, "lastSelectedDjId" | "languagePreference">>): Promise<void> {
    const next: AppState = {
      ...stateRef.current,
      ...patch,
      schemaVersion: 2,
      updatedAt: new Date().toISOString(),
    };
    stateRef.current = next;
    setAppState(next);
    if (!window.desktop) return Promise.resolve();
    saveChainRef.current = saveChainRef.current
      .catch(() => undefined)
      .then(() => window.desktop!.appState.save(next));
    return saveChainRef.current;
  }

  const value = useMemo<I18nContextValue>(() => {
    const catalog = locale === "es" ? es : en;
    const t: Translate = (key, values) => interpolate(catalog[key], values);
    return {
      appState: appState ?? DEFAULT_APP_STATE,
      locale,
      preference,
      systemLocale,
      setLanguagePreference: (nextPreference) => updateAppState({ languagePreference: nextPreference }),
      setLastSelectedDjId: (id) => updateAppState({ lastSelectedDjId: id }),
      t,
    };
  }, [appState, locale, preference, systemLocale]);

  if (!appState) return <div aria-busy="true" className="app-bootstrap"><span /></div>;
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error("I18N_PROVIDER_MISSING");
  return value;
}

function interpolate(template: string, values?: TranslationValues): string {
  if (!values) return template;
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key: string) => {
    const value = values[key];
    return value === undefined ? match : String(value);
  });
}

function browserLanguages(): string[] {
  if (typeof navigator === "undefined") return ["en"];
  return navigator.languages?.length ? [...navigator.languages] : [navigator.language || "en"];
}
