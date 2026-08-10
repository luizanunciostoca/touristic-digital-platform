import { describe, expect, it } from "vitest";

import { analyzeAssistantIntent, extractAssistantEntities } from "./intent-engine.js";

describe("assistant language detection token boundaries", () => {
  it("keeps the Search-generated Portuguese details command in Portuguese", () => {
    const input = "mais informações sobre Toca do Morcego";

    expect(extractAssistantEntities(input).language).toBe("pt");
    expect(analyzeAssistantIntent(input)).toMatchObject({
      intent: "more_info",
      entities: {
        language: "pt",
        place: "toca do morcego",
      },
    });
  });

  it("detects English only from complete English tokens", () => {
    expect(extractAssistantEntities("what is Toca do Morcego?").language).toBe(
      "en",
    );
  });

  it("detects normalized Spanish tokens with accents", () => {
    expect(extractAssistantEntities("¿Dónde está Toca do Morcego?").language).toBe(
      "es",
    );
  });
});
