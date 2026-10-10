import type { DesktopApi, EqualizerSettings } from "../shared/contracts";
import { assertEqualizerSettings } from "../shared/equalizer";

export const EQUALIZER_RESTART_REQUIRED = "EQUALIZER_RESTART_REQUIRED";

export async function loadEqualizerSettings(desktop: Pick<DesktopApi, "equalizer"> | undefined): Promise<EqualizerSettings> {
  // HMR can update the renderer while the main process/preload still run old code.
  if (typeof desktop?.equalizer?.loadSettings !== "function" || typeof desktop.equalizer.saveSettings !== "function") {
    throw new Error(EQUALIZER_RESTART_REQUIRED);
  }
  let settings: EqualizerSettings;
  try {
    settings = await desktop.equalizer.loadSettings();
  } catch (cause) {
    if (cause instanceof Error && cause.message.includes("No handler registered for 'equalizer-settings:load'")) {
      throw new Error(EQUALIZER_RESTART_REQUIRED, { cause });
    }
    throw cause;
  }
  assertEqualizerSettings(settings);
  return settings;
}
