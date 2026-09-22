export type ContentType =
  | "OFFICIAL_VIDEO"
  | "OFFICIAL_AUDIO"
  | "LYRIC_VIDEO"
  | "LIVE"
  | "REMIX"
  | "EXTENDED"
  | "USER_UPLOAD"
  | "UNKNOWN";

export type TransitionType =
  | "BEATMIX"
  | "CROSSFADE"
  | "FADE_THEN_START"
  | "HARD_CUT"
  | "EMERGENCY_LOOP";

export type DjProfile = {
  schemaVersion: 1;
  id: string;
  revision: number;
  name: string;
  description: string;
  status: "ACTIVE" | "ARCHIVED";
  createdAt: string;
  updatedAt: string;
  intent: {
    prompt: string;
    tags: string[];
    languages: string[];
    regions: string[];
    genres: string[];
    era?: {
      label: string;
      startYear: number | null;
      endYear: number | null;
    };
  };
  seeds: {
    artists: Array<{ name: string; youtubeChannelId: string | null }>;
    tracks: SourceRef[];
    playlists: SourceRef[];
    searchTerms: string[];
  };
  exclusions: {
    artists: string[];
    sourceIds: string[];
    channelIds: string[];
    terms: string[];
    contentTypes: ContentType[];
  };
  curation: {
    familiarity: number;
    discovery: number;
    sameArtistCooldownMinutes: number;
    repeatTrackCooldownMinutes: number;
    minDurationSeconds: number;
    maxDurationSeconds: number;
    allowedContentTypes: ContentType[];
    weights: CurationWeights;
  };
  mixing: {
    preferredTempoAdjustmentPercent: number;
    maxTempoAdjustmentPercent: number;
    absoluteTempoAdjustmentPercent: number;
    allowedTransitionTypes: TransitionType[];
  };
  energyPlan: {
    mode: "FIXED_DURATION" | "OPEN_ENDED";
    curve: Array<{ at: number; energy: number }>;
    phases: EnergyPhase[];
  };
};

export type SourceRef = {
  provider: "YOUTUBE";
  sourceId: string;
  url: string;
};

export type YouTubeSource = {
  id: string;
  canonicalUrl: string;
  title: string;
  creator: string;
  durationSeconds: number;
  thumbnailUrl: string | null;
};

export type PreparedYouTubeSource = YouTubeSource & {
  leaseId: string;
  byteLength: number;
  format: "m4a" | "webm" | "unknown";
};

export type EnergyPhase = "WARMUP" | "BUILD" | "PEAK" | "SUSTAIN" | "COOLDOWN";

export type CurationWeights = {
  occasion: number;
  taste: number;
  source: number;
  bpm: number;
  key: number;
  energy: number;
  phrase: number;
  novelty: number;
};

export type DesktopApi = {
  platform: NodeJS.Platform;
  connectivity: {
    check(): Promise<boolean>;
  };
  djs: {
    list(): Promise<DjProfile[]>;
    save(profile: DjProfile): Promise<DjProfile>;
    delete(id: string): Promise<void>;
  };
  sources: {
    search(query: string, limit: number): Promise<YouTubeSource[]>;
    searchMany(queries: string[], limitPerQuery: number): Promise<YouTubeSource[][]>;
    inspect(url: string): Promise<YouTubeSource>;
    prepare(source: YouTubeSource): Promise<PreparedYouTubeSource>;
    read(leaseId: string): Promise<Uint8Array>;
    release(leaseId: string): Promise<void>;
  };
};

declare global {
  interface Window {
    desktop?: DesktopApi;
  }
}
