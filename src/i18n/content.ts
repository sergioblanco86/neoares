import type { Translate } from "./i18n";

export function displayCreator(creator: string, t: Translate): string {
  return creator === "UNKNOWN_CREATOR" || creator === "Catálogo musical"
    ? t("search.unknownArtist")
    : creator;
}

export function displayTitle(title: string, t: Translate): string {
  return title === "UNTITLED_VIDEO" || title === "Video sin título"
    ? t("search.untitled")
    : title;
}
