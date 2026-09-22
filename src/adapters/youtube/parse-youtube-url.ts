export type ParsedYouTubeReference =
  | { kind: "VIDEO"; id: string; canonicalUrl: string }
  | { kind: "PLAYLIST"; id: string; canonicalUrl: string };

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const PLAYLIST_ID = /^[A-Za-z0-9_-]{10,80}$/;

export function parseYouTubeUrl(input: string): ParsedYouTubeReference | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (!["youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"].includes(host)) return null;

  const playlistId = url.searchParams.get("list");
  if (playlistId && PLAYLIST_ID.test(playlistId)) {
    return {
      kind: "PLAYLIST",
      id: playlistId,
      canonicalUrl: `https://www.youtube.com/playlist?list=${encodeURIComponent(playlistId)}`,
    };
  }

  const videoId = extractVideoId(url, host);
  if (!videoId || !VIDEO_ID.test(videoId)) return null;
  return {
    kind: "VIDEO",
    id: videoId,
    canonicalUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
  };
}

function extractVideoId(url: URL, host: string): string | null {
  if (host === "youtu.be") return url.pathname.split("/").filter(Boolean)[0] ?? null;
  if (url.pathname === "/watch") return url.searchParams.get("v");
  const [kind, id] = url.pathname.split("/").filter(Boolean);
  return ["shorts", "embed", "live"].includes(kind ?? "") ? (id ?? null) : null;
}
