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

  it("preserves the three immersive-tour shortcuts before tour filters", () => {
    const options = getV1ExploreSubcategoryOptions("tours");
    expect(options.slice(0, 3).map(({ value, tourId }) => [value, tourId])).toEqual([
      ["tour_volta_ilha", "volta-a-ilha"],
      ["tour_trilha_gamboa", "trilha-gamboa"],
      ["tour_quadriciclo", "passeio-quadriciclo"],
    ]);
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
