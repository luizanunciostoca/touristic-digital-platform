import { describe, expect, it } from "vitest";

import { analyzeAssistantIntent } from "./intent-engine.js";

describe("V1 recommendation and comparison intent parity", () => {
  it("classifies explicit recommendation requests before category synonyms", () => {
    const result = analyzeAssistantIntent(
      "me recomende um restaurante romântico com vista",
    );

    expect(result.intent).toBe("recommendation");
    expect(result.entities.category).toBe("restaurants");
    expect(result.modifiers).toContain("romantic");
    expect(result.modifiers).toContain("scenic_view");
  });

  it("classifies a compound family beach request as category_filtered", () => {
    const result = analyzeAssistantIntent(
      "quero uma praia tranquila para crianças",
    );

    expect(result.intent).toBe("category_filtered");
    expect(result.entities.category).toBe("beaches");
    expect(result.modifiers).toContain("family");
  });

  it("classifies comparison requests independently of category aliases", () => {
    expect(
      analyzeAssistantIntent("Primeira Praia ou Segunda Praia?"),
    ).toMatchObject({
      intent: "compare",
    });
  });

  it.each([
    ["recomiéndame un restaurante romántico", "recommendation"],
    ["compare Primera Playa versus Segunda Playa", "compare"],
    ["מה אתה ממליץ על חופים", "recommendation"],
    ["להשוות חוף ראשון מול חוף שני", "compare"],
  ])(
    "keeps recommendation/compare semantics multilingual: %s",
    (input, intent) => {
      expect(analyzeAssistantIntent(input).intent).toBe(intent);
    },
  );
});
