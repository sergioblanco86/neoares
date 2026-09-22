import { describe, expect, it } from "vitest";
import { createDefaultDj } from "./default-djs";
import { buildDjSearchPlan, isSearchCandidateAllowed } from "./search-strategy";

const punkDj = createDefaultDj({
  name: "Punk y Ska",
  description: "Punk rock, ska y hardcore sin música electrónica.",
  prompt: "Punk rock, ska y hardcore",
  genres: ["Punk", "Punk Rock", "Ska", "Hardcore"],
});

describe("DJ search strategy", () => {
  it("uses genre-specific artists instead of searching the ambiguous word punk", () => {
    const plan = buildDjSearchPlan(punkDj, 0);
    expect(plan.queries.some((query) => query.includes("Ramones"))).toBe(true);
    expect(plan.queries.some((query) => query.includes("The Specials"))).toBe(true);
    expect(plan.queries.every((query) => !query.startsWith('"Punk"'))).toBe(true);
  });

  it("rotates through the genre artists when the queue needs more music", () => {
    const firstRound = buildDjSearchPlan(punkDj, 0);
    const secondRound = buildDjSearchPlan(punkDj, 1);

    expect(secondRound.queries).not.toEqual(firstRound.queries);
    expect(secondRound.queries.some((query) => query.includes("Rancid"))).toBe(true);
    expect(secondRound.queries.some((query) => query.includes("Ska-P"))).toBe(true);
  });

  it("combines user-provided artist anchors with the wider genre catalog", () => {
    const anchoredDj = createDefaultDj({
      name: "MTV 2000",
      description: "Rock de la era MTV.",
      prompt: "Rock de la era MTV.",
      genres: ["Pop Punk", "Nu Metal"],
      artists: ["Blink-182"],
      era: { label: "MTV", startYear: 1999, endYear: 2006 },
    });

    const firstRound = buildDjSearchPlan(anchoredDj, 0);
    const secondRound = buildDjSearchPlan(anchoredDj, 1);

    expect(firstRound.artistNames).toContain("Blink-182");
    expect(firstRound.artistNames).toContain("Linkin Park");
    expect(firstRound.queries.some((query) => query.includes("Blink-182"))).toBe(true);
    expect(firstRound.queries.some((query) => query.includes("Linkin Park"))).toBe(true);
    expect(firstRound.queries.every((query) => query.includes("MTV 1999"))).toBe(true);
    expect(secondRound.queries.every((query) => query.includes("MTV 2000"))).toBe(true);
  });

  it("spreads a large explicit artist list across consecutive rounds", () => {
    const mtvDj = createDefaultDj({
      name: "MTV 2000",
      description: "Años 2000",
      prompt: "Años 2000",
      genres: ["pop", "pop punk", "rock"],
      artists: ["Blink 182", "Linkin park", "britney spears", "backstreen boys", "nsync", "tlc", "destiny's child", "wheatus", "robie williams", "evanences"],
      era: { label: "MTV", startYear: 1999, endYear: 2006 },
    });

    const firstRound = buildDjSearchPlan(mtvDj, 0);
    const secondRound = buildDjSearchPlan(mtvDj, 1);
    const thirdRound = buildDjSearchPlan(mtvDj, 2);

    expect(firstRound.queries.join(" ")).toContain("britney spears");
    expect(firstRound.queries.join(" ")).toContain("backstreen boys");
    expect(secondRound.queries.join(" ")).toContain("destiny's child");
    expect(secondRound.queries.join(" ")).toContain("wheatus");
    expect(thirdRound.queries.join(" ")).toContain("robie williams");
    expect(thirdRound.queries.join(" ")).toContain("evanences");
  });

  it("accepts corrected YouTube results for misspelled artist anchors", () => {
    const mtvDj = createDefaultDj({
      name: "MTV 2000",
      description: "Años 2000",
      prompt: "Años 2000",
      genres: ["pop", "rock"],
      artists: ["backstreen boys", "robie williams", "evanences"],
    });
    const plan = buildDjSearchPlan(mtvDj, 0);
    const candidate = (creator: string) => ({
      id: creator.padEnd(11, "x").slice(0, 11),
      canonicalUrl: "https://www.youtube.com/watch?v=abcdefghijk",
      title: `${creator} - Official Music Video`,
      creator,
      durationSeconds: 220,
      thumbnailUrl: null,
    });

    expect(isSearchCandidateAllowed(mtvDj, candidate("Backstreet Boys"), plan)).toBe(true);
    expect(isSearchCandidateAllowed(mtvDj, candidate("Robbie Williams"), plan)).toBe(true);
    expect(isSearchCandidateAllowed(mtvDj, candidate("Evanescence"), plan)).toBe(true);
  });

  it("rejects Daft Punk for a punk-rock DJ", () => {
    const plan = buildDjSearchPlan(punkDj, 0);
    expect(isSearchCandidateAllowed(punkDj, {
      id: "dQw4w9WgXcQ",
      canonicalUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      title: "Daft Punk - Around the World",
      creator: "Daft Punk",
      durationSeconds: 247,
      thumbnailUrl: null,
    }, plan)).toBe(false);
  });

  it("accepts a genuine genre artist", () => {
    const plan = buildDjSearchPlan(punkDj, 0);
    expect(isSearchCandidateAllowed(punkDj, {
      id: "abcdefghijk",
      canonicalUrl: "https://www.youtube.com/watch?v=abcdefghijk",
      title: "Ramones - Blitzkrieg Bop",
      creator: "RHINO",
      durationSeconds: 134,
      thumbnailUrl: null,
    }, plan)).toBe(true);
  });

  it("rejects a different artist whose song happens to be named Bad Religion", () => {
    const plan = buildDjSearchPlan(punkDj, 0);
    expect(isSearchCandidateAllowed(punkDj, {
      id: "abcdefghijz",
      canonicalUrl: "https://www.youtube.com/watch?v=abcdefghijz",
      title: "Bad Religion",
      creator: "Godsmack",
      durationSeconds: 194,
      thumbnailUrl: null,
    }, plan)).toBe(false);
  });
});
