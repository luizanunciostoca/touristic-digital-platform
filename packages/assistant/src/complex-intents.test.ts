import { describe, expect, it } from "vitest";

import { classifyAssistantComplexIntent } from "./complex-intents.js";

describe("assistant V1 complex intents", () => {
  it.each([
    ["Qual é a história do Forte de Tapirandu?", "cultural_history", 0.95],
    ["Tem alguma lenda sobre Morro?", "cultural_history", 0.95],
    ["Quais dicas para primeira visita?", "practical_tips", 0.9],
    ["É seguro ir com crianças?", "practical_tips", 0.9],
    ["Como vou de Valença para Morro?", "transport", 0.95],
    ["Posso ir andando?", "transport", 0.95],
    ["É acessível para cadeirante?", "accessibility", 0.9],
    ["Praia calma para crianças", "accessibility", 0.9],
  ] as const)("maps %s to %s", (input, intent, confidence) => {
    expect(classifyAssistantComplexIntent(input)).toEqual({ intent, confidence });
  });

  it("preserves V1 ordering when practical tips and transport overlap", () => {
    expect(classifyAssistantComplexIntent("Tem ferry para Morro?")).toEqual({
      intent: "practical_tips",
      confidence: 0.9,
    });
  });

  it("returns null for a simple local request", () => {
    expect(classifyAssistantComplexIntent("Onde estou?")).toBeNull();
  });
});
