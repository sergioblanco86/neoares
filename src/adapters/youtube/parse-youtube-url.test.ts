import { describe, expect, it } from "vitest";
import { parseYouTubeUrl } from "./parse-youtube-url";

describe("parseYouTubeUrl", () => {
  it("normalizes watch and short URLs", () => {
    expect(parseYouTubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toEqual({
      kind: "VIDEO",
      id: "dQw4w9WgXcQ",
      canonicalUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    });
    expect(parseYouTubeUrl("https://youtu.be/dQw4w9WgXcQ?t=12")?.id).toBe("dQw4w9WgXcQ");
  });

  it("prefers an explicit playlist reference", () => {
    expect(parseYouTubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL1234567890")?.kind).toBe("PLAYLIST");
  });

  it("rejects lookalike hosts and malformed ids", () => {
    expect(parseYouTubeUrl("https://youtube.example.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(parseYouTubeUrl("https://youtube.com/watch?v=short")).toBeNull();
  });
});
