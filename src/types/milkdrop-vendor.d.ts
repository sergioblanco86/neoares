declare module "butterchurn" {
  const butterchurn: unknown;
  export default butterchurn;
}

declare module "butterchurn-presets" {
  const presets: unknown;
  export default presets;
}

declare module "milkdrop-preset-converter" {
  const converter: { convertPreset(preset: string): Promise<unknown> };
  export default converter;
}

declare module "milkdrop-preset-utils" {
  type RawEquationSet = { init_eqs_str?: string; frame_eqs_str?: string; point_eqs_str?: string };
  export function splitPreset(source: string): {
    presetVersion: number; presetInit: string; perFrame: string; perVertex: string;
    shapes: RawEquationSet[]; waves: RawEquationSet[];
  };
}
