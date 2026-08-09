import { describe, expect, it } from "vitest";

import {
  getAssistantContextualMenu,
  getAssistantSmartRecommendation,
} from "./proactive-content.js";
import type { AssistantProactiveProfile } from "./proactive-suggestions.js";

function profile(
  overrides: Partial<AssistantProactiveProfile["behavior"]> = {},
  visitCount = 1,
): AssistantProactiveProfile {
  return {
    visitCount,
    totalInteractions: 8,
    behavior: {
      likesNature: false,
      isNightOwl: false,
      isFirstTimer: false,
      isAdventurer: false,
      isRomantic: false,
      isFamilyTrip: false,
      ...overrides,
    },
  };
}

describe("assistant V1 proactive localized content", () => {
  it("prioritizes continuing the most recent place and caps the contextual menu at eight", () => {
    const result = getAssistantContextualMenu({
      locale: "pt",
      hour: 12,
      profile: profile(),
      recentPlaces: [
        { name: "Segunda Praia", category: "beaches", timestamp: 1000 },
      ],
      topInterests: ["nightlife"],
    });

    expect(result.buttons).toHaveLength(8);
    expect(result.buttons[0]).toMatchObject({
      label: "🔄 Voltar a Segunda Praia",
      value: "[place]Segunda Praia",
      priority: 10,
    });
    expect(result.buttons.some((button) => button.category === "help")).toBe(true);
  });

  it("preserves rainy weather precedence in contextual intros and buttons", () => {
    const result = getAssistantContextualMenu({
      locale: "en",
      hour: 12,
      profile: profile(),
      weather: { temp: 34, precipprob: 80 },
    });

    expect(result.intro).toContain("rain");
    expect(result.buttons[0]).toMatchObject({
      priority: 10,
      category: "attractions",
    });
  });

  it("returns localized Hebrew menu content", () => {
    const result = getAssistantContextualMenu({
      locale: "he",
      hour: 21,
      profile: profile(),
    });

    expect(result.buttons.some((button) => button.label === "חיי לילה")).toBe(true);
    expect(result.buttons.some((button) => button.label === "❓ עזרה")).toBe(true);
  });

  it("composes smart recommendations from time, profile and weather and limits them to four", () => {
    const result = getAssistantSmartRecommendation({
      locale: "pt",
      hour: 12,
      profile: profile({ isAdventurer: true, isRomantic: true }),
      weather: { temp: 33, precipprob: 0 },
    });

    expect(result.recommendations).toHaveLength(4);
    expect(result.text).toContain("Almoço na vila");
    expect(result.text).toContain("Mergulho nas piscinas naturais");
    expect(result.options).toEqual([
      "Ver no mapa",
      "Como chegar",
      "Ver fotos",
      "Outras sugestões",
      "Voltar ao menu",
    ]);
  });

  it("filters recently visited places before slicing recommendations", () => {
    const result = getAssistantSmartRecommendation({
      locale: "en",
      hour: 9,
      profile: profile(),
      recentPlaces: [
        { name: "Second Beach", category: "beaches", timestamp: 1000 },
      ],
    });

    expect(result.text).not.toContain("**Second Beach**");
    expect(result.text).toContain("**Boat tour**");
  });
});
