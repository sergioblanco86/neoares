export const PREVIOUS_AUDIO_RETENTION = 4;

export function playbackRetention(queue: readonly { id: string }[], currentIndex: number) {
  const boundary = Math.max(0, currentIndex - PREVIOUS_AUDIO_RETENTION);
  const protectedIds = [...new Set(queue.slice(boundary).map(track => track.id))];
  const protectedSet = new Set(protectedIds);
  const retiredIds = [...new Set(queue.slice(0, boundary).map(track => track.id))].filter(id => !protectedSet.has(id));
  return { protectedIds, retiredIds };
}
