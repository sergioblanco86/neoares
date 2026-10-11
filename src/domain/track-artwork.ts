export type ArtworkQuality = "thumbnail" | "cover";
export type ArtworkCandidate = { url: string; minimumWidth?: number };

const MUSIC_ARTWORK_HOSTS = new Set([
  "yt3.googleusercontent.com", "lh3.googleusercontent.com", "yt3.ggpht.com", "lh3.ggpht.com",
]);

/** Upgrade only known CDN transforms, never guess a different song/album image.
 * Resolve at display time so existing sessions also benefit without migration.
 */
export function getArtworkCandidates(thumbnailUrl: string | null, quality: ArtworkQuality): ArtworkCandidate[] {
  if (!thumbnailUrl) return [];
  const original = { url: thumbnailUrl };
  if (quality === "thumbnail") return [original];
  try {
    const url = new URL(thumbnailUrl);
    if (url.protocol !== "https:" || url.port || url.username || url.password) return [original];
    if (MUSIC_ARTWORK_HOSTS.has(url.hostname)) {
      // s0 requests the actual original rather than enlarging a 120px rendition.
      const path = url.pathname.replace(/=(?:w\d+-h\d+|s\d+)(?:-[a-z0-9]+)*$/i, "=s0");
      if (path === url.pathname) return [original];
      url.pathname = path;
      return [{ url: url.href }, original];
    }
    if (url.hostname === "i.ytimg.com" || url.hostname === "img.youtube.com") {
      const match = url.pathname.match(/^(\/vi(?:_webp)?\/[A-Za-z0-9_-]{11}\/)(?:default|mqdefault|hqdefault|sddefault|maxresdefault)\.(jpg|webp)$/);
      if (!match || url.search) return [original];
      if (url.pathname.endsWith(`/maxresdefault.${match[2]}`)) return [original];
      const candidates: ArtworkCandidate[] = [
        { url: `${url.origin}${match[1]}maxresdefault.${match[2]}`, minimumWidth: 640 },
        { url: `${url.origin}${match[1]}sddefault.${match[2]}`, minimumWidth: 480 },
        original,
      ];
      // Preserve the original as the final unrestricted fallback, even if it
      // itself is named maxresdefault/sddefault but contains a small image.
      return candidates.filter((candidate, index) => index === candidates.length - 1
        || (candidate.url !== thumbnailUrl && candidates.findIndex(other => other.url === candidate.url) === index));
    }
  } catch {
    // Data URLs, fixtures and unknown providers retain their original behavior.
  }
  return [original];
}
