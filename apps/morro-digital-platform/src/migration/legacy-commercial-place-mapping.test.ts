import { describe, expect, it } from "vitest";

import { morroV1SearchCatalog } from "@touristic/search";

import {
  LEGACY_COMMERCIAL_SOURCE_SYSTEM,
  legacyCommercialSourceKey,
  proposedLegacyCommercialMapping,
  validateLegacyCommercialMappings,
} from "./legacy-commercial-place-mapping.js";
import { legacyCommercialPlaceMappings } from "./legacy-commercial-place-mappings.js";

const commercialCategories = new Set([
  "restaurants",
  "hotels",
  "shops",
  "nightlife",
]);

describe("legacy commercial Place migration mappings", () => {
  it("freezes exactly the 72 photo-backed commercial mappings", () => {
    expect(legacyCommercialPlaceMappings).toHaveLength(72);
    expect(
      legacyCommercialPlaceMappings.every((mapping) =>
        commercialCategories.has(mapping.legacyCategory),
      ),
    ).toBe(true);
    expect(
      legacyCommercialPlaceMappings.some(
        (mapping) =>
          mapping.legacyCategory === "beaches" ||
          mapping.legacyCategory === "attractions",
      ),
    ).toBe(false);
    expect(() =>
      validateLegacyCommercialMappings(legacyCommercialPlaceMappings),
    ).not.toThrow();
  });

  it("preserves the already-used Toca commercial identity", () => {
    expect(
      legacyCommercialPlaceMappings.find(
        (mapping) =>
          mapping.sourceKey ===
          "nightlife:toca-do-morcego:-13.3766787:-38.9172057",
      ),
    ).toEqual({
      sourceSystem: LEGACY_COMMERCIAL_SOURCE_SYSTEM,
      sourceKey: "nightlife:toca-do-morcego:-13.3766787:-38.9172057",
      legacyName: "Toca do Morcego",
      legacyCategory: "nightlife",
      destinationId: "morro-de-sao-paulo",
      businessId: "toca-do-morcego",
      placeId: "place-toca-do-morcego",
      categoryId: "nightlife",
    });
  });

  it("resolves every mapping to one immutable V1 source row without name authority", () => {
    for (const mapping of legacyCommercialPlaceMappings) {
      const matches = morroV1SearchCatalog.filter(
        (entry) =>
          commercialCategories.has(entry.category) &&
          legacyCommercialSourceKey({
            name: entry.name,
            category: entry.category,
            latitude: entry.latitude,
            longitude: entry.longitude,
          }) === mapping.sourceKey,
      );
      expect(matches).toHaveLength(1);
      expect(matches[0]?.name).toBe(mapping.legacyName);
      expect(matches[0]?.category).toBe(mapping.legacyCategory);
    }
  });

  it("proposes stable ids but treats only the committed mapping as authority", () => {
    expect(
      proposedLegacyCommercialMapping({
        name: "Minha Pousada",
        category: "hotels",
        latitude: -13.38,
        longitude: -38.91,
      }),
    ).toMatchObject({
      businessId: "business-minha-pousada",
      placeId: "place-minha-pousada",
      categoryId: "hotels",
    });
  });

  it("rejects source, Business and Place collisions", () => {
    const base = legacyCommercialPlaceMappings[0];
    if (!base) throw new Error("LEGACY_COMMERCIAL_MAPPING_FIXTURE_MISSING");

    expect(() => validateLegacyCommercialMappings([base, base])).toThrow(
      "LEGACY_COMMERCIAL_MAPPING_SOURCE_DUPLICATE",
    );

    expect(() =>
      validateLegacyCommercialMappings([
        base,
        {
          ...base,
          sourceKey: `${base.sourceKey}:other`,
          placeId: `${base.placeId}-other`,
        },
      ]),
    ).toThrow("LEGACY_COMMERCIAL_MAPPING_BUSINESS_DUPLICATE");

    expect(() =>
      validateLegacyCommercialMappings([
        base,
        {
          ...base,
          sourceKey: `${base.sourceKey}:other`,
          businessId: `${base.businessId}-other`,
        },
      ]),
    ).toThrow("LEGACY_COMMERCIAL_MAPPING_PLACE_DUPLICATE");
  });
});
