import type { LanguagePreference, SupportedLocale } from "../shared/contracts";

export const SUPPORTED_LOCALES: readonly SupportedLocale[] = ["en", "es"];

export function resolveLocale(preference: LanguagePreference, preferredLanguages: readonly string[]): SupportedLocale {
  if (preference !== "system") return preference;
  for (const language of preferredLanguages) {
    const normalized = language.trim().toLowerCase().split(/[-_]/)[0];
    if (normalized === "en" || normalized === "es") return normalized;
  }
  return "en";
}
