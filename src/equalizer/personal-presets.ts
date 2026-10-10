import type { EqualizerSettings } from "../shared/contracts";
import { EQUALIZER_PRESETS } from "../shared/equalizer";

export function selectEqualizerPreset(settings: EqualizerSettings, id: string): EqualizerSettings {
  const preset = [...EQUALIZER_PRESETS, ...settings.personalPresets].find(preset => preset.id === id);
  if (!preset) throw new Error("EQUALIZER_PRESET_NOT_FOUND");
  return { ...settings, enabled: true, presetId: id, gainsDb: [...preset.gainsDb], preampDb: preset.preampDb };
}

export function savePersonalPreset(settings: EqualizerSettings, nameInput: string, id = `personal-${crypto.randomUUID()}`): EqualizerSettings {
  const name = nameInput.trim();
  if (!name || name.length > 60) throw new Error("EQUALIZER_NAME_INVALID");
  const existing = settings.personalPresets.find(preset => preset.name.toLocaleLowerCase() === name.toLocaleLowerCase());
  if (!existing && settings.personalPresets.length >= 20) throw new Error("EQUALIZER_PRESET_LIMIT");
  const preset = { id: existing?.id ?? id, name, gainsDb: [...settings.gainsDb], preampDb: settings.preampDb };
  return { ...settings, presetId: preset.id, personalPresets: [...settings.personalPresets.filter(entry => entry.id !== preset.id), preset] };
}

export function removePersonalPreset(settings: EqualizerSettings, id: string): EqualizerSettings {
  return { ...settings, presetId: settings.presetId === id ? null : settings.presetId, personalPresets: settings.personalPresets.filter(preset => preset.id !== id) };
}
