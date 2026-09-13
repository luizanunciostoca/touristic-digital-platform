import { describe, expect, it } from "vitest";

import {
  createExploreLocationDetailsCommand,
  getAssistantCategoryButtonId,
  getExploreLocationsCategories,
  getExploreLocationsForCategory,
} from "./explore-locations-control.js";

const EXPECTED_CATEGORY_COUNTS = Object.freeze({
  beaches: 8,
  restaurants: 45,
  hotels: 35,
  shops: 12,
  transport: 8,
  attractions: 8,
  tours: 6,
  nightlife: 5,
  emergencies: 4,
});

describe("V1 explore locations control", () => {
  it("exposes the nine frozen location categories in canonical menu order", () => {
    const categories = getExploreLocationsCategories();

    expect(categories.map(({ value }) => value)).toEqual([
      "beaches",
      "restaurants",
      "hotels",
      "shops",
      "transport",
      "attractions",
      "tours",
      "nightlife",
      "emergencies",
    ]);
    expect(categories.map(({ label }) => label)).toEqual([
      "Praias",
      "Restaurantes",
      "Pousadas",
      "Lojas",
      "Transporte",
      "Atrações",
      "Passeios",
      "Vida Noturna",
      "Emergências",
    ]);
  });

  it("preserves the exact V1 POI counts without synthesizing locations", () => {
    const categories = getExploreLocationsCategories();

    expect(
      Object.fromEntries(categories.map(({ value, count }) => [value, count])),
    ).toEqual(EXPECTED_CATEGORY_COUNTS);

    const total = categories.reduce((sum, category) => sum + category.count, 0);
    expect(total).toBe(131);
  });

  it("returns only frozen catalog entries for the selected category", () => {
    const beaches = getExploreLocationsForCategory("beaches");

    expect(beaches).toHaveLength(8);
    expect(beaches.map(({ name }) => name)).toContain("Primeira Praia");
    expect(
      beaches.every(
        ({ category, latitude, longitude }) =>
          category === "beaches" &&
          Number.isFinite(latitude) &&
          Number.isFinite(longitude),
      ),
    ).toBe(true);
  });

  it("binds categories to stable ids on the existing assistant buttons", () => {
    expect(getAssistantCategoryButtonId("beaches")).toBe(
      "assistant-category-beaches",
    );
    expect(getAssistantCategoryButtonId("restaurants")).toBe(
      "assistant-category-restaurants",
    );
  });

  it("reuses the localized Search-to-Details command contract", () => {
    expect(createExploreLocationDetailsCommand("Toca do Morcego")).toBe(
      "Fale sobre Toca do Morcego",
    );
  });
});
