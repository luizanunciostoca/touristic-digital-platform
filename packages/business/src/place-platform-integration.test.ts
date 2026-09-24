import type { DestinationId } from "@touristic/core";
import { describe, expect, it } from "vitest";

import {
  asBusinessId,
  asCategoryId,
  asOfferId,
  asPlaceId,
  asProductId,
  authorizePlaceAccess,
  createCatalogService,
  createPublicPlaceReadModel,
  publishedRecordFromGovernedRecord,
  resolvePlacePresentationActions,
  type CatalogRepository,
  type Offer,
  type Place,
  type Product,
  type PublicPlacePresentationActions,
} from "./index.js";
import {
  publicPlaceProjection,
  validatePlaceForPublication,
  type GovernedPlaceRecord,
} from "./place-publication-governance.js";

const NOW = "2026-09-24T23:45:00.000Z";
const destinationId = "morro-de-sao-paulo" as DestinationId;
const businessId = asBusinessId("business-toca");
const placeId = asPlaceId("place-toca");
const categoryId = asCategoryId("nightlife");

function place(): Place {
  return Object.freeze({
    id: placeId,
    businessId,
    destinationId,
    name: "Toca do Morcego",
    slug: "toca-do-morcego",
    categoryId,
    subcategoryIds: Object.freeze([]),
    shortDescription: "Sunset e experiências noturnas",
    description: "Experiência publicada em Morro de São Paulo.",
    location: Object.freeze({
      latitude: -13.376,
      longitude: -38.917,
      address: "Morro de São Paulo",
      area: "Primeira Praia",
      source: "mapbox" as const,
      externalProvider: "mapbox",
      externalPlaceId: "mapbox-place-toca",
      verifiedAt: NOW,
      verifiedBy: "operator-1",
    }),
    contact: Object.freeze({
      phone: null,
      whatsapp: "+557599999999",
      email: null,
      website: "https://example.test/toca",
    }),
    openingHours: null,
    amenities: Object.freeze([]),
    tags: Object.freeze(["sunset"]),
    capabilities: Object.freeze({
      enabled: Object.freeze(["tickets", "directions", "photos"]),
    }),
    visibility: "public" as const,
    publicationState: "published" as const,
    createdAt: NOW,
    updatedAt: NOW,
  });
}

function catalogRepository(): CatalogRepository {
  const products = new Map<Product["id"], Product>();
  const offers = new Map<Offer["id"], Offer>();
  const menus = new Map();
  const categories = new Map();
  const items = new Map();

  return {
    getProduct: async (id) => products.get(id) ?? null,
    saveProduct: async (value) => (products.set(value.id, value), value),
    getOffer: async (id) => offers.get(id) ?? null,
    saveOffer: async (value) => (offers.set(value.id, value), value),
    getMenu: async (id) => menus.get(id) ?? null,
    saveMenu: async (value) => (menus.set(value.id, value), value),
    getMenuCategory: async (id) => categories.get(id) ?? null,
    saveMenuCategory: async (value) => (categories.set(value.id, value), value),
    getMenuItem: async (id) => items.get(id) ?? null,
    saveMenuItem: async (value) => (items.set(value.id, value), value),
  };
}

