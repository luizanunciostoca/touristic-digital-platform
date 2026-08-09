import { describe, expect, it } from "vitest";

import {
  assistantV1FuzzyThreshold,
  matchMorroAssistantDestinationV1,
  resolveMorroAssistantDestinationV1,
} from "./assistant-v1-place-resolver.js";

describe("V1 assistant place resolver semantics", () => {
  it("preserves the frozen V1 fuzzy threshold", () => {
    expect(assistantV1FuzzyThreshold).toBe(0.55);
  });

  it("prefers exact canonical-name matches", () => {
    expect(matchMorroAssistantDestinationV1("Basílico")?.matchType).toBe(
      "exact",
    );
  });

  it("resolves exact aliases before partial matching", () => {
    const match = matchMorroAssistantDestinationV1("basilico");
    expect(match?.matchType).toBe("alias");
    expect(match?.destination.name).toBe("Basílico");
  });

  it("supports canonical and alias inclusion in either direction", () => {
    expect(
      matchMorroAssistantDestinationV1("quero ir para toca do morcego")
        ?.matchType,
    ).toBe("partial");
    expect(
      matchMorroAssistantDestinationV1("restaurante basilico agora")
        ?.matchType,
    ).toBe("alias_partial");
  });

  it("uses Dice fuzzy matching for V1-style typos", () => {
    const match = matchMorroAssistantDestinationV1("baslico");
    expect(match?.matchType).toBe("fuzzy");
    expect(match?.destination.name).toBe("Basílico");
    expect(match?.score).toBeGreaterThanOrEqual(0.55);
  });

  it("keeps unknown text unresolved instead of inventing coordinates", () => {
    expect(resolveMorroAssistantDestinationV1("destino totalmente inventado"))
      .toBeNull();
  });
});
