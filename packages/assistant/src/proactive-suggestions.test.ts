import { describe, expect, it } from "vitest";

import {
  ASSISTANT_PROACTIVE_COOLDOWN_MS,
  createAssistantProactiveSuggestionEngine,
  type AssistantProactiveProfile,
} from "./proactive-suggestions.js";

function profile(
  overrides: Partial<AssistantProactiveProfile["behavior"]> = {},
  totalInteractions = 10,
  visitCount = 1,
): AssistantProactiveProfile {
  return {
    visitCount,
    totalInteractions,
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

describe("assistant V1 proactive suggestion decision engine", () => {
  it("gives sunset the V1 critical priority", () => {
    const engine = createAssistantProactiveSuggestionEngine({
      now: () => 1_000_000,
    });
    expect(engine.getSuggestion({ hour: 16, profile: profile() })).toEqual({
      type: "sunset",
      priority: 0.95,
    });
  });

  it("lets rainy-day context outrank profile suggestions", () => {
    const engine = createAssistantProactiveSuggestionEngine({
      now: () => 1_000_000,
    });
    expect(
      engine.getSuggestion({
        hour: 12,
        profile: profile({ isRomantic: true }),
        weather: { temp: 27, precipprob: 80 },
      }),
    ).toEqual({ type: "rainy_day", priority: 0.85 });
  });

  it("preserves first-timer thresholds", () => {
    const engine = createAssistantProactiveSuggestionEngine({
      now: () => 1_000_000,
    });
    expect(
      engine.getSuggestion({
        hour: 7,
        profile: profile({ isFirstTimer: true }, 3),
      }),
    ).toEqual({ type: "first_timer", priority: 0.8 });
  });

  it("preserves after-beach lunch history trigger under 60 minutes", () => {
    const now = 4_000_000;
    const engine = createAssistantProactiveSuggestionEngine({ now: () => now });
    expect(
      engine.getSuggestion({
        hour: 12,
        profile: profile(),
        recentPlaces: [
          {
            name: "Segunda Praia",
            category: "beaches",
            timestamp: now - 30 * 60 * 1000,
          },
        ],
      }),
    ).toEqual({ type: "after_beach", priority: 0.75 });
  });

  it("enforces the V1 five-minute cooldown and can reset it", () => {
    let now = 1_000_000;
    const engine = createAssistantProactiveSuggestionEngine({ now: () => now });

    expect(
      engine.getSuggestion({ hour: 16, profile: profile() }),
    ).not.toBeNull();
    now += ASSISTANT_PROACTIVE_COOLDOWN_MS - 1;
    expect(engine.getSuggestion({ hour: 16, profile: profile() })).toBeNull();

    engine.resetCooldown();
    expect(
      engine.getSuggestion({ hour: 16, profile: profile() }),
    ).not.toBeNull();
  });

  it("uses the V1 profile ordering for visit-count returning users", () => {
    const engine = createAssistantProactiveSuggestionEngine({
      now: () => 1_000_000,
    });
    expect(
      engine.getSuggestion({
        hour: 7,
        profile: profile({ isFirstTimer: true }, 1, 2),
      }),
    ).toEqual({ type: "returning_user", priority: 0.6 });
  });
});
