import { describe, expect, it, vi } from "vitest";

import { resolveAssistantCanonicalPhotos } from "./assistant-canonical-photo-adapter.js";

function mapResponse() {
  return new Response(
    JSON.stringify({
      items: [
        {
          id: "place-segunda-praia",
          name: "Segunda Praia",
          category: "beaches",
          lat: -13.3801,
          lng: -38.9118,
          presentation: { markerKey: "beaches", priority: 10 },
        },
      ],
      nextCursor: null,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function detailResponse(providerReference: string = "/media/business-a/segunda.webp") {
  return new Response(
    JSON.stringify({
      profile: {
        id: "place-segunda-praia",
        name: "Segunda Praia",
        categoryId: "beaches",
        location: {
          latitude: -13.3801,
          longitude: -38.9118,
          address: "",
          area: "",
        },
      },
      media: {
        placeId: "place-segunda-praia",
        coverImage: {
          mediaId: "media-cover",
          provider: "filesystem",
          providerReference,
          mimeType: "image/webp",
          width: 1200,
          height: 800,
          alt: "Segunda Praia",
        },
        gallery: [
          {
            mediaId: "media-cover",
            provider: "filesystem",
            providerReference,
            mimeType: "image/webp",
            width: 1200,
            height: 800,
            alt: "Segunda Praia",
          },
          {
            mediaId: "media-gallery",
            provider: "cdn",
            providerReference: "https://cdn.example.com/segunda-2.webp",
            mimeType: "image/webp",
            width: 1200,
            height: 800,
            alt: "Segunda Praia 2",
          },
        ],
        logo: null,
      },
      commerce: null,
      actions: {
        placeId: "place-segunda-praia",
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
      revision: { id: "revision-3", number: 3 },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

describe("assistant canonical photo adapter", () => {
  it("discovers a canonical Place then reads published media by placeId", async () => {
    const fetchImplementation = vi.fn<typeof globalThis.fetch>(
      async (input) => {
        const url = String(input);
        if (url.startsWith("/api/places/v1/map?")) return mapResponse();
        if (url.startsWith("/api/places/v1/place-segunda-praia?")) {
          return detailResponse();
        }
        return new Response(null, { status: 404 });
      },
    );

    await expect(
      resolveAssistantCanonicalPhotos(
        "segunda",
        fetchImplementation,
        "pt",
      ),
    ).resolves.toEqual({
      placeId: "place-segunda-praia",
      place: "Segunda Praia",
      images: [
        "/media/business-a/segunda.webp",
        "https://cdn.example.com/segunda-2.webp",
      ],
    });

    expect(
      fetchImplementation.mock.calls.some(([input]) =>
        String(input).startsWith(
          "/api/places/v1/place-segunda-praia?locale=pt-BR",
        ),
      ),
    ).toBe(true);
  });

  it("does not expose opaque provider references as public image URLs", async () => {
    const fetchImplementation = vi.fn<typeof globalThis.fetch>(
      async (input) =>
        String(input).startsWith("/api/places/v1/map?")
          ? mapResponse()
          : detailResponse("places/place-segunda-praia/private.webp"),
    );

    await expect(
      resolveAssistantCanonicalPhotos(
        "Segunda Praia",
        fetchImplementation,
        "pt",
      ),
    ).resolves.toBeNull();
  });
});
