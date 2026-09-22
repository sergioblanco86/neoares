import type { CurationWeights } from "../shared/contracts";

export type CandidateFeatures = {
  trackId: string;
  artistKey: string;
  durationSeconds: number;
  blocked: boolean;
  available: boolean;
  occasion: number;
  taste: number;
  source: number;
  bpm: number;
  key: number;
  energy: number;
  phrase: number;
  novelty: number;
  uncertaintyPenalty: number;
  preparationPenalty: number;
};

export type SelectionContext = {
  weights: CurationWeights;
  recentTrackIds: ReadonlySet<string>;
  recentArtistKeys: ReadonlySet<string>;
  minDurationSeconds: number;
  maxDurationSeconds: number;
  randomSeed: number;
};

export type RankedCandidate = {
  trackId: string;
  artistKey: string;
  totalScore: number;
  components: Record<keyof CurationWeights, number>;
  penalties: string[];
  reasons: string[];
};

const FEATURE_NAMES: readonly (keyof CurationWeights)[] = [
  "occasion",
  "taste",
  "source",
  "bpm",
  "key",
  "energy",
  "phrase",
  "novelty",
];

export function rankCandidates(
  candidates: readonly CandidateFeatures[],
  context: SelectionContext,
): RankedCandidate[] {
  const normalizedWeights = normalizeWeights(context.weights);

  return candidates
    .filter((candidate) => passesHardFilters(candidate, context))
    .map((candidate) => scoreCandidate(candidate, normalizedWeights))
    .sort((left, right) => {
      const scoreDifference = right.totalScore - left.totalScore;
      if (Math.abs(scoreDifference) > Number.EPSILON) return scoreDifference;
      return seededOrder(left.trackId, context.randomSeed) - seededOrder(right.trackId, context.randomSeed);
    });
}

function passesHardFilters(candidate: CandidateFeatures, context: SelectionContext): boolean {
  return (
    !candidate.blocked &&
    candidate.available &&
    !context.recentTrackIds.has(candidate.trackId) &&
    !context.recentArtistKeys.has(candidate.artistKey) &&
    candidate.durationSeconds >= context.minDurationSeconds &&
    candidate.durationSeconds <= context.maxDurationSeconds
  );
}

function scoreCandidate(
  candidate: CandidateFeatures,
  weights: CurationWeights,
): RankedCandidate {
  const components = Object.fromEntries(
    FEATURE_NAMES.map((name) => [name, clamp01(candidate[name]) * weights[name]]),
  ) as Record<keyof CurationWeights, number>;

  const positive = Object.values(components).reduce((sum, value) => sum + value, 0);
  const uncertainty = clamp01(candidate.uncertaintyPenalty);
  const preparation = clamp01(candidate.preparationPenalty);
  const totalScore = clamp01(positive - uncertainty - preparation);
  const reasons = FEATURE_NAMES
    .map((name) => ({ name, contribution: components[name] }))
    .filter(({ contribution }) => contribution > 0.08)
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 3)
    .map(({ name }) => `STRONG_${name.toUpperCase()}_FIT`);
  const penalties = [
    ...(uncertainty > 0 ? ["UNCERTAINTY"] : []),
    ...(preparation > 0 ? ["PREPARATION_RISK"] : []),
  ];

  return {
    trackId: candidate.trackId,
    artistKey: candidate.artistKey,
    totalScore,
    components,
    penalties,
    reasons: reasons.length > 0 ? reasons : ["ACCEPTABLE_OVERALL_FIT"],
  };
}

function normalizeWeights(weights: CurationWeights): CurationWeights {
  const total = FEATURE_NAMES.reduce((sum, name) => sum + Math.max(0, weights[name]), 0);
  if (total <= 0) throw new Error("CURATION_WEIGHTS_INVALID: la suma debe ser mayor que cero");
  return Object.fromEntries(
    FEATURE_NAMES.map((name) => [name, Math.max(0, weights[name]) / total]),
  ) as CurationWeights;
}

function seededOrder(value: string, seed: number): number {
  let hash = seed | 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 0x45d9f3b);
    hash ^= hash >>> 16;
  }
  return hash >>> 0;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
