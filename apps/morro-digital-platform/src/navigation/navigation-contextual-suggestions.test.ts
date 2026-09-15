import { describe, expect, it } from "vitest";

import type { MorroV1SearchCatalogItem } from "@touristic/search";

import type { BrowserLocation } from "./browser-geolocation.js";
import {
  NAVIGATION_SUGGESTION_V1_POLICY,
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
    warmupMs: 0,
    movementThresholdMeters: 30,
    defaultRadiusMeters: 200,
    minIntervalBetweenSuggestionsMs: 0,
    perPlaceCooldownMs: 5 * 60_000,
    sessionMaximum: 10,
    displayDurationMs: 8_000,
    enabledCategories: new Set(["restaurants", "shops", "attractions"]),
    categoryPriority: {
      restaurants: 1,
      attractions: 2,
      shops: 3,
    },
    categoryRadius: {
      restaurants: 200,
      attractions: 300,
      shops: 150,
    },
    sponsors: new Map(),
    ...overrides,
  };
}

const BASE_TIME = 1_000_000;

describe("navigation contextual suggestions", () => {
  it("locks the canonical V1 policy constants recovered from ZIP 55ac", () => {
    expect(NAVIGATION_SUGGESTION_V1_POLICY.warmupMs).toBe(20_000);
    expect(NAVIGATION_SUGGESTION_V1_POLICY.movementThresholdMeters).toBe(30);
    expect(NAVIGATION_SUGGESTION_V1_POLICY.defaultRadiusMeters).toBe(200);
    expect(
      NAVIGATION_SUGGESTION_V1_POLICY.minIntervalBetweenSuggestionsMs,
    ).toBe(60_000);
    expect(NAVIGATION_SUGGESTION_V1_POLICY.perPlaceCooldownMs).toBe(300_000);
    expect(NAVIGATION_SUGGESTION_V1_POLICY.sessionMaximum).toBe(10);
    expect(NAVIGATION_SUGGESTION_V1_POLICY.displayDurationMs).toBe(8_000);
    expect([...NAVIGATION_SUGGESTION_V1_POLICY.enabledCategories]).toEqual([
      "restaurants",
      "shops",
      "attractions",
      "hotels",
      "nightlife",
      "tours",
    ]);
    expect(NAVIGATION_SUGGESTION_V1_POLICY.categoryPriority).toEqual({
      restaurants: 1,
      attractions: 2,
      shops: 3,
      tours: 4,
      hotels: 5,
      nightlife: 6,
      emergencies: 0,
    });
    expect(NAVIGATION_SUGGESTION_V1_POLICY.categoryRadius).toEqual({
      emergencies: 500,
      restaurants: 200,
      shops: 150,
      attractions: 300,
      hotels: 250,
      nightlife: 200,
      tours: 300,
    });
    expect(NAVIGATION_SUGGESTION_V1_POLICY.sponsors.size).toBe(0);
  });

  it("uses V1 Haversine distance in meters", () => {
    expect(
      navigationSuggestionDistanceMeters(
        location(-13.38, -38.91),
        place("same", "restaurants", -13.38, -38.91),
      ),
    ).toBeCloseTo(0, 6);
    expect(
      navigationSuggestionDistanceMeters(
        location(0, 0),
        place("north", "restaurants", 0.001, 0),
      ),
    ).toBeGreaterThan(110);
  });

  it("honors the exact 20 second V1 navigation warmup", () => {
    const session = createNavigationSuggestionSession({
      catalog: [place("Restaurante", "restaurants", -13.38, -38.91)],
      policy: policy({ warmupMs: 20_000 }),
    });
    const current = location(-13.38, -38.91);
    session.start(BASE_TIME);

    expect(session.observe(current, BASE_TIME + 19_999)).toBeNull();
    expect(session.observe(current, BASE_TIME + 20_000)?.placeName).toBe(
      "Restaurante",
    );
  });

  it("requires 30 meters of movement between candidate checks", () => {
    const session = createNavigationSuggestionSession({
      catalog: [
        place("A", "restaurants", -13.38, -38.91),
        place("B", "restaurants", -13.3804, -38.91),
      ],
      policy: policy({ perPlaceCooldownMs: 0 }),
    });
    session.start(BASE_TIME);

    expect(session.observe(location(-13.38, -38.91), BASE_TIME + 1)?.placeName).toBe(
      "A",
    );
    expect(
      session.observe(location(-13.3801, -38.91), BASE_TIME + 2),
    ).toBeNull();
    expect(
      session.observe(location(-13.38031, -38.91), BASE_TIME + 3),
    ).not.toBeNull();
  });

  it("enforces the V1 global 60 second interval between suggestions", () => {
    const session = createNavigationSuggestionSession({
      catalog: [
        place("A", "restaurants", -13.38, -38.91),
        place("B", "restaurants", -13.381, -38.91),
      ],
      policy: policy({
        movementThresholdMeters: 0,
        minIntervalBetweenSuggestionsMs: 60_000,
        perPlaceCooldownMs: 0,
        defaultRadiusMeters: 500,
        categoryRadius: { restaurants: 500 },
      }),
    });
    session.start(BASE_TIME);

    expect(session.observe(location(-13.38, -38.91), BASE_TIME + 1)).not.toBeNull();
    expect(session.observe(location(-13.38, -38.91), BASE_TIME + 59_999)).toBeNull();
    expect(session.observe(location(-13.38, -38.91), BASE_TIME + 60_001)).not.toBeNull();
  });

  it("uses V1 enabled categories and category-specific radii", () => {
    const beach = place("Praia", "beaches", -13.38, -38.91);
    const shop = place("Loja", "shops", -13.3816, -38.91);
    const attraction = place("Atração", "attractions", -13.382, -38.91);
    const session = createNavigationSuggestionSession({
      catalog: [beach, shop, attraction],
      policy: policy(),
    });
    session.start(BASE_TIME);

    // Beaches are not in V1 enabledCategories. Shop is outside its 150m radius,
    // while the attraction remains inside the canonical 300m radius.
    expect(session.observe(location(-13.38, -38.91), BASE_TIME + 1)?.placeName).toBe(
      "Atração",
    );
  });

  it("ranks lower V1 priority first, then the nearest place", () => {
    const restaurant = place("Restaurante", "restaurants", -13.3815, -38.91);
    const attraction = place("Atração", "attractions", -13.3801, -38.91);
    const session = createNavigationSuggestionSession({
      catalog: [attraction, restaurant],
      policy: policy({
        categoryRadius: { restaurants: 300, attractions: 300 },
      }),
    });
    session.start(BASE_TIME);

    expect(session.observe(location(-13.38, -38.91), BASE_TIME + 1)?.placeName).toBe(
      "Restaurante",
    );
  });

  it("places V1 sponsors before organic candidates using sponsor radius/priority", () => {
    const sponsor = place("Parceiro", "shops", -13.382, -38.91);
    const restaurant = place("Restaurante", "restaurants", -13.3801, -38.91);
    const session = createNavigationSuggestionSession({
      catalog: [restaurant, sponsor],
      policy: policy({
        sponsors: new Map([
          ["Parceiro", { priority: 1, radiusMeters: 300 }],
        ]),
      }),
    });
    session.start(BASE_TIME);

    const selected = session.observe(
      location(-13.38, -38.91),
      BASE_TIME + 1,
    );
    expect(selected?.placeName).toBe("Parceiro");
    expect(selected?.sponsored).toBe(true);
  });

  it("enforces five minute per-place cooldown and ten suggestion session maximum", () => {
    const nearby = place("Ponto", "restaurants", -13.38, -38.91);
    const session = createNavigationSuggestionSession({
      catalog: [nearby],
      policy: policy({
        movementThresholdMeters: 0,
        perPlaceCooldownMs: 300_000,
        sessionMaximum: 10,
      }),
    });
    session.start(BASE_TIME);

    expect(session.observe(location(-13.38, -38.91), BASE_TIME + 1)).not.toBeNull();
    expect(session.observe(location(-13.38, -38.91), BASE_TIME + 299_999)).toBeNull();
    expect(session.observe(location(-13.38, -38.91), BASE_TIME + 300_001)).not.toBeNull();
  });

  it("resets cooldown and counters for a new navigation session", () => {
    const session = createNavigationSuggestionSession({
      catalog: [place("Ponto", "restaurants", -13.38, -38.91)],
      policy: policy({
        movementThresholdMeters: 0,
        perPlaceCooldownMs: 0,
        sessionMaximum: 1,
      }),
    });
    const current = location(-13.38, -38.91);
    session.start(BASE_TIME);
    expect(session.observe(current, BASE_TIME + 1)).not.toBeNull();
    expect(session.observe(current, BASE_TIME + 2)).toBeNull();

    session.stop();
    session.start(BASE_TIME + 10_000);
    expect(session.observe(current, BASE_TIME + 10_001)).not.toBeNull();
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
