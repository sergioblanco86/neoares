import type { YouTubeSource } from "../shared/contracts";
import { normalizeSearchText } from "./search-strategy";

export const ARTIST_DIVERSITY_WINDOW_SIZE = 10;
export const MAX_PRIMARY_ARTIST_OCCURRENCES = 2;

export function primaryArtistKey(source: YouTubeSource): string {
  const metadataArtist = source.musicMetadata?.artists.find((artist) => artist.trim().length > 0);
  const titleArtist = extractTitleArtist(source.title);
  const creator = cleanCreator(source.creator);
  return normalizeSearchText(metadataArtist ?? titleArtist ?? creator);
}

export function canAppendAutonomousTrack(
  queue: readonly YouTubeSource[],
  candidate: YouTubeSource,
): boolean {
  if (candidate.requestedByUser === true) return true;
  return respectsArtistDiversityAtIndex([...queue, candidate], queue.length);
}

export function canReplaceWithAutonomousTrack(
  queue: readonly YouTubeSource[],
  index: number,
  candidate: YouTubeSource,
): boolean {
  if (index < 0 || index >= queue.length) return false;
  if (candidate.requestedByUser === true) return true;
  const prospective = [...queue];
  prospective[index] = candidate;
  return respectsArtistDiversityAtIndex(prospective, index);
}

export function pruneUpcomingArtistDuplicates(
  queue: readonly YouTubeSource[],
  currentIndex: number,
): YouTubeSource[] {
  const protectedEnd = Math.min(queue.length, Math.max(0, currentIndex + 1));
  const result = queue.slice(0, protectedEnd);
  for (const track of queue.slice(protectedEnd)) {
    if (canAppendAutonomousTrack(result, track)) result.push(track);
  }
  return result;
}

function respectsArtistDiversityAtIndex(queue: readonly YouTubeSource[], index: number): boolean {
  const artistKey = primaryArtistKey(queue[index]);
  if (!artistKey) return true;

  const earliestWindowStart = Math.max(0, index - ARTIST_DIVERSITY_WINDOW_SIZE + 1);
  for (let start = earliestWindowStart; start <= index; start += 1) {
    const window = queue.slice(start, start + ARTIST_DIVERSITY_WINDOW_SIZE);
    if (index >= start + window.length) continue;
    const occurrences = window.reduce(
      (count, track) => count + (primaryArtistKey(track) === artistKey ? 1 : 0),
      0,
    );
    if (occurrences > MAX_PRIMARY_ARTIST_OCCURRENCES) return false;
  }
  return true;
}

function extractTitleArtist(title: string): string | null {
  const match = title.match(/^(.+?)(?:\s+[-–—]\s+|:\s+)/);
  return match?.[1]?.trim() || null;
}

function cleanCreator(creator: string): string {
  return creator
    .replace(/\s+-\s+topic$/i, "")
    .replace(/\s+official$/i, "")
    .replace(/vevo$/i, "")
    .trim();
}
