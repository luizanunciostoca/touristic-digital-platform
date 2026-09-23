import { describe, expect, it } from "vitest";

import { morroV1SearchCatalog } from "@touristic/search";

import {
  filterV1ExploreLocations,
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
