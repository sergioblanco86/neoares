import type { VisualizerPresetDescriptor } from "../shared/contracts";
import { nativePresetCatalog } from "./native-presets";

export const PRESET_KEYS = [
  "Aderrasi - Potion of Spirits",
  "Geiss - Spiral Artifact",
  "MilkDrop2077.R002",
  "Rovastar - Oozing Resistance",
  "martin - angel flight",
  "_Geiss - Artifact 01",
] as const;

export function bundledPresetCatalog(definitions: Record<string, unknown>): Array<VisualizerPresetDescriptor & { definition: unknown }> {
  const milkdrop = PRESET_KEYS.flatMap((sourceKey) => {
    const definition = definitions[sourceKey];
    if (!definition) return [];
    const [author, ...rest] = sourceKey.split(" - ");
    const name = rest.join(" - ") || author;
    return [{
      id: `bundled-${slugify(sourceKey)}`,
      name,
      author: rest.length ? author.replace(/^_/, "") : null,
      kind: "milkdrop" as const,
      bundled: true,
      sourceKey,
      tags: ["bundled", "milkdrop"],
      favorite: false,
      origin: "bundled" as const,
      checksum: null,
      compatibility: "ready" as const,
      importedAt: null,
      definition,
    }];
  });
  return [...milkdrop, ...nativePresetCatalog()];
}

export function bundledDefinitionFor(sourceKey: string, definitions: Record<string, unknown>): unknown | null {
  return definitions[sourceKey] ?? null;
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
