import { describe, expect, it } from "vitest";
import {
  analyzeAssistantIntent,
  LLM_FALLBACK_CONFIDENCE,
  LONG_INPUT_THRESHOLD_CHARS,
  normalizeAssistantText,
} from "./intent-engine";

describe("assistant local intent engine", () => {
  it("keeps the V1 fallback thresholds", () => {
    expect(LLM_FALLBACK_CONFIDENCE).toBe(0.5);
    expect(LONG_INPUT_THRESHOLD_CHARS).toBe(90);
  });

  it("normalizes latin accents without removing Hebrew", () => {
    expect(normalizeAssistantText("Olá, previsão! פתוח עכשיו")).toBe(
      "ola previsao פתוח עכשיו",
    );
  });

  it.each([
    ["Como chegar na Segunda Praia?", "navigate"],
    ["parar navegacao", "cancel_navigation"],
    ["Está aberto agora?", "open_now"],
    ["Vai chover hoje?", "weather"],
    ["Onde estou?", "my_location"],
    ["Fotos de Garapuá", "photos"],
    ["Quanto custa?", "price"],
    ["Que horas fecha?", "hours"],
    ["Mais informações sobre o Forte", "more_info"],
    ["O que tem perto de mim?", "nearby"],
    ["Meus lugares salvos", "favorites"],
    ["O que você faz?", "help"],
    ["sim", "confirm"],
    ["não", "deny"],
    ["Olá!", "greeting"],
    ["Obrigado", "thanks"],
    ["פתוח עכשיו", "open_now"],
  ])("maps %s to %s locally", (input, expectedIntent) => {
    expect(analyzeAssistantIntent(input).intent).toBe(expectedIntent);
    expect(analyzeAssistantIntent(input).requiresLLM).not.toBe(true);
  });

  it("signals the LLM boundary for unknown input", () => {
    expect(
      analyzeAssistantIntent("conte algo inesperado e complexo"),
    ).toMatchObject({
      intent: "unknown",
      confidence: 0,
      requiresLLM: true,
    });
  });
});
