import { describe, expect, it } from "vitest";

import { resolveNavigationSpeechLanguage } from "./navigation-speech.js";

describe("navigation speech locale resolution", () => {
  it("uses the effective document locale before legacy voice storage", () => {
    expect(
      resolveNavigationSpeechLanguage("en-US", "pt-BR", "pt"),
    ).toBe("en");
    expect(
      resolveNavigationSpeechLanguage("he-IL", "en-US", "en"),
    ).toBe("he");
  });

  it("falls back to legacy voice preferences when the document locale is empty", () => {
    expect(
      resolveNavigationSpeechLanguage("", "es-ES", "pt"),
    ).toBe("es");
    expect(
      resolveNavigationSpeechLanguage("   ", null, "he"),
    ).toBe("he");
  });

  it("keeps Portuguese as the final compatibility fallback", () => {
    expect(resolveNavigationSpeechLanguage(null, null, undefined)).toBe("pt");
  });
});
