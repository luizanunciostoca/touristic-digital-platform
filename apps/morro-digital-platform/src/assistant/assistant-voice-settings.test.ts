import { describe, expect, it } from "vitest";

import { LANGUAGE_LABELS } from "./assistant-voice-settings.js";

describe("assistant voice settings", () => {
  it("preserves the four supported language labels", () => {
    expect(LANGUAGE_LABELS).toEqual({
      pt: "Português",
      en: "English",
      es: "Español",
      he: "עברית",
    });
  });
});
