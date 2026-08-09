import { describe, expect, it } from "vitest";
import { V1_ASSISTANT_BASELINE } from "../packages/assistant/src/v1-baseline";

describe("FEATURE-0004 V1 assistant baseline", () => {
  it("pins the canonical frozen V1 source", () => {
    expect(V1_ASSISTANT_BASELINE.legacyCommit).toBe(
      "60746fd7fed97b805758b37adfdbe3bad2582bfe",
    );
    expect(
      Object.keys(V1_ASSISTANT_BASELINE.sourceBlobs).length,
    ).toBeGreaterThanOrEqual(16);
  });

  it("preserves the ten canonical main-menu semantics in four languages", () => {
    expect(V1_ASSISTANT_BASELINE.canonicalMenu).toHaveLength(10);
    expect(
      V1_ASSISTANT_BASELINE.canonicalMenu.map(({ value }) => value),
    ).toEqual([
      "beaches",
      "restaurants",
      "hotels",
      "shops",
      "transport",
      "attractions",
      "tours",
      "nightlife",
      "emergencies",
      "help",
    ]);
    expect(V1_ASSISTANT_BASELINE.locales).toEqual(["pt", "en", "es", "he"]);
  });

  it("keeps local NLP ahead of the LLM fallback", () => {
    expect(V1_ASSISTANT_BASELINE.intentEngine.localFirst).toBe(true);
    expect(
      V1_ASSISTANT_BASELINE.intentEngine.llmFallbackConfidenceBelow,
    ).toBe(0.5);
    expect(V1_ASSISTANT_BASELINE.intentEngine.longInputThresholdChars).toBe(90);
    expect(V1_ASSISTANT_BASELINE.intentEngine.modifiersSupported).toBe(true);
  });

  it("freezes high-value intent contracts", () => {
    expect(V1_ASSISTANT_BASELINE.intentEngine.keyIntents).toEqual(
      expect.arrayContaining([
        "navigate",
        "cancel_navigation",
        "open_now",
        "weather",
        "my_location",
        "nearby",
        "favorites",
        "help",
      ]),
    );
  });

  it("preserves navigation and voice while moving provider secrets server-side", () => {
    expect(V1_ASSISTANT_BASELINE.integrations.navigation).toBe(true);
    expect(V1_ASSISTANT_BASELINE.integrations.voiceSynthesis).toBe(true);
    expect(V1_ASSISTANT_BASELINE.integrations.multilingualVoice).toBe(true);
    expect(V1_ASSISTANT_BASELINE.integrations.aiApiRelation).toBe("/api/ai/*");
    expect(V1_ASSISTANT_BASELINE.integrations.targetProviderBoundary).toBe(
      "same-origin-server",
    );
    expect(
      V1_ASSISTANT_BASELINE.integrations.clientProviderSecretsAllowed,
    ).toBe(false);
  });
});
