import { describe, expect, it } from "vitest";

import {
  getAssistantContextualMenu,
  getAssistantSmartRecommendation,
  type AssistantProactiveProfile,
} from "./index.js";

const profile: AssistantProactiveProfile = {
  visitCount: 1,
  totalInteractions: 2,
  behavior: {
    likesNature: true,
    isNightOwl: false,
    isFirstTimer: true,
    isAdventurer: false,
    isRomantic: false,
    isFamilyTrip: false,
  },
};

describe("V1 proactive weather behavior", () => {
  it("prioritizes a rainy-day contextual action when rain probability is high", () => {
    const menu = getAssistantContextualMenu({
      locale: "pt",
      hour: 14,
      profile,
      weather: { temp: 27, precipprob: 85, condition: "rain" },
    });

    expect(menu.intro.toLowerCase()).toContain("chuva");
    expect(menu.buttons[0]).toMatchObject({
      category: "attractions",
      priority: 10,
    });
  });

  it("adds weather-aware recommendations without replacing deterministic defaults", () => {
    const result = getAssistantSmartRecommendation({
      locale: "pt",
      hour: 14,
      profile,
      weather: { temp: 28, precipprob: 75, condition: "rain" },
    });

    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(result.recommendations.length).toBeLessThanOrEqual(4);
    expect(
      result.recommendations.some((item) => /chuva|chuv/i.test(item)),
    ).toBe(true);
  });
});
