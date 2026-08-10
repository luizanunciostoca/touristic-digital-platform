import { describe, expect, it } from "vitest";

import { morroV1SearchCatalog } from "./morro-v1-search-catalog.js";

const EXPECTED_CATEGORY_COUNTS = Object.freeze({
  beaches: 8,
  restaurants: 45,
  hotels: 35,
  shops: 12,
  transport: 8,
  attractions: 8,
  nightlife: 5,
  emergencies: 4,
  tours: 6,
});

describe("morroV1SearchCatalog", () => {
  it("preserves the frozen V1 catalog size and category inventory", () => {
    const categoryCounts = morroV1SearchCatalog.reduce<Record<string, number>>(
      (counts, item) => {
        counts[item.category] = (counts[item.category] ?? 0) + 1;
        return counts;
      },
      {},
    );

    expect(morroV1SearchCatalog).toHaveLength(131);
    expect(categoryCounts).toEqual(EXPECTED_CATEGORY_COUNTS);
  });

  it("keeps every base discovery entry structurally usable", () => {
    for (const item of morroV1SearchCatalog) {
      expect(item.name.trim().length).toBeGreaterThan(0);
      expect(item.category.trim().length).toBeGreaterThan(0);
      expect(Number.isFinite(item.latitude)).toBe(true);
      expect(Number.isFinite(item.longitude)).toBe(true);
      expect(item.latitude).toBeGreaterThanOrEqual(-90);
      expect(item.latitude).toBeLessThanOrEqual(90);
      expect(item.longitude).toBeGreaterThanOrEqual(-180);
      expect(item.longitude).toBeLessThanOrEqual(180);
    }
  });

  it("is frozen at the catalog boundary", () => {
    expect(Object.isFrozen(morroV1SearchCatalog)).toBe(true);
  });
});
