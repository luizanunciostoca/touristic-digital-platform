import { describe, expect, it } from "vitest";

import {
  assistantRequiresLLM,
  countAssistantSemanticDimensions,
} from "./llm-policy.js";

describe("assistant V1 LLM fallback policy", () => {
  it.each([
    "cultural_history",
    "practical_tips",
    "transport",
    "accessibility",
    "unknown",
  ] as const)("always routes %s to the LLM boundary", (intent) => {
    expect(
      assistantRequiresLLM("pergunta curta", {
        intent,
        confidence: 1,
      }),
    ).toBe(true);
  });

  it("preserves the confidence and explicit fallback gates", () => {
    expect(
      assistantRequiresLLM("teste", {
        intent: "help",
        confidence: 0.49,
      }),
    ).toBe(true);
    expect(
      assistantRequiresLLM("teste", {
        intent: "help",
        confidence: 1,
        requiresLLM: true,
      }),
    ).toBe(true);
  });

  it("counts semantic dimensions exactly like the V1 policy", () => {
    const input = "restaurante barato perto de mim hoje para casal";
    expect(countAssistantSemanticDimensions(input)).toBeGreaterThanOrEqual(3);
    expect(
      assistantRequiresLLM(input, {
        intent: "category_restaurants",
        confidence: 0.9,
      }),
    ).toBe(true);
  });

  it.each([
    "Por que Morro de São Paulo se chama assim?",
    "Qual a melhor praia para família?",
    "Vale a pena ir para a Quarta Praia?",
    "Qual a diferença entre praia e pousada?",
  ])("routes V1 complex pattern %s to the LLM boundary", (input) => {
    expect(
      assistantRequiresLLM(input, {
        intent: "place_search",
        confidence: 0.7,
      }),
    ).toBe(true);
  });

  it("preserves the V1 long-input threshold as strictly greater than 90 chars", () => {
    const exactlyNinety = "x".repeat(90);
    const ninetyOne = "x".repeat(91);

    expect(
      assistantRequiresLLM(exactlyNinety, {
        intent: "help",
        confidence: 1,
      }),
    ).toBe(false);
    expect(
      assistantRequiresLLM(ninetyOne, {
        intent: "help",
        confidence: 1,
      }),
    ).toBe(true);
  });

  it("keeps simple high-confidence local intents local", () => {
    expect(
      assistantRequiresLLM("Onde estou?", {
        intent: "my_location",
        confidence: 1,
      }),
    ).toBe(false);
  });
});
