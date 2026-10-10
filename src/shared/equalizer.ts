import type { EqualizerCurve, EqualizerPresetId, EqualizerSettings } from "./contracts";

export const EQUALIZER_FREQUENCIES = [31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;
export const EQUALIZER_PRESETS: ReadonlyArray<EqualizerCurve & { id: EqualizerPresetId }> = [
  { id: "rock", gainsDb: [4, 3, 2, -1, -2, -1, 2, 3, 4, 3], preampDb: 0 },
  { id: "salsa", gainsDb: [1, 2, 1, -1, 0, 2, 3, 2, 1, 0], preampDb: 0 },
  { id: "merengue", gainsDb: [2, 3, 1, -1, 0, 1, 2, 3, 2, 1], preampDb: 0 },
  { id: "bass", gainsDb: [6, 5, 4, 2, 0, -1, -1, 0, 0, 0], preampDb: 0 },
  { id: "treble", gainsDb: [0, 0, -1, -1, 0, 1, 2, 4, 5, 4], preampDb: 0 },
  { id: "reggae", gainsDb: [4, 5, 3, 0, -1, 1, 2, 0, 1, 1], preampDb: 0 },
  { id: "rap", gainsDb: [5, 4, 2, -1, -2, 1, 3, 2, 1, 0], preampDb: 0 },
  { id: "rnb", gainsDb: [3, 4, 2, 0, -1, 1, 2, 1, 2, 2], preampDb: 0 },
];

export function defaultEqualizerSettings(): EqualizerSettings {
  return { schemaVersion: 1, enabled: false, gainsDb: EQUALIZER_FREQUENCIES.map(() => 0), preampDb: 0, presetId: null, personalPresets: [], updatedAt: new Date(0).toISOString() };
}

export function assertEqualizerSettings(value: unknown): asserts value is EqualizerSettings {
  if (!isRecord(value) || value.schemaVersion !== 1 || typeof value.enabled !== "boolean"
    || Object.keys(value).some(key => !["schemaVersion", "enabled", "gainsDb", "preampDb", "presetId", "personalPresets", "updatedAt"].includes(key))
    || !validCurve(value) || !Array.isArray(value.personalPresets) || value.personalPresets.length > 20
    || !value.personalPresets.every(preset => isRecord(preset) && validCurve(preset)
      && Object.keys(preset).every(key => ["id", "name", "gainsDb", "preampDb"].includes(key))
      && typeof preset.id === "string" && /^personal-[a-zA-Z0-9-]{1,80}$/.test(preset.id)
      && typeof preset.name === "string" && preset.name.trim().length > 0 && preset.name.length <= 60)
    || new Set(value.personalPresets.map(preset => preset.id)).size !== value.personalPresets.length
    || new Set(value.personalPresets.map(preset => preset.name.trim().toLocaleLowerCase())).size !== value.personalPresets.length
    || !(value.presetId === null || EQUALIZER_PRESETS.some(preset => preset.id === value.presetId)
      || value.personalPresets.some(preset => preset.id === value.presetId))
    || typeof value.updatedAt !== "string" || !Number.isFinite(Date.parse(value.updatedAt))) {
    throw new Error("EQUALIZER_SETTINGS_INVALID");
  }
}

function validCurve(value: Record<string, unknown>): boolean {
  return Array.isArray(value.gainsDb) && value.gainsDb.length === EQUALIZER_FREQUENCIES.length
    && value.gainsDb.every(gain => typeof gain === "number" && Number.isFinite(gain) && Math.abs(gain) <= 12)
    && typeof value.preampDb === "number" && Number.isFinite(value.preampDb) && Math.abs(value.preampDb) <= 12;
}
function isRecord(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
