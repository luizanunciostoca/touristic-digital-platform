import { describe, expect, it } from "vitest";

import {
  MORRO_LANGUAGE_OVERRIDE_KEY,
  applyMorroDocumentLocale,
  readMorroLanguageOverride,
  resolveMorroBrowserLocale,
} from "./browser-locale.js";

describe("V1 browser locale parity", () => {
  it("uses the first supported navigator preference and normalizes aliases", () => {
    expect(
      resolveMorroBrowserLocale({
        languages: ["fr-FR", "es-AR", "en-US"],
        language: "fr-FR",
        fallbackLocale: "pt",
      }),
    ).toEqual({ locale: "es-ES", source: "browser" });

    expect(
      resolveMorroBrowserLocale({
        languages: ["iw-IL"],
        language: "iw-IL",
      }),
    ).toEqual({ locale: "he-IL", source: "browser" });
  });

  it("preserves a deliberate Morro Digital language choice over the browser", () => {
    expect(
      resolveMorroBrowserLocale({
        override: "pt-PT",
        languages: ["en-US"],
        language: "en-US",
      }),
    ).toEqual({ locale: "pt-BR", source: "manual" });
  });

  it("keeps the V1 unsupported-browser fallback to English", () => {
    expect(
      resolveMorroBrowserLocale({
        languages: ["fr-FR", "de-DE"],
        language: "fr-FR",
        fallbackLocale: "pt-BR",
      }),
    ).toEqual({ locale: "en-US", source: "browser-fallback" });
  });

  it("falls back to PT-BR only when the browser exposes no locale", () => {
    expect(
      resolveMorroBrowserLocale({
        languages: [],
        language: "",
        fallbackLocale: "pt",
      }),
    ).toEqual({ locale: "pt-BR", source: "document-fallback" });
  });

  it("applies RTL only for Hebrew and restores LTR for other locales", () => {
    const document = {
      documentElement: { lang: "", dir: "" },
    } as Document;

    applyMorroDocumentLocale(document, "he-IL");
    expect(document.documentElement.lang).toBe("he-IL");
    expect(document.documentElement.dir).toBe("rtl");

    applyMorroDocumentLocale(document, "en-US");
    expect(document.documentElement.lang).toBe("en-US");
    expect(document.documentElement.dir).toBe("ltr");
  });

  it("reads only the dedicated manual language override key", () => {
    const values = new Map<string, string>([
      ["voice-language", "pt-BR"],
      [MORRO_LANGUAGE_OVERRIDE_KEY, "es-ES"],
    ]);
    expect(
      readMorroLanguageOverride({
        getItem: (key) => values.get(key) ?? null,
      }),
    ).toBe("es-ES");
  });
});
