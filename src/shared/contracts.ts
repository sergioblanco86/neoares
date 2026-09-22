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

export type SourceRequestScope = "user" | "playback";

export type SupportedLocale = "es" | "en";

export type LanguagePreference = "system" | SupportedLocale;

export type AppState = {
  schemaVersion: 2;
  lastSelectedDjId: string | null;
  languagePreference: LanguagePreference;
  updatedAt: string;
};

export type RestorableSessionPhase = "PLAYING" | "PAUSED" | "RECOVERING";

export type SessionSnapshot = {
  schemaVersion: 1;
  sessionId: string;
  djId: string;
  djRevision: number;
  phase: RestorableSessionPhase;
  queue: YouTubeSource[];
  currentIndex: number;
  positionSeconds: number;
  discoveryRound: number;
  savedAt: string;
  recoverable: boolean;
};

export type CachePolicy = {
  maxBytes: number;
  cleanupTargetBytes: number;
  maxUnusedAgeDays: number;
  partialMaxAgeMinutes: number;
  sweepIntervalMinutes: number;
};

export type CacheStats = {
  totalBytes: number;
  audioFileCount: number;
  partialFileCount: number;
  protectedFileCount: number;
  oldestAccessedAt: string | null;
};

export type CacheCleanupResult = {
  bytesBefore: number;
  bytesAfter: number;
  removedFiles: number;
  removedBytes: number;
};

export type LoudnessAnalysis = {
  integratedLufs: number;
  samplePeakDbfs: number;
  recommendedGainDb: number;
  targetLufs: number;
  ceilingDbfs: number;
  analysisVersion: "loudness-v2";
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
  locale: {
    getPreferredLanguages(): Promise<string[]>;
    apply(locale: SupportedLocale): Promise<void>;
  };
  connectivity: {
    check(): Promise<boolean>;
  };
  runtime: {
    setAudioActive(active: boolean): Promise<void>;
  };
  djs: {
    list(): Promise<DjProfile[]>;
    save(profile: DjProfile): Promise<DjProfile>;
    delete(id: string): Promise<void>;
  };
  appState: {
    load(): Promise<AppState>;
    save(state: AppState): Promise<void>;
  };
  sessions: {
    loadActive(): Promise<SessionSnapshot | null>;
    saveActive(snapshot: SessionSnapshot): Promise<void>;
    clearActive(): Promise<void>;
  };
  cache: {
    getStats(): Promise<CacheStats>;
    getPolicy(): Promise<CachePolicy>;
    savePolicy(policy: CachePolicy): Promise<void>;
    cleanup(): Promise<CacheCleanupResult>;
    clearUnused(): Promise<CacheCleanupResult>;
    protect(sourceIds: string[]): Promise<void>;
    getLoudness(sourceId: string): Promise<LoudnessAnalysis | null>;
    saveLoudness(sourceId: string, analysis: LoudnessAnalysis): Promise<void>;
  };
  sources: {
    search(query: string, limit: number, scope?: SourceRequestScope): Promise<YouTubeSource[]>;
    searchMany(queries: string[], limitPerQuery: number, scope?: SourceRequestScope): Promise<YouTubeSource[][]>;
    inspect(url: string, scope?: SourceRequestScope): Promise<YouTubeSource>;
    prepare(source: YouTubeSource, scope?: SourceRequestScope): Promise<PreparedYouTubeSource>;
    read(leaseId: string): Promise<Uint8Array>;
    release(leaseId: string): Promise<void>;
    cancelPlayback(): Promise<number>;
  };
};

declare global {
  interface Window {
    desktop?: DesktopApi;
  }
}
