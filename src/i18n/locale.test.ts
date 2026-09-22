import { describe, expect, it } from "vitest";
import { resolveLocale } from "./locale";
import { en } from "./locales/en";
import { es } from "./locales/es";

describe("resolveLocale", () => {
  it("honors an explicit language preference", () => {
    expect(resolveLocale("es", ["en-US"])).toBe("es");
    expect(resolveLocale("en", ["es-CO"])).toBe("en");
  });

  it("uses the first supported system language", () => {
    expect(resolveLocale("system", ["fr-FR", "es-CO", "en-US"])).toBe("es");
    expect(resolveLocale("system", ["en-US", "es-CO"])).toBe("en");
  });

  it("falls back to English for unsupported systems", () => {
    expect(resolveLocale("system", ["de-DE"])).toBe("en");
  });
});

describe("translation catalogs", () => {
  it("keeps English and Spanish keys in exact parity", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(es).sort());
  });

  it("does not contain empty translations", () => {
    expect(Object.values(en).every(Boolean)).toBe(true);
    expect(Object.values(es).every(Boolean)).toBe(true);
  });
});
