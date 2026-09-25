import { describe, expect, it, vi } from "vitest";

import type { PublicPlaceDetail, PublicPlaceMapItem } from "@touristic/business";

import { auditAssistantPhotoMigrationCoverage } from "./assistant-photo-migration-audit.js";

function mapPlace(
  id: string,
  name: string,
): PublicPlaceMapItem {
  return {
    id: id as PublicPlaceMapItem["id"],
    name,
    category: "beaches",
    lat: -13.38,
    lng: -38.91,
    presentation: {
      markerKey: "beaches",
      priority: 1,
    },
  };
}

function detail(
  id: string,
  name: string,
  mediaReference: string | null,
): PublicPlaceDetail {
  return {
    profile: {
      id: id as PublicPlaceDetail["profile"]["id"],
      businessId: "business-a",
      destinationId: "morro-de-sao-paulo",
      categoryId: "beaches" as PublicPlaceDetail["profile"]["categoryId"],
      name,
      shortDescription: "",
      description: "",
      tags: [],
      location: {
        latitude: -13.38,
        longitude: -38.91,
        address: "",
        area: "",
      },
      contact: null,
      hours: null,
      capabilities: [],
    },
    media: {
      placeId: id,
      coverImage: mediaReference
        ? {
            mediaId: "media-a",
            provider: "filesystem",
            providerReference: mediaReference,
            mimeType: "image/webp",
            width: 1200,
            height: 800,
            alt: name,
          }
        : null,
      gallery: [],
      logo: null,
    },
    commerce: null,
    actions: {
      placeId: id as PublicPlaceDetail["actions"]["placeId"],
      businessId: "business-a",
      destinationId: "morro-de-sao-paulo",
      primaryAction: null,
      secondaryActions: [],
    },
    partial: {
      media: "ready",
      commerce: "ready",
      actions: "ready",
    },
    revision: {
      id: "revision-1",
      number: 1,
    },
  };
}

describe("assistant photo migration audit", () => {
  it("classifies canonical media, canonical no-media, legacy-only and non-place entries", async () => {
    const canonicalPlaces = [
      mapPlace("place-segunda", "Segunda Praia"),
      mapPlace("place-toca", "Toca do Morcego"),
    ];
    const getDetail = vi.fn(async (placeId: string) => {
      if (placeId === "place-segunda") {
        return detail(
          "place-segunda",
          "Segunda Praia",
          "/media/business-a/segunda.webp",
        );
      }
      if (placeId === "place-toca") {
        return detail("place-toca", "Toca do Morcego", null);
      }
      return null;
    });

    const matrix = await auditAssistantPhotoMigrationCoverage({
      canonicalPlaces,
      getDetail,
      legacyEntries: [
        {
          place: "Segunda Praia",
          images: ["/images/fotos/segunda_praia1.jpg"],
        },
        {
          place: "Toca do Morcego",
          images: ["/images/fotos/toca_do_morcego1.jpg"],
        },
        {
          place: "Primeira Praia",
          images: ["/images/fotos/primeira_praia1.jpg"],
        },
        {
          place: "Configurações",
          images: ["/images/fotos/configuracoes1.jpg"],
        },
      ],
    });

    expect(matrix.rows.map((row) => [row.legacyPlace, row.status])).toEqual([
      ["Segunda Praia", "canonical_media"],
      ["Toca do Morcego", "canonical_no_media"],
      ["Primeira Praia", "legacy_only"],
      ["Configurações", "not_canonical"],
    ]);
    expect(matrix.totals).toEqual({
      canonical_media: 1,
      canonical_no_media: 1,
      legacy_only: 1,
      not_canonical: 1,
    });
    expect(getDetail).toHaveBeenCalledTimes(2);
  });

  it("ignores opaque provider references when deciding canonical media coverage", async () => {
    const matrix = await auditAssistantPhotoMigrationCoverage({
      canonicalPlaces: [mapPlace("place-segunda", "Segunda Praia")],
      getDetail: async () =>
        detail(
          "place-segunda",
          "Segunda Praia",
          "places/place-segunda/private.webp",
        ),
      legacyEntries: [
        {
          place: "Segunda Praia",
          images: ["/images/fotos/segunda_praia1.jpg"],
        },
      ],
    });

    expect(matrix.rows[0]).toMatchObject({
      status: "canonical_no_media",
      canonicalPlaceId: "place-segunda",
      canonicalImageCount: 0,
    });
  });
});
