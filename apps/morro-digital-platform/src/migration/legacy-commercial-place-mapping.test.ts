import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import { morroV1SearchCatalog } from "@touristic/search";

import type { LegacyCommercialPlaceMapping } from "./legacy-commercial-place-mapping.js";

import { listAssistantV1PhotoCatalogEntries } from "../assistant/assistant-v1-photo-catalog.js";
import {
  legacyCommercialSourceKey,
  proposedLegacyCommercialMapping,
  validateLegacyCommercialMappings,
} from "./legacy-commercial-place-mapping.js";
const legacyCommercialPlaceMappings = JSON.parse(
  readFileSync(
    new URL("./legacy-commercial-place-mappings.json", import.meta.url),
    "utf8",
  ),
) as readonly LegacyCommercialPlaceMapping[];

const COMMERCIAL = new Set(["restaurants", "hotels", "shops", "nightlife"]);

function expectedCommercialPhotoRows() {
  const photoNames = new Set(
    listAssistantV1PhotoCatalogEntries().map((entry) => entry.place),
  );
  return morroV1SearchCatalog.filter(
    (entry) =>
      photoNames.has(entry.name) &&
      COMMERCIAL.has(entry.category) &&
      Number.isFinite(entry.latitude) &&
      Number.isFinite(entry.longitude),
  );
}

describe("legacy commercial Place mappings", () => {
  it("covers exactly the commercial V1 photo catalog subset", () => {
    const expected = expectedCommercialPhotoRows();
    expect(expected).toHaveLength(72);
    expect(legacyCommercialPlaceMappings).toHaveLength(72);

    const expectedKeys = expected.map((entry) =>
      legacyCommercialSourceKey({
        name: entry.name,
        category: entry.category,
        latitude: entry.latitude,
        longitude: entry.longitude,
      }),
    );
    expect(
      legacyCommercialPlaceMappings.map((mapping) => mapping.sourceKey).sort(),
    ).toEqual([...expectedKeys].sort());
  });

  it("uses explicit unique canonical IDs and excludes public POIs", () => {
    expect(() =>
      validateLegacyCommercialMappings(legacyCommercialPlaceMappings),
    ).not.toThrow();

    expect(
      legacyCommercialPlaceMappings.some((mapping) =>
        ["beaches", "attractions"].includes(mapping.legacyCategory),
      ),
    ).toBe(false);

    const toca = legacyCommercialPlaceMappings.find(
      (mapping) => mapping.legacyName === "Toca do Morcego",
    );
    expect(toca).toMatchObject({
      legacyCategory: "nightlife",
      businessId: "toca-do-morcego",
      placeId: "place-toca-do-morcego",
      categoryId: "nightlife",
    });
  });

  it("keeps name-derived proposals migration-only and freezes them as explicit mappings", () => {
    const proposal = proposedLegacyCommercialMapping({
      name: "Café das Artes",
      category: "restaurants",
      latitude: -13.3780708,
      longitude: -38.9168545,
    });

    const frozen = legacyCommercialPlaceMappings.find(
      (mapping) => mapping.sourceKey === proposal.sourceKey,
    );
    expect(frozen).toEqual(proposal);
  });
});
