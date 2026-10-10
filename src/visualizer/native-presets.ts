import type { VisualizerPresetDescriptor } from "../shared/contracts";

// NeoAres-authored GPU presets. They use the same EEL/WASM engine, audio tap,
// feedback buffer and transition path as imported MilkDrop presets.
const NATIVE_PRESETS = [
  {
    id: "native-aurora-ribbons", name: "Aurora Ribbons", tags: ["aurora", "waveform"],
    definition: {
      version: 2, init_eqs_eel: "", pixel_eqs_eel: "rot=0.006*sin(ang*3+time*0.2); zoom=1.005+0.002*bass;",
      frame_eqs_eel: "wave_r=0.25+0.2*sin(time*0.17); wave_g=0.7; wave_b=0.9; wave_a=0.45+0.12*bass; wave_scale=0.8+0.15*bass; rot=0.003*sin(time*0.3);",
      baseVals: { decay: 0.965, gammaadj: 1.5, wave_mode: 1, wave_a: 0.7, wave_scale: 1, wave_smoothing: 0.7, wave_thick: 1, additivewave: 1, warp: 0, zoom: 1.008, ob_size: 0, ib_size: 0, mv_a: 0 },
      shapes: [], waves: [], warp: "", comp: "",
    },
  },
  {
    id: "native-pulse-orbit", name: "Pulse Orbit", tags: ["geometry", "bass"],
    definition: {
      version: 2, init_eqs_eel: "", pixel_eqs_eel: "zoom=1.008; rot=0.004;",
      frame_eqs_eel: "wave_a=0; zoom=1.004+0.003*bass;",
      baseVals: { decay: 0.94, gammaadj: 1.3, wave_a: 0, warp: 0, zoom: 1.008, ob_size: 0, ib_size: 0, mv_a: 0 },
      shapes: [
        { baseVals: { enabled: 1, sides: 6, additive: 1, thickoutline: 1, textured: 0, x: 0.5, y: 0.5, rad: 0.15, r: 0.7, g: 0.25, b: 0.9, a: 0.2, r2: 0.05, g2: 0.1, b2: 0.3, a2: 0.02, border_r: 0.8, border_g: 0.5, border_b: 1, border_a: 0.8 }, init_eqs_eel: "", frame_eqs_eel: "rad=0.1+0.05*bass; ang=time*0.1; x=0.5+0.12*sin(time*0.23); y=0.5+0.1*cos(time*0.31); a=0.12+0.08*bass;" },
        { baseVals: { enabled: 1, sides: 32, additive: 1, thickoutline: 1, textured: 0, x: 0.5, y: 0.5, rad: 0.22, r: 0.1, g: 0.7, b: 0.9, a: 0.02, r2: 0.1, g2: 0.2, b2: 0.4, a2: 0, border_r: 0.2, border_g: 0.8, border_b: 1, border_a: 0.7 }, init_eqs_eel: "", frame_eqs_eel: "rad=0.19+0.035*mid; x=0.5-0.1*sin(time*0.23); y=0.5-0.1*cos(time*0.31);" },
      ], waves: [], warp: "", comp: "",
    },
  },
];

export function nativePresetCatalog(): Array<VisualizerPresetDescriptor & { definition: unknown }> {
  return NATIVE_PRESETS.map(preset => ({
    id: preset.id, name: preset.name, author: "NeoAres", kind: "native", bundled: true, sourceKey: preset.id,
    tags: preset.tags, favorite: false, origin: "bundled", checksum: null, compatibility: "ready", importedAt: null,
    definition: {
      ...preset.definition,
      shapes: Array.from({ length: 4 }, (_, index) => preset.definition.shapes[index] ?? { baseVals: { enabled: 0 }, init_eqs_eel: "", frame_eqs_eel: "" }),
      waves: Array.from({ length: 4 }, () => ({ baseVals: { enabled: 0 }, init_eqs_eel: "", frame_eqs_eel: "", point_eqs_eel: "" })),
    },
  }));
}
