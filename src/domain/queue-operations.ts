import type { YouTubeSource } from "../shared/contracts";

export type QueuePlacement = "NEXT" | "END";

export function getUpcoming(queue: YouTubeSource[], currentIndex: number): YouTubeSource[] {
  return queue.slice(currentIndex + 1);
}

export function setUpcoming(queue: YouTubeSource[], currentIndex: number, upcoming: YouTubeSource[]): YouTubeSource[] {
  return [...queue.slice(0, currentIndex + 1), ...upcoming];
}

export function reorderUpcoming(upcoming: YouTubeSource[], fromIndex: number, toIndex: number): YouTubeSource[] {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= upcoming.length || toIndex >= upcoming.length) return upcoming;
  const reordered = [...upcoming];
  const [moved] = reordered.splice(fromIndex, 1);
  reordered.splice(toIndex, 0, moved);
  return reordered;
}

export function insertUpcoming(upcoming: YouTubeSource[], track: YouTubeSource, placement: QueuePlacement): YouTubeSource[] {
  if (upcoming.some(({ id }) => id === track.id)) return upcoming;
  return placement === "NEXT" ? [track, ...upcoming] : [...upcoming, track];
}

export function replaceUpcomingTrack(upcoming: YouTubeSource[], index: number, track: YouTubeSource): YouTubeSource[] {
  if (index < 0 || index >= upcoming.length) return upcoming;
  return upcoming.map((current, currentIndex) => currentIndex === index ? track : current);
}

export function removeUpcomingTrack(upcoming: YouTubeSource[], index: number, minimumRemaining = 4): YouTubeSource[] {
  if (upcoming.length <= minimumRemaining || index < 0 || index >= upcoming.length) return upcoming;
  return upcoming.filter((_, currentIndex) => currentIndex !== index);
}
