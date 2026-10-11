import { describe, expect, it } from "vitest";
import { getArtworkCandidates } from "./track-artwork";

describe("track artwork", () => {
  const small = "https://yt3.googleusercontent.com/album-id=w120-h120-l90-rj";
  it("uses the native original for a large music cover with the thumbnail as fallback", () => {
    expect(getArtworkCandidates(small, "cover")).toEqual([
      { url: "https://yt3.googleusercontent.com/album-id=s0" }, { url: small },
    ]);
  });
  it.each(["yt3.googleusercontent.com", "lh3.googleusercontent.com", "yt3.ggpht.com", "lh3.ggpht.com"])("supports music artwork on %s without changing the asset", host => {
    expect(getArtworkCandidates(`https://${host}/same-album=w120-h120-s-l90-rj?token=123`, "cover")[0].url)
      .toBe(`https://${host}/same-album=s0?token=123`);
  });
  it("supports square transforms and leaves existing originals alone", () => {
    expect(getArtworkCandidates("https://lh3.googleusercontent.com/album=s226-c-k-c0x00ffffff-no-rj", "cover")[0].url)
      .toBe("https://lh3.googleusercontent.com/album=s0");
    const original = "https://yt3.googleusercontent.com/album=s0";
    expect(getArtworkCandidates(original, "cover")).toEqual([{ url: original }]);
  });
  it("never requests large originals for queue miniatures", () => {
    expect(getArtworkCandidates(small, "thumbnail")).toEqual([{ url: small }]);
  });
  it("tries high-resolution video thumbnails with placeholder detection and fallback", () => {
    expect(getArtworkCandidates("https://i.ytimg.com/vi/TViZJnRAuIk/hqdefault.jpg", "cover")).toEqual([
      { url: "https://i.ytimg.com/vi/TViZJnRAuIk/maxresdefault.jpg", minimumWidth: 640 },
      { url: "https://i.ytimg.com/vi/TViZJnRAuIk/sddefault.jpg", minimumWidth: 480 },
      { url: "https://i.ytimg.com/vi/TViZJnRAuIk/hqdefault.jpg" },
    ]);
    expect(getArtworkCandidates("https://i.ytimg.com/vi_webp/TViZJnRAuIk/sddefault.webp", "cover")).toHaveLength(2);
    const original = "https://i.ytimg.com/vi/TViZJnRAuIk/maxresdefault.jpg";
    expect(getArtworkCandidates(original, "cover")).toEqual([{ url: original }]);
  });
  it.each([
    "https://example.com/album=w120-h120-l90-rj", "https://yt3.googleusercontent.com.evil.test/album=w120-h120",
    "http://yt3.googleusercontent.com/album=w120-h120", "https://yt3.googleusercontent.com:444/album=w120-h120",
    "https://user@yt3.googleusercontent.com/album=w120-h120", "https://yt3.googleusercontent.com/unknown",
    "https://i.ytimg.com/vi/TViZJnRAuIk/hqdefault.jpg?signed=1", "data:image/png;base64,AAAA", "not-a-url",
  ])("does not rewrite unknown or signed formats: %s", url => {
    expect(getArtworkCandidates(url, "cover")).toEqual([{ url }]);
  });
  it("handles missing art", () => expect(getArtworkCandidates(null, "cover")).toEqual([]));
});