describe("Business / Place cross-wave integration", () => {
  it("keeps canonical ownership through catalog, actions and public projection", async () => {
    const canonicalPlace = place();

    expect(() =>
      authorizePlaceAccess(
        canonicalPlace,
        {
          businessIds: ["business-other"],
          destinationIds: [String(destinationId)],
          capabilities: ["business.update"],
        },
        { mutation: true },
      ),
    ).toThrow("PLACE_ACCESS_BUSINESS_DENIED");

    const product: Product = Object.freeze({
      id: asProductId("product-sunset"),
      businessId,
      placeId,
      destinationId,
      name: "Sunset",
      description: "Experiência permanente",
      status: "active",
      tags: Object.freeze(["sunset"]),
      legacyReference: null,
      createdAt: NOW,
      updatedAt: NOW,
    });

    const offer: Offer = Object.freeze({
      id: asOfferId("offer-sunset"),
      businessId,
      placeId,
      destinationId,
      productId: product.id,
      price: Object.freeze({ minorUnits: 5000, currency: "BRL" }),
      salesStartsAt: "2026-09-01T00:00:00.000Z",
      salesEndsAt: "2026-10-01T00:00:00.000Z",
      experienceStartsAt: "2026-09-25T19:30:00.000Z",
      experienceEndsAt: null,
      capacity: 300,
      status: "active",
      legacyLabel: null,
      createdAt: NOW,
      updatedAt: NOW,
    });

    const catalog = createCatalogService(catalogRepository());
    await catalog.createProduct({ businessId }, product);
    await catalog.createOffer({ businessId }, offer);

    const actions = resolvePlacePresentationActions({
      place: canonicalPlace,
      category: Object.freeze({
        id: categoryId,
        key: "nightlife" as const,
        active: true,
      }),
      locale: "pt",
      now: NOW,
      products: [product],
      offers: [offer],
      inventory: [
        {
          offerId: String(offer.id),
          availableQuantity: 25,
          providerAvailable: true,
        },
      ],
      media: { galleryAvailable: true },
    });

    expect(actions.primaryAction?.id).toBe("tickets");
    expect(actions.primaryAction?.availability).toBe("available");

    const governed: GovernedPlaceRecord = Object.freeze({
      placeId: String(placeId),
      businessId: String(businessId),
      destinationId: String(destinationId),
      publicationState: "published",
      publishedRevision: Object.freeze({
        id: "place-toca:r3",
        revision: 3,
        expectedPreviousRevision: 2,
        data: Object.freeze({
          placeId: String(placeId),
          businessId: String(businessId),
          destinationId: String(destinationId),
          name: canonicalPlace.name,
          categoryId: String(categoryId),
          description: canonicalPlace.description,
          location: Object.freeze({
            latitude: canonicalPlace.location.latitude,
            longitude: canonicalPlace.location.longitude,
          }),
          capabilities: Object.freeze({
            enabled: Object.freeze([...canonicalPlace.capabilities.enabled]),
          }),
          visibility: "public",
          coverMediaId: "media-cover",
          mediaIds: Object.freeze(["media-cover"]),
          openingHoursPresent: true,
          contactPresent: true,
          menuPresent: false,
        }),
        createdAt: NOW,
        createdBy: "platform-owner",
      }),
      editableRevision: Object.freeze({
        id: "place-toca:r4",
        revision: 4,
        expectedPreviousRevision: 3,
        data: Object.freeze({
          placeId: String(placeId),
          businessId: String(businessId),
          destinationId: String(destinationId),
          name: "Draft name must not leak",
          categoryId: String(categoryId),
          description: "Draft description must not leak",
          location: Object.freeze({
            latitude: canonicalPlace.location.latitude,
            longitude: canonicalPlace.location.longitude,
          }),
          capabilities: Object.freeze({
            enabled: Object.freeze([...canonicalPlace.capabilities.enabled]),
          }),
          visibility: "public",
        }),
        createdAt: NOW,
        createdBy: "manager-1",
      }),
      updatedAt: NOW,
    });

    expect(
      validatePlaceForPublication(governed.publishedRevision!.data).filter(
        (issue) => issue.severity === "required",
      ),
    ).toEqual([]);
    expect(publicPlaceProjection(governed)?.name).toBe("Toca do Morcego");

    const published = publishedRecordFromGovernedRecord(
      governed,
      canonicalPlace,
    );
    expect(published?.publishedRevision).toBe(3);

    const actionProjection: PublicPlacePresentationActions = Object.freeze({
      placeId,
      businessId: String(businessId),
      destinationId: String(destinationId),
      primaryAction: actions.primaryAction,
      secondaryActions: actions.secondaryActions,
    });

    const readModel = createPublicPlaceReadModel({
      repository: {
        async listPublished() {
          return Object.freeze({
            items: published ? Object.freeze([published]) : Object.freeze([]),
            nextCursor: null,
          });
        },
        async getPublished(requestedPlaceId) {
          return requestedPlaceId === placeId ? published : null;
        },
      },
      media: {
        async getPublishedMedia() {
          return Object.freeze({
            placeId: String(placeId),
            coverImage: Object.freeze({
              mediaId: "media-cover",
              provider: "canonical",
              providerReference: "https://cdn.example.test/toca.jpg",
              mimeType: "image/jpeg",
              width: 1200,
              height: 800,
              alt: "Sunset na Toca do Morcego",
            }),
            gallery: Object.freeze([]),
            logo: null,
          });
        },
      },
      commerce: {
        async getPublicCommerce() {
          return Object.freeze({
            offers: Object.freeze([
              {
                id: String(offer.id),
                productId: String(product.id),
                name: product.name,
                description: product.description,
                price: offer.price,
                salesEndsAt: offer.salesEndsAt,
              },
            ]),
            menu: null,
          });
        },
      },
      actions: {
        async resolvePublicActions() {
          return actionProjection;
        },
      },
    });

    const map = await readModel.listMap({
      destinationId: String(destinationId),
      bbox: "-38.93,-13.39,-38.90,-13.36",
      category: String(categoryId),
      zoom: 15,
    });
    expect(map.page.items).toHaveLength(1);
    expect(map.page.items[0]?.id).toBe(placeId);

    const detail = await readModel.getDetail(placeId, "pt-BR");
    expect(detail.detail?.profile.name).toBe("Toca do Morcego");
    expect(detail.detail?.profile.name).not.toBe("Draft name must not leak");
    expect(detail.detail?.revision).toEqual({
      id: "place-toca:r3",
      number: 3,
    });
    expect(detail.detail?.actions.primaryAction?.id).toBe("tickets");

    const suspended = Object.freeze({
      ...governed,
      publicationState: "suspended" as const,
    });
    expect(publicPlaceProjection(suspended)).toBeNull();
    expect(
      publishedRecordFromGovernedRecord(suspended, canonicalPlace),
    ).toBeNull();
  });
});
