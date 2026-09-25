import { describe, expect, it, vi } from "vitest";

import {
  auditAssistantPhotoMigrationCoverage,
  type AssistantPhotoMigrationDetail,
  type AssistantPhotoMigrationMapItem,
} from "./assistant-photo-migration-audit.js";

function mapPlace(id: string, name: string): AssistantPhotoMigrationMapItem {
  return { id, name };
}

function detail(
  id: string,
  name: string,
  mediaReference: string | null,
): AssistantPhotoMigrationDetail {
  return {
    profile: {
      id,
      name,
    },
    media: {
      placeId: id,
      coverImage: mediaReference
        ? {
            providerReference: mediaReference,
          }
        : null,
      gallery: [],
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
      legacyPlaceNames: [
        "Segunda Praia",
        "Toca do Morcego",
        "Primeira Praia",
      ],
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
      legacyPlaceNames: ["Segunda Praia"],
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

  it("fails media coverage closed when the detail media belongs to another place", async () => {
    const matrix = await auditAssistantPhotoMigrationCoverage({
      canonicalPlaces: [mapPlace("place-segunda", "Segunda Praia")],
      legacyPlaceNames: ["Segunda Praia"],
      getDetail: async () => ({
        profile: {
          id: "place-segunda",
          name: "Segunda Praia",
        },
        media: {
          placeId: "place-outra",
          coverImage: {
            providerReference: "/media/business-a/wrong.webp",
          },
          gallery: [],
        },
      }),
      legacyEntries: [
        {
          place: "Segunda Praia",
          images: ["/images/fotos/segunda_praia1.jpg"],
        },
      ],
    });

    expect(matrix.rows[0]).toMatchObject({
      status: "canonical_no_media",
      canonicalImageCount: 0,
    });
  });
});
