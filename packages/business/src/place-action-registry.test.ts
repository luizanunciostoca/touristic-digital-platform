import { describe, expect, it } from "vitest";

import {
  asBusinessId,
  asCategoryId,
  asOfferId,
  asPlaceId,
  asProductId,
  type CanonicalPlaceCategory,
  type Menu,
  type Offer,
  type Place,
  type PlaceCapability,
  type Product,
} from "./index.js";
import { resolvePlacePresentationActions } from "./place-action-registry.js";

const NOW = "2026-09-24T20:00:00.000Z";
const businessId = asBusinessId("business-a");
const placeId = asPlaceId("place-a");
const destinationId = "morro-de-sao-paulo" as Place["destinationId"];
const categoryId = asCategoryId("category-a");

function place(
  capabilities: readonly PlaceCapability[],
  overrides: Partial<Place> = {},
): Place {
  return {
    id: placeId,
    businessId,
    destinationId,
    name: "Place A",
    slug: "place-a",
    categoryId,
    subcategoryIds: [],
    shortDescription: "",
    description: "Canonical public description",
    location: {
      latitude: -13.376,
      longitude: -38.917,
      address: "Morro de São Paulo",
      area: "Centro",
      source: "manual",
      externalProvider: null,
      externalPlaceId: null,
      verifiedAt: NOW,
      verifiedBy: "operator",
    },
    contact: {
      phone: "+557500000000",
      whatsapp: "+557599999999",
      email: null,
      website: "https://example.test",
    },
    openingHours: null,
    amenities: [],
    tags: [],
    capabilities: { enabled: capabilities },
    visibility: "public",
    publicationState: "published",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function category(key: CanonicalPlaceCategory): Readonly<{
  id: typeof categoryId;
  key: CanonicalPlaceCategory;
  active: boolean;
}> {
  return {
    id: categoryId,
    key,
    active: true,
  };
}

const product: Product = {
  id: asProductId("product-a"),
  businessId,
  placeId,
  destinationId,
  name: "The Party",
  description: "",
  status: "active",
  tags: [],
  legacyReference: null,
  createdAt: NOW,
  updatedAt: NOW,
};

function offer(overrides: Partial<Offer> = {}): Offer {
  return {
    id: asOfferId("offer-a"),
    businessId,
    placeId,
    destinationId,
    productId: product.id,
    price: { minorUnits: 8000, currency: "BRL" },
    salesStartsAt: "2026-09-01T00:00:00.000Z",
    salesEndsAt: "2026-10-01T00:00:00.000Z",
    experienceStartsAt: "2026-09-26T02:00:00.000Z",
    experienceEndsAt: null,
    capacity: null,
    status: "active",
    legacyLabel: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

const menu: Menu = {
  id: "menu-a" as Menu["id"],
  businessId,
  placeId,
  name: "Menu",
  description: "",
  status: "active",
  fallbackMediaId: null,
  fallbackDocumentUrl: null,
  createdAt: NOW,
  updatedAt: NOW,
};

describe("Place Action Registry", () => {
  it("requires capability and real data instead of category-only actions", () => {
    const resolved = resolvePlacePresentationActions({
      place: place(["menu", "directions", "whatsapp", "photos"]),
      category: category("restaurants"),
      locale: "pt",
      now: NOW,
      menus: [menu],
      media: { galleryAvailable: true },
    });

    expect(resolved.primaryAction).toBeNull();
    expect(resolved.secondaryActions.map(({ id }) => id)).toEqual([
      "menu",
      "directions",
      "photos",
      "whatsapp",
      "save",
      "share",
      "info",
    ]);
    expect(
      resolved.secondaryActions.some(({ id }) => id === "tableReservation"),
    ).toBe(false);
  });

  it("does not expose a menu action when the canonical menu is absent", () => {
    const resolved = resolvePlacePresentationActions({
      place: place(["menu"]),
      category: category("restaurants"),
      locale: "pt",
      now: NOW,
    });
    expect(resolved.secondaryActions.some(({ id }) => id === "menu")).toBe(
      false,
    );
  });

  it("does not expose photos when the gallery projection is absent", () => {
    const resolved = resolvePlacePresentationActions({
      place: place(["photos"]),
      category: category("attractions"),
      locale: "pt",
      now: NOW,
      media: { galleryAvailable: false },
    });
    expect(resolved.secondaryActions.some(({ id }) => id === "photos")).toBe(
      false,
    );
  });

  it("does not expose directions for invalid coordinates", () => {
    const resolved = resolvePlacePresentationActions({
      place: place(["directions"], {
        location: {
          ...place([]).location,
          latitude: null,
          longitude: null,
        },
      }),
      category: category("beaches"),
      locale: "pt",
      now: NOW,
    });
    expect(
      resolved.secondaryActions.some(({ id }) => id === "directions"),
    ).toBe(false);
  });

  it("does not expose booking when the provider is unavailable", () => {
    const resolved = resolvePlacePresentationActions({
      place: place(["booking"]),
      category: category("hotels"),
      locale: "pt",
      now: NOW,
      providers: { bookingAvailable: false },
    });
    expect(resolved.primaryAction).toBeNull();
  });

  it("exposes hotel booking only with configured capability and available provider", () => {
    const resolved = resolvePlacePresentationActions({
      place: place(["booking"]),
      category: category("hotels"),
      locale: "en",
      now: NOW,
      providers: { bookingAvailable: true },
    });
    expect(resolved.primaryAction).toMatchObject({
      id: "booking",
      label: "Book",
      disabled: false,
    });
  });

  it("uses explicit Product/Offer place relations for a live nightlife ticket CTA", () => {
    const resolved = resolvePlacePresentationActions({
      place: place(["tickets"]),
      category: category("nightlife"),
      locale: "pt",
      now: NOW,
      products: [product],
      offers: [offer()],
      inventory: [
        { offerId: "offer-a", availableQuantity: 10, providerAvailable: true },
      ],
    });
    expect(resolved.primaryAction).toMatchObject({
      id: "tickets",
      label: "Comprar ingressos",
      value: "commerce:offer:offer-a",
      availability: "available",
      disabled: false,
    });
  });

  it("never exposes a fake purchase CTA when no canonical offer exists", () => {
    const resolved = resolvePlacePresentationActions({
      place: place(["tickets"]),
      category: category("nightlife"),
      locale: "pt",
      now: NOW,
      products: [product],
      offers: [],
    });
    expect(resolved.primaryAction).toBeNull();
  });

  it("keeps sold-out ticket state visible but disabled", () => {
    const resolved = resolvePlacePresentationActions({
      place: place(["tickets"]),
      category: category("nightlife"),
      locale: "pt",
      now: NOW,
      products: [product],
      offers: [offer()],
      inventory: [
        { offerId: "offer-a", availableQuantity: 0, providerAvailable: true },
      ],
    });
    expect(resolved.primaryAction).toMatchObject({
      id: "tickets",
      label: "Ingressos esgotados",
      availability: "sold_out",
      disabled: true,
    });
  });

  it("keeps upcoming ticket state visible but disabled", () => {
    const resolved = resolvePlacePresentationActions({
      place: place(["tickets"]),
      category: category("nightlife"),
      locale: "en",
      now: NOW,
      products: [product],
      offers: [offer({ salesStartsAt: "2026-09-30T00:00:00.000Z" })],
      inventory: [
        { offerId: "offer-a", availableQuantity: 10, providerAvailable: true },
      ],
    });
    expect(resolved.primaryAction).toMatchObject({
      label: "Sales opening soon",
      availability: "upcoming",
      disabled: true,
    });
  });

  it("fails closed when an inventory provider is unavailable", () => {
    const resolved = resolvePlacePresentationActions({
      place: place(["tickets"]),
      category: category("nightlife"),
      locale: "pt",
      now: NOW,
      products: [product],
      offers: [offer()],
      inventory: [
        { offerId: "offer-a", availableQuantity: 10, providerAvailable: false },
      ],
    });
    expect(resolved.primaryAction).toBeNull();
  });

  it("uses locale-specific presentation without changing action identity", () => {
    const pt = resolvePlacePresentationActions({
      place: place(["directions"]),
      category: category("attractions"),
      locale: "pt",
      now: NOW,
    });
    const es = resolvePlacePresentationActions({
      place: place(["directions"]),
      category: category("attractions"),
      locale: "es",
      now: NOW,
    });
    expect(
      pt.secondaryActions.find(({ id }) => id === "directions")?.label,
    ).toBe("Como chegar");
    expect(
      es.secondaryActions.find(({ id }) => id === "directions")?.label,
    ).toBe("Cómo llegar");
  });

  it("rejects cross-destination commerce relations even when place ids match", () => {
    const otherDestination = "boipeba" as Place["destinationId"];
    const crossDestinationProduct: Product = {
      ...product,
      destinationId: otherDestination,
    };
    const crossDestinationOffer: Offer = {
      ...offer(),
      destinationId: otherDestination,
    };

    const resolved = resolvePlacePresentationActions({
      place: place(["tickets"]),
      category: category("nightlife"),
      locale: "pt",
      now: NOW,
      products: [crossDestinationProduct],
      offers: [crossDestinationOffer],
      inventory: [
        { offerId: "offer-a", availableQuantity: 10, providerAvailable: true },
      ],
    });

    expect(resolved.primaryAction).toBeNull();
  });

  it("deduplicates action ids and produces deterministic ordering", () => {
    const first = resolvePlacePresentationActions({
      place: place(["directions", "photos", "whatsapp", "website"]),
      category: category("attractions"),
      locale: "pt",
      now: NOW,
      media: { galleryAvailable: true },
    });
    const second = resolvePlacePresentationActions({
      place: place(["website", "whatsapp", "photos", "directions"]),
      category: category("attractions"),
      locale: "pt",
      now: NOW,
      media: { galleryAvailable: true },
    });

    const firstIds = first.secondaryActions.map(({ id }) => id);
    const secondIds = second.secondaryActions.map(({ id }) => id);
    expect(firstIds).toEqual(secondIds);
    expect(new Set(firstIds).size).toBe(firstIds.length);
  });

  it.each([
    ["restaurants", ["menu", "directions", "whatsapp"] as const],
    ["nightlife", ["tickets", "directions", "photos"] as const],
    ["hotels", ["booking", "directions", "photos", "whatsapp"] as const],
    ["tours", ["tourBooking", "directions", "photos"] as const],
    ["transport", ["transportBooking", "directions", "whatsapp"] as const],
    ["shops", ["products", "directions"] as const],
    ["attractions", ["directions", "photos"] as const],
    ["beaches", ["directions", "photos"] as const],
    ["emergencies", ["directions", "call"] as const],
  ])(
    "resolves category × capability matrix for %s without category-only leakage",
    (key, capabilities) => {
      const p = place(capabilities);
      const resolved = resolvePlacePresentationActions({
        place: p,
        category: category(key),
        locale: "pt",
        now: NOW,
        products: key === "nightlife" || key === "shops" ? [product] : [],
        offers: key === "nightlife" ? [offer()] : [],
        inventory:
          key === "nightlife"
            ? [
                {
                  offerId: "offer-a",
                  availableQuantity: 1,
                  providerAvailable: true,
                },
              ]
            : [],
        menus: key === "restaurants" ? [menu] : [],
        media: { galleryAvailable: true },
        providers: {
          bookingAvailable: key === "hotels",
          tourBookingAvailable: key === "tours",
          transportBookingAvailable: key === "transport",
        },
      });
      const ids = [
        ...(resolved.primaryAction ? [resolved.primaryAction.id] : []),
        ...resolved.secondaryActions.map(({ id }) => id),
      ];
      for (const required of capabilities) expect(ids).toContain(required);
    },
  );
});
