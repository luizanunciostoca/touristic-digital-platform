import type { DestinationId } from "@touristic/core";
import { describe, expect, it } from "vitest";

import {
  asBusinessId,
  asCategoryId,
  asOfferId,
  asPlaceId,
  asProductId,
  asSubcategoryId,
  authorizePlaceAccess,
  createBusinessPlaceRelationship,
  findDuplicatePlace,
  migrateLegacyBusinessProfileToPlace,
  migrateLegacyCatalogItemToPlace,
  normalizeLegacyCategory,
  normalizePlaceCapabilities,
  validateBusinessPlaceRelationship,
  validatePlace,
  type Business,
  type Category,
  type Place,
  type Subcategory,
} from "./place-domain.js";

const destinationId = "morro-de-sao-paulo" as DestinationId;
const otherDestinationId = "itacare" as DestinationId;
const categoryId = asCategoryId("restaurants");
const seafoodId = asSubcategoryId("seafood");

const categories: readonly Category[] = Object.freeze([
  Object.freeze({
    id: categoryId,
    key: "restaurants",
    label: "Restaurantes",
    active: true,
  }),
]);

const subcategories: readonly Subcategory[] = Object.freeze([
  Object.freeze({
    id: seafoodId,
    categoryId,
    key: "seafood",
    label: "Frutos do mar",
    active: true,
  }),
]);

function place(overrides: Partial<Place> = {}): Place {
  return Object.freeze({
    id: asPlaceId("place-toca"),
    businessId: asBusinessId("business-toca"),
    destinationId,
    name: "Toca do Morcego",
    slug: "toca-do-morcego",
    categoryId,
    subcategoryIds: Object.freeze([seafoodId]),
    shortDescription: "Experiência local",
    description: "Descrição",
    location: Object.freeze({
      latitude: -13.379,
      longitude: -38.913,
      address: "Morro de São Paulo",
      area: "Primeira Praia",
      source: "manual" as const,
      externalProvider: null,
      externalPlaceId: null,
      verifiedAt: null,
      verifiedBy: null,
    }),
    contact: Object.freeze({
      phone: null,
      whatsapp: null,
      email: null,
      website: null,
    }),
    openingHours: null,
    amenities: Object.freeze([]),
    tags: Object.freeze([]),
    capabilities: Object.freeze({
      enabled: Object.freeze(["directions", "photos"] as const),
    }),
    visibility: "public" as const,
    publicationState: "published" as const,
    createdAt: "2026-09-24T20:00:00.000Z",
    updatedAt: "2026-09-24T20:00:00.000Z",
    ...overrides,
  });
}

describe("canonical identifiers", () => {
  it("normalizes valid IDs and rejects empty identifiers", () => {
    expect(asBusinessId(" Business Toca ")).toBe("business-toca");
    expect(asPlaceId("PLACE/Toca")).toBe("place-toca");
    expect(asProductId(" Product 123 ")).toBe("product-123");
    expect(asOfferId(" Offer 123 ")).toBe("offer-123");
    expect(() => asPlaceId("<>")).toThrow("INVALID_PLACE_ID");
  });
});

describe("Business ↔ Place relationships", () => {
  const business: Business = Object.freeze({
    id: asBusinessId("business-toca"),
    destinationIds: Object.freeze([destinationId]),
    legalName: "Toca do Morcego Ltda",
    displayName: "Toca do Morcego",
    createdAt: "2026-09-24T20:00:00.000Z",
    updatedAt: "2026-09-24T20:00:00.000Z",
  });

  it("accepts an owned place inside an allowed destination", () => {
    const ownedPlace = place();
    const relation = createBusinessPlaceRelationship(ownedPlace);
    expect(
      validateBusinessPlaceRelationship(business, ownedPlace, relation),
    ).toEqual([]);
  });

  it("rejects a cross-business relation", () => {
    const foreignPlace = place({
      businessId: asBusinessId("other-business"),
    });
    const relation = createBusinessPlaceRelationship(foreignPlace);
    expect(
      validateBusinessPlaceRelationship(business, foreignPlace, relation),
    ).toContainEqual({
      code: "CROSS_BUSINESS_RELATION",
      field: "businessId",
    });
  });

  it("rejects a cross-destination relation", () => {
    const foreignPlace = place({ destinationId: otherDestinationId });
    const relation = createBusinessPlaceRelationship(foreignPlace);
    expect(
      validateBusinessPlaceRelationship(business, foreignPlace, relation),
    ).toContainEqual({
      code: "CROSS_DESTINATION_RELATION",
      field: "destinationId",
    });
  });

  it("supports one business with multiple explicitly identified places", () => {
    const first = place({ id: asPlaceId("toca-morro") });
    const second = place({
      id: asPlaceId("toca-itacare"),
      destinationId: destinationId,
      slug: "toca-itacare",
    });

    for (const ownedPlace of [first, second]) {
      expect(
        validateBusinessPlaceRelationship(
          business,
          ownedPlace,
          createBusinessPlaceRelationship(ownedPlace),
        ),
      ).toEqual([]);
    }
    expect(first.id).not.toBe(second.id);
  });
});

