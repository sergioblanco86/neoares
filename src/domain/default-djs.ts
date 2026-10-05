import type { DjProfile, PopularityLevel } from "../shared/contracts";

const now = "2026-09-18T20:00:00.000Z";

export const DEFAULT_DJS: readonly DjProfile[] = [
  createDefaultDj({
    id: "01995f84-c421-7f00-9e1c-2d70c95b11a1",
    name: "Fiesta Salsera",
    description: "Clásicos bailables que crecen hacia salsa dura sin perder el piso.",
    prompt: "Fiesta salsera colombiana, alegre, bailable y con progresión de energía.",
    genres: ["Salsa", "Salsa dura", "Salsa romántica"],
    artists: ["Joe Arroyo", "Grupo Niche", "Héctor Lavoe"],
  }),
  createDefaultDj({
    id: "01995f84-c421-7f00-9e1c-2d70c95b11a2",
    name: "Rock en Español",
    description: "Himnos conocidos, guitarras grandes y una curva de energía sostenida.",
    prompt: "Fiesta de rock en español con clásicos latinoamericanos y españoles.",
    genres: ["Rock en español", "Rock alternativo"],
    artists: ["Soda Stereo", "Aterciopelados", "Héroes del Silencio"],
  }),
  createDefaultDj({
    id: "01995f84-c421-7f00-9e1c-2d70c95b11a3",
    name: "Diciembre Barranquillero",
    description: "Música de diciembre con sabor costeño, nostalgia y celebración.",
    prompt: "Diciembre en Barranquilla: tropical, vallenato clásico y música de verbena.",
    genres: ["Tropical", "Vallenato", "Salsa"],
    artists: ["Aníbal Velásquez", "Los Corraleros de Majagual", "Pastor López"],
  }),
] as const;

export function createDefaultDj(input: {
  id?: string;
  name: string;
  description: string;
  prompt: string;
  genres: string[];
  artists?: string[];
  popularityLevel?: PopularityLevel;
  era?: {
    label: string;
    startYear: number | null;
    endYear: number | null;
  };
}): DjProfile {
  return {
    schemaVersion: 1,
    id: input.id ?? crypto.randomUUID(),
    revision: 1,
    name: input.name,
    description: input.description,
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now,
    intent: {
      prompt: input.prompt,
      tags: ["fiesta"],
      languages: ["es"],
      regions: ["CO"],
      genres: input.genres,
      ...(input.era ? { era: input.era } : {}),
    },
    seeds: {
      artists: (input.artists ?? []).map((name) => ({ name, youtubeChannelId: null })),
      tracks: [],
      playlists: [],
      searchTerms: input.genres,
    },
    exclusions: {
      artists: [],
      sourceIds: [],
      channelIds: [],
      terms: ["reacción", "tutorial", "entrevista"],
      contentTypes: ["UNKNOWN"],
    },
    curation: {
      popularityLevel: input.popularityLevel ?? 3,
      familiarity: 0.72,
      discovery: 0.28,
      sameArtistCooldownMinutes: 45,
      repeatTrackCooldownMinutes: 480,
      minDurationSeconds: 120,
      maxDurationSeconds: 600,
      allowedContentTypes: ["OFFICIAL_VIDEO", "OFFICIAL_AUDIO", "LYRIC_VIDEO", "EXTENDED"],
      weights: {
        occasion: 0.2,
        taste: 0.15,
        source: 0.05,
        bpm: 0.15,
        key: 0.08,
        energy: 0.17,
        phrase: 0.1,
        novelty: 0.1,
      },
    },
    mixing: {
      preferredTempoAdjustmentPercent: 0,
      maxTempoAdjustmentPercent: 0,
      absoluteTempoAdjustmentPercent: 0,
      allowedTransitionTypes: ["CROSSFADE", "FADE_THEN_START"],
    },
    energyPlan: {
      mode: "OPEN_ENDED",
      curve: [],
      phases: ["WARMUP", "BUILD", "PEAK", "SUSTAIN"],
    },
  };
}
