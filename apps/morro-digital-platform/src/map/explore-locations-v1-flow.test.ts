import { describe, expect, it } from "vitest";

import { morroV1SearchCatalog } from "@touristic/search";

import {
  filterV1ExploreLocations,
  resolveV1ExploreAppliedResult,
  getV1ExploreSubcategoryOptions,
  sortV1ExploreNearby,
} from "./explore-locations-v1-flow.js";

function category(name: string) {
  return morroV1SearchCatalog.filter((location) => location.category === name);
}

describe("V1 assistant category subflows", () => {
  it("preserves the exact staged filter menu for beaches", () => {
    expect(
      getV1ExploreSubcategoryOptions("beaches").map(({ value, action }) => ({
        value,
        action,
      })),
    ).toEqual([
      { value: "surf", action: "filter" },
      { value: "mergulho", action: "filter" },
      { value: "por do sol", action: "filter" },
      { value: "familiar", action: "filter" },
      { value: "estrutura", action: "filter" },
      { value: "proximo", action: "nearby" },
      { value: "ver todos", action: "all" },
      { value: "voltar_menu", action: "back-menu" },
    ]);
  });

  it("keeps immersive-tour shortcuts out of the tours category filter rail", () => {
    const options = getV1ExploreSubcategoryOptions("tours");
    expect(options.map(({ value, action }) => ({ value, action }))).toEqual([
      { value: "barco", action: "filter" },
      { value: "mergulho", action: "filter" },
      { value: "aventura", action: "filter" },
      { value: "fauna", action: "filter" },
      { value: "proximo", action: "nearby" },
      { value: "ver todos", action: "all" },
      { value: "voltar_menu", action: "back-menu" },
    ]);
    expect(options.some(({ action }) => action === "tour")).toBe(false);
    expect(options.some(({ tourId }) => tourId !== undefined)).toBe(false);
  });

  it("localizes V1 filter presentation without changing command values", () => {
    const english = getV1ExploreSubcategoryOptions("restaurants", "en");
    const spanish = getV1ExploreSubcategoryOptions("beaches", "es");
    const hebrew = getV1ExploreSubcategoryOptions("hotels", "he");
    const transport = getV1ExploreSubcategoryOptions("transport", "en");

    expect(english[0]?.label).toBe("🌊 On the beach");
    expect(english.at(-3)?.label).toBe("📍 Nearby");
    expect(english.at(-1)?.label).toBe("🔙 Back to menu");
    expect(spanish[0]?.label).toBe("🏄 Con olas para surf");
    expect(hebrew[0]?.label).toBe("🌊 מול החוף");
    expect(transport[0]?.label).toBe("⛵ Speedboat / Catamaran");
    expect(english.map(({ value }) => value)).toEqual(
      getV1ExploreSubcategoryOptions("restaurants", "pt").map(
        ({ value }) => value,
      ),
    );
  });

  it("localizes the tours filters without reintroducing immersive shortcuts", () => {
    expect(getV1ExploreSubcategoryOptions("tours", "pt")[0]?.label).toBe(
      "⛵ Passeio de barco",
    );
    expect(getV1ExploreSubcategoryOptions("tours", "en")[0]?.label).toBe(
      "⛵ Boat tour",
    );
    expect(getV1ExploreSubcategoryOptions("tours", "es")[0]?.label).toBe(
      "⛵ Paseo en barco",
    );
    expect(getV1ExploreSubcategoryOptions("tours", "he")[0]?.value).toBe(
      "barco",
    );
  });

  it("filters the frozen V1 catalog with its area and tag enrichment", () => {
    const beaches = category("beaches");
    const restaurants = category("restaurants");

    const surf = filterV1ExploreLocations("beaches", "surf", beaches);
    const village = filterV1ExploreLocations(
      "restaurants",
      "na vila",
      restaurants,
    );
    const seafood = filterV1ExploreLocations(
      "restaurants",
      "frutos do mar",
      restaurants,
    );

    expect(surf.map(({ name }) => name)).toContain("Primeira Praia");
    expect(surf.length).toBeGreaterThan(0);
    expect(village.length).toBeGreaterThan(0);
    expect(village.every(({ area }) => area === "vila")).toBe(true);
    expect(seafood.length).toBeGreaterThan(0);
    expect(
      seafood.every(({ tags }) =>
        tags?.some((tag) => tag === "frutos do mar" || tag === "seafood"),
      ),
    ).toBe(true);
  });

  it("uses V1 Haversine ordering and caps nearby results at twelve", () => {
    const restaurants = category("restaurants");
    const nearby = sortV1ExploreNearby(
      restaurants,
      { latitude: -13.3776181, longitude: -38.9142193 },
      12,
    );

    expect(nearby).toHaveLength(12);
    expect(new Set(nearby.map(({ name }) => name)).size).toBe(12);
  });
});

describe("criteria emitted by the actual filter execution", () => {
  it("counts the vegetarian criterion only when the real predicate is applied", () => {
    const option = getV1ExploreSubcategoryOptions("restaurants").find(
      (option) => option.value === "vegetariano",
    )!;
    const result = resolveV1ExploreAppliedResult(
      "restaurants",
      option,
      category("restaurants"),
    );
    expect(result.locations).toEqual(
      filterV1ExploreLocations(
        "restaurants",
        "vegetariano",
        category("restaurants"),
      ),
    );
    expect(result.criteria.map((x) => x.kind)).toEqual(["category", "filter"]);
    expect(result.criteria[1]?.value).toBe("vegetariano");
    const nonmatching = category("restaurants").filter(
      (item) => !result.locations.includes(item),
    );
    const fallback = resolveV1ExploreAppliedResult(
      "restaurants",
      option,
      nonmatching,
    );
    expect(fallback.applied).toBe(false);
    expect(fallback.locations).toEqual(nonmatching);
    expect(fallback.criteria).toEqual([
      { kind: "category", value: "restaurants" },
    ]);
  });
  it("records nearby only after permitted location and actual ranking, and rejects invented criteria", () => {
    const option = getV1ExploreSubcategoryOptions("restaurants").find(
      (option) => option.action === "nearby",
    )!;
    const denied = resolveV1ExploreAppliedResult(
      "restaurants",
      option,
      category("restaurants"),
      null,
    );
    expect(denied.criteria).toHaveLength(1);
    const position = { latitude: -13.38, longitude: -38.91 };
    const ranked = resolveV1ExploreAppliedResult(
      "restaurants",
      option,
      category("restaurants"),
      position,
    );
    expect(ranked.locations).toEqual(
      sortV1ExploreNearby(category("restaurants"), position, 12),
    );
    expect(ranked.criteria.map((x) => x.kind)).toEqual(["category", "nearby"]);
    expect(() =>
      resolveV1ExploreAppliedResult(
        "restaurants",
        { action: "filter", value: "invented", label: "invented" },
        category("restaurants"),
      ),
    ).toThrow("EXPLORE_FILTER_UNKNOWN");
  });
  it("all resets fine criteria while retaining the applied category", () => {
    const option = getV1ExploreSubcategoryOptions("restaurants").find(
      (option) => option.action === "all",
    )!;
    expect(
      resolveV1ExploreAppliedResult(
        "restaurants",
        option,
        category("restaurants"),
      ).criteria,
    ).toEqual([{ kind: "category", value: "restaurants" }]);
  });
});