describe("categories and capabilities", () => {
  it("validates category and subcategory ownership", () => {
    expect(validatePlace(place(), categories, subcategories)).toEqual([]);

    const invalid = place({
      subcategoryIds: Object.freeze([asSubcategoryId("unknown")]),
    });
    expect(validatePlace(invalid, categories, subcategories)).toContainEqual({
      code: "INVALID_SUBCATEGORY_RELATION",
      field: "subcategoryIds",
    });
  });

  it("normalizes capabilities to the canonical allow-list", () => {
    expect(
      normalizePlaceCapabilities([
        "directions",
        "menu",
        "menu",
        "unknown",
        null,
      ]),
    ).toEqual(["directions", "menu"]);
  });
});

describe("tenant and destination authorization", () => {
  it("allows explicit scoped access and rejects cross-business access", () => {
    const ownedPlace = place();
    expect(() =>
      authorizePlaceAccess(
        ownedPlace,
        {
          businessIds: ["business-toca"],
          destinationIds: ["morro-de-sao-paulo"],
          capabilities: ["business.read", "business.update"],
        },
        { mutation: true, requiredCapability: "business.update" },
      ),
    ).not.toThrow();

    expect(() =>
      authorizePlaceAccess(ownedPlace, {
        businessIds: ["other-business"],
        destinationIds: ["morro-de-sao-paulo"],
        capabilities: ["business.read"],
      }),
    ).toThrow("PLACE_ACCESS_BUSINESS_DENIED");
  });
});

describe("duplicate place detection", () => {
  it("detects canonical ID duplicates", () => {
    const existing = place();
    expect(findDuplicatePlace(place(), [existing])).toBe(existing);
  });

  it("detects duplicate provider identity within the same tenant and destination", () => {
    const existing = place({
      id: asPlaceId("provider-a"),
      location: Object.freeze({
        ...place().location,
        source: "provider" as const,
        externalProvider: "mapbox",
        externalPlaceId: "poi.123",
      }),
    });
    const candidate = place({
      id: asPlaceId("provider-b"),
      location: existing.location,
    });
    expect(findDuplicatePlace(candidate, [existing])).toBe(existing);
  });

  it("does not treat a matching slug as canonical identity", () => {
    const existing = place({ id: asPlaceId("one") });
    const candidate = place({ id: asPlaceId("two") });
    expect(findDuplicatePlace(candidate, [existing])).toBeNull();
  });
});

describe("legacy migration", () => {
  it("requires explicit canonical ownership instead of deriving it from display data", () => {
    const migrated = migrateLegacyBusinessProfileToPlace({
      placeId: "place-toca",
      businessId: "business-toca",
      destinationId: "morro-de-sao-paulo",
      categoryId: "nightlife",
      now: "2026-09-24T20:00:00.000Z",
      profile: {
        id: "legacy-profile-toca",
        name: "Toca do Morcego",
        categoryLabel: "Vida noturna",
        specialty: "Sunset",
        description: "Experiência",
        locationLabel: "Morro de São Paulo",
      },
      legacyAliases: ["Toca", "Morcego"],
      legacyReference: "legacy-product-reference",
    });

    expect(migrated.place).toMatchObject({
      id: "place-toca",
      businessId: "business-toca",
      destinationId: "morro-de-sao-paulo",
      categoryId: "nightlife",
      publicationState: "draft",
      visibility: "private",
    });
    expect(migrated.compatibility).toMatchObject({
      legacyProfileId: "legacy-profile-toca",
      legacyAliases: ["Toca", "Morcego"],
      legacyReference: "legacy-product-reference",
    });
  });

  it("migrates V1 catalog coordinates while still requiring explicit canonical IDs", () => {
    const migrated = migrateLegacyCatalogItemToPlace({
      placeId: "segunda-praia",
      businessId: "business-catalog-owner",
      destinationId: "morro-de-sao-paulo",
      categoryId: "beaches",
      now: "2026-09-24T20:00:00.000Z",
      item: {
        id: "legacy-segunda-praia",
        name: "Segunda Praia",
        category: "Praias",
        latitude: -13.381,
        longitude: -38.914,
        aliases: ["2a Praia"],
      },
    });

    expect(migrated.place.location).toMatchObject({
      latitude: -13.381,
      longitude: -38.914,
      source: "catalog",
    });
    expect(migrated.place.businessId).toBe("business-catalog-owner");
  });

  it("normalizes known legacy category labels without turning them into authority", () => {
    expect(normalizeLegacyCategory("restaurant")).toBe("restaurants");
    expect(normalizeLegacyCategory("Praias")).toBe("beaches");
    expect(normalizeLegacyCategory("unknown")).toBeNull();
  });
});
