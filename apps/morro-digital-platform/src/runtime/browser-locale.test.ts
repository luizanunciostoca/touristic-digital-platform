import { describe, expect, it } from "vitest";

import {
  MORRO_LANGUAGE_OVERRIDE_KEY,
  applyMorroDocumentLocale,
  readMorroLanguageOverride,
  resolveMorroBrowserLocale,
} from "./browser-locale.js";

describe("Morro browser locale policy", () => {
  it("uses the destination locale before browser preferences and normalizes browser aliases when no destination locale exists", () => {
    expect(
      resolveMorroBrowserLocale({
        languages: ["fr-FR", "es-AR", "en-US"],
        language: "fr-FR",
        fallbackLocale: "pt",
      }),
    ).toEqual({ locale: "pt-BR", source: "destination-default" });

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

  it("keeps unsupported-browser fallback to English only when no destination locale is configured", () => {
    expect(
      resolveMorroBrowserLocale({
        languages: ["fr-FR", "de-DE"],
        language: "fr-FR",
      }),
    ).toEqual({ locale: "en-US", source: "browser-fallback" });
  });

  it("falls back to PT-BR when neither destination nor browser locale exists", () => {
    expect(
      resolveMorroBrowserLocale({
        languages: [],
        language: "",
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
