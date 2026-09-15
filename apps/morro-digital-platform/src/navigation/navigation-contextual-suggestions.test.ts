import { describe, expect, it } from "vitest";

import type { MorroV1SearchCatalogItem } from "@touristic/search";

import type { BrowserLocation } from "./browser-geolocation.js";
import {
  createNavigationSuggestionSession,
  navigationSuggestionDistanceMeters,
  navigationSuggestionMessage,
  type NavigationSuggestionPolicy,
} from "./navigation-contextual-suggestions.js";

function location(latitude: number, longitude: number): BrowserLocation {
  return {
    latitude,
    longitude,
    accuracy: 5,
    heading: null,
    speed: 1,
    timestamp: 0,
  };
}

function place(
  name: string,
  category: string,
  latitude: number,
  longitude: number,
): MorroV1SearchCatalogItem {
  return { name, category, latitude, longitude };
}

function policy(
  overrides: Partial<NavigationSuggestionPolicy> = {},
): NavigationSuggestionPolicy {
  return {
    warmupMs: 30_000,
    movementThresholdMeters: 20,
    proximityMeters: 200,
    perPlaceCooldownMs: 60_000,
    sessionMaximum: 3,
    categoryPriority: { beaches: 10, restaurants: 20 },
    sponsoredNames: new Set<string>(),
    ...overrides,
  };
}

describe("navigation contextual suggestions", () => {
  it("uses geographic distance in meters", () => {
    expect(
      navigationSuggestionDistanceMeters(
        location(-13.38, -38.91),
        place("same", "beaches", -13.38, -38.91),
      ),
    ).toBeCloseTo(0, 6);
    expect(
      navigationSuggestionDistanceMeters(
        location(0, 0),
        place("north", "beaches", 0.001, 0),
      ),
    ).toBeGreaterThan(110);
  });

  it("honors navigation warmup before considering nearby places", () => {
    const session = createNavigationSuggestionSession({
      catalog: [place("Praia", "beaches", -13.38, -38.91)],
      policy: policy(),
    });
    const current = location(-13.38, -38.91);
    session.start(1_000);

    expect(session.observe(current, 30_999)).toBeNull();
    expect(session.observe(current, 31_000)?.placeName).toBe("Praia");
  });

  it("ranks sponsor then category and emits at most one place per movement cycle", () => {
    const sponsored = place("Parceiro", "beaches", -13.38045, -38.91);
    const restaurant = place("Restaurante", "restaurants", -13.3801, -38.91);
    const session = createNavigationSuggestionSession({
      catalog: [restaurant, sponsored],
      policy: policy({
        warmupMs: 0,
        sponsoredNames: new Set(["Parceiro"]),
      }),
    });
    session.start(0);

    expect(session.observe(location(-13.38, -38.91), 1)?.placeName).toBe(
      "Parceiro",
    );
    expect(session.observe(location(-13.38005, -38.91), 2)).toBeNull();
    expect(session.observe(location(-13.3803, -38.91), 3)?.placeName).toBe(
      "Restaurante",
    );
  });

  it("enforces per-place cooldown and session maximums", () => {
    const nearby = place("Ponto", "beaches", -13.38, -38.91);
    const session = createNavigationSuggestionSession({
      catalog: [nearby],
      policy: policy({
        warmupMs: 0,
        movementThresholdMeters: 0,
        perPlaceCooldownMs: 100,
        sessionMaximum: 2,
      }),
    });
    session.start(0);

    expect(session.observe(location(-13.38, -38.91), 1)).not.toBeNull();
    expect(session.observe(location(-13.38, -38.91), 50)).toBeNull();
    expect(session.observe(location(-13.38, -38.91), 101)).not.toBeNull();
    expect(session.observe(location(-13.38, -38.91), 500)).toBeNull();
  });

  it("resets cooldown and limits for a new navigation session", () => {
    const session = createNavigationSuggestionSession({
      catalog: [place("Ponto", "beaches", -13.38, -38.91)],
      policy: policy({
        warmupMs: 0,
        movementThresholdMeters: 0,
        sessionMaximum: 1,
      }),
    });
    const current = location(-13.38, -38.91);
    session.start(0);
    expect(session.observe(current, 1)).not.toBeNull();
    expect(session.observe(current, 2)).toBeNull();

    session.stop();
    session.start(10);
    expect(session.observe(current, 11)).not.toBeNull();
  });

  it("provides localized PT/EN/ES/HE copy", () => {
    expect(navigationSuggestionMessage("pt", "Praia", 42)).toContain(
      "42 metros",
    );
    expect(navigationSuggestionMessage("en", "Beach", 42)).toContain(
      "42 meters",
    );
    expect(navigationSuggestionMessage("es", "Playa", 42)).toContain(
      "42 metros",
    );
    expect(navigationSuggestionMessage("he", "חוף", 42)).toContain("42");
  });
});
