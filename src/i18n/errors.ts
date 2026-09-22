import type { Translate } from "./i18n";
import type { TranslationKey } from "./locales/es";

const ERROR_KEYS: Record<string, TranslationKey> = {
  SOURCE_SEARCH_EMPTY: "error.sourceSearchEmpty",
  SOURCE_URL_INVALID: "error.invalidCatalogUrl",
  SOURCE_METADATA_INVALID: "error.invalidMetadata",
  SOURCE_AUDIO_FILE_MISSING: "error.noAudioFile",
  SOURCE_PATH_OUTSIDE_CACHE: "error.sourceOutsideCache",
  SOURCE_PREPARED_UNAVAILABLE: "error.preparedUnavailable",
  SOURCE_REFERENCE_INVALID: "error.invalidSource",
  DECK_LOAD_SUPERSEDED: "error.deckLoadSuperseded",
  DECK_NOT_READY: "error.deckNotReady",
  NO_PLAYABLE_TRACK: "error.noPlayableTrack",
  SOURCE_PREPARATION_TIMEOUT: "error.preparationTimeout",
  SOURCE_SEARCH_TIMEOUT: "error.searchTimeout",
  SOURCE_RESPONSE_TOO_LARGE: "error.sourceResponseTooLarge",
  SOURCE_TOOL_FAILED: "error.sourceToolFailed",
  DJ_PROFILE_INVALID: "error.profileInvalid",
};

export function readableError(cause: unknown, t: Translate, fallback: TranslationKey = "error.unknown"): string {
  const rawMessage = cause instanceof Error ? cause.message : "";
  const message = rawMessage.replace(/^Error invoking remote method '[^']+': Error: /, "");
  const key = ERROR_KEYS[message];
  if (key) return t(key);
  if (/^[A-Z][A-Z0-9_]*(?::|$)/.test(message)) return t(fallback);
  return message || t(fallback);
}
