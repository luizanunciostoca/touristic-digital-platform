import { describe, expect, it } from "vitest";
import {
  analyzeAssistantIntent,
  detectAssistantModifiers,
  extractAssistantEntities,
  LLM_FALLBACK_CONFIDENCE,
  LONG_INPUT_THRESHOLD_CHARS,
  normalizeAssistantText,
} from "./intent-engine.js";

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

  it("extracts the V1 place, category, qualifiers, area, meal, group and language entities", () => {
    expect(
      extractAssistantEntities(
        "Quero restaurante barato na Segunda Praia para 4 pessoas no jantar agora",
      ),
    ).toMatchObject({
      place: "segunda praia",
      category: "beaches",
      priceQualifier: "cheap",
      area: "praia",
      mealType: "dinner",
      groupSize: 4,
      timeQualifier: "now",
      language: "es",
      urgency: "high",
    });

    expect(extractAssistantEntities("Preciso descansar").language).toBe("pt");
    expect(extractAssistantEntities("פתוח עכשיו חוף").language).toBe("he");
  });

  it("preserves the V1 compound modifier vocabulary", () => {
    expect(
      detectAssistantModifiers(
        normalizeAssistantText(
          "restaurante barato perto de mim romântico com vista e aberto agora",
        ),
      ),
    ).toEqual(
      expect.arrayContaining([
        "nearby",
        "cheap",
        "romantic",
        "open_now",
        "scenic_view",
        "now",
      ]),
    );
  });

  it.each([
    ["quero surfar", "category_beaches"],
    ["estou com fome", "category_restaurants"],
    ["preciso de hospedagem", "category_hotels"],
    ["quero comprar presente", "category_shops"],
    ["quero sightseeing", "category_attractions"],
    ["quero uma discoteca", "category_nightlife"],
    ["quero fazer hiking", "category_tours"],
    ["preciso de ambulancia", "category_emergencies"],
  ])("falls back to V1 synonym expansion for %s", (input, expectedIntent) => {
    expect(analyzeAssistantIntent(input).intent).toBe(expectedIntent);
  });

  it("gives active awaiting context priority over generic patterns", () => {
    expect(
      analyzeAssistantIntent("barato", {
        awaiting: { type: "selecionar_subcategoria" },
        lastCategory: "restaurants",
      }),
    ).toMatchObject({
      intent: "category_filtered",
      confidence: 0.85,
      filter: "cheap",
      contextual: true,
    });

    expect(
      analyzeAssistantIntent("sim", {
        awaiting: { type: "confirmar_navegacao" },
      }),
    ).toMatchObject({ intent: "confirm", confidence: 0.95, contextual: true });
  });

  it("preserves contextual detail, category and numeric selection refinements", () => {
    expect(
      analyzeAssistantIntent("preço", {
        lastIntent: "detalhes",
        lastPlace: "Toca do Morcego",
      }),
    ).toMatchObject({ intent: "price" });

    expect(
      analyzeAssistantIntent("ver no mapa", {
        lastCategory: "beaches",
      }),
    ).toMatchObject({ intent: "show_map", contextual: true });

    expect(
      analyzeAssistantIntent("2", { lastCategory: "beaches" }),
    ).toMatchObject({
      intent: "select_option",
      optionIndex: 1,
      contextual: true,
    });
  });

  it("uses V1 place-search heuristics after patterns, synonyms and context", () => {
    expect(analyzeAssistantIntent("Sambass")).toMatchObject({
      intent: "place_search",
      confidence: 0.7,
      entities: { searchQuery: "Sambass" },
    });
    expect(analyzeAssistantIntent("restaurante xyz")).toMatchObject({
      intent: "category_restaurants",
    });
  });

  it("signals the LLM boundary when V1 heuristics reject an unknown input", () => {
    expect(analyzeAssistantIntent("bom demais")).toMatchObject({
      intent: "unknown",
      confidence: 0,
      requiresLLM: true,
    });
  });
});
