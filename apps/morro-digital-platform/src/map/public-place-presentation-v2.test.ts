import { describe, expect, it } from "vitest";
import type { PublicPlaceDetail } from "@touristic/business";
import { asCategoryId, asPlaceId } from "@touristic/business";

import { toCanonicalPlaceBottomSheetPresentation } from "./public-place-presentation-v2.js";

function detail(): PublicPlaceDetail {
  return Object.freeze({
    profile: Object.freeze({
      id: asPlaceId("place-toca"),
      destinationId: "morro-de-sao-paulo",
      name: "Toca do Morcego",
      slug: "toca-do-morcego",
      categoryId: asCategoryId("nightlife"),
      subcategoryIds: Object.freeze([]),
      shortDescription: "Sunset",
      description: "Experiência publicada",
      location: Object.freeze({
        latitude: -13.377,
        longitude: -38.915,
        address: "Morro de São Paulo",
        area: "Primeira Praia",
      }),
      contact: Object.freeze({
        phone: null,
        whatsapp: null,
        email: null,
        website: null,
      }),
      openingHours: null,
      amenities: Object.freeze([]),
      tags: Object.freeze(["sunset"]),
      capabilities: Object.freeze(["directions"] as const),
    }),
    media: Object.freeze({
      placeId: "place-toca",
      coverImage: Object.freeze({
        mediaId: "media-cover",
        provider: "canonical",
        providerReference: "https://cdn.example.com/toca.jpg",
        mimeType: "image/jpeg",
        width: 1200,
        height: 800,
        alt: "Sunset na Toca do Morcego",
      }),
      gallery: Object.freeze([]),
      logo: null,
    }),
    commerce: null,
    actions: Object.freeze({
      placeId: asPlaceId("place-toca"),
      businessId: "business-toca",
      destinationId: "morro-de-sao-paulo",
      primaryAction: Object.freeze({
        id: "nightlife.tickets",
        label: "Comprar ingressos",
        value: "commerce:offer:offer-1",
        presentation: "primary",
        priority: 10,
        disabled: false,
        availability: "available",
      }),
      secondaryActions: Object.freeze([
        Object.freeze({
          id: "place.directions",
          label: "Como chegar",
          value: "place-action:directions:place-toca",
          presentation: "secondary",
          priority: 20,
          disabled: false,
          availability: "available",
        }),
      ]),
    }),
    partial: Object.freeze({
      media: "ready",
      commerce: "ready",
      actions: "ready",
    }),
    revision: Object.freeze({ id: "place-toca:r3", number: 3 }),
  });
}

describe("toCanonicalPlaceBottomSheetPresentation", () => {
  it("renders canonical media and action projection without name-based CTA inference", () => {
    const result = toCanonicalPlaceBottomSheetPresentation(detail(), "pt");

    expect(result.location.name).toBe("Toca do Morcego");
    expect(result.heroImage).toEqual({
      src: "https://cdn.example.com/toca.jpg",
      alt: "Sunset na Toca do Morcego",
    });
    expect(result.primaryAction?.actionId).toBe("nightlife.tickets");
    expect(result.actions).toEqual([
      {
        actionId: "place.directions",
        label: "Como chegar",
        value: "place-action:directions:place-toca",
        action: "command",
        disabled: false,
      },
    ]);
  });

  it("fails closed for non-public media references instead of inventing a provider URL", () => {
    const source = detail();
    const unsafe = Object.freeze({
      ...source,
      media: Object.freeze({
        ...source.media!,
        coverImage: Object.freeze({
          ...source.media!.coverImage!,
          providerReference: "opaque-provider-id",
        }),
      }),
    });
    const result = toCanonicalPlaceBottomSheetPresentation(unsafe, "pt");
    expect(result.heroImage).toBeUndefined();
  });
});
