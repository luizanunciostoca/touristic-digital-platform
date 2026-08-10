import { describe, expect, it } from "vitest";

import { morroV1SearchCatalog } from "./morro-v1-search-catalog.js";
import { morroV1SearchEnrichment } from "./morro-v1-search-enrichment.js";

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

const EXPECTED_AREAS = Object.freeze([
  "caminho",
  "gamboa",
  "garapua",
  "praia",
  "vila",
]);

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

  it("preserves the complete audited enrichment inventory", () => {
    const tags = new Set<string>();
    const areas = new Set<string>();

    expect(morroV1SearchEnrichment).toHaveLength(131);
    for (const item of morroV1SearchCatalog) {
      for (const tag of item.tags ?? []) tags.add(tag);
      if (item.area) areas.add(item.area);
    }

    expect(tags.size).toBe(90);
    expect([...areas].sort()).toEqual(EXPECTED_AREAS);
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

  it("freezes the catalog and enrichment boundaries", () => {
    expect(Object.isFrozen(morroV1SearchCatalog)).toBe(true);
    expect(Object.isFrozen(morroV1SearchEnrichment)).toBe(true);
    expect(
      morroV1SearchCatalog.every(
        (item) =>
          Object.isFrozen(item) && (!item.tags || Object.isFrozen(item.tags)),
      ),
    ).toBe(true);
  });
});
