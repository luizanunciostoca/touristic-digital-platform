import { describe, expect, it, vi } from "vitest";

import {
  asBusinessId,
  asCategoryId,
  asPlaceId,
} from "./place-domain.js";
import {
  createPublicPlaceReadModel,
  handlePublicPlaceApiRequest,
  parsePublicPlaceMapQuery,
  publishedRecordFromGovernedRecord,
  type PublicPlaceActionPort,
  type PublicPlaceGovernedRecord,
  type PublicPlacePublishedRecord,
} from "./public-place-projection.js";
import type { Place } from "./place-domain.js";

function place(overrides: Partial<Place> = {}): Place {
  return Object.freeze({
    id: asPlaceId("place-1"),
    businessId: asBusinessId("business-1"),
    destinationId: "morro-de-sao-paulo" as Place["destinationId"],
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
      source: "manual" as const,
      externalProvider: null,
      externalPlaceId: null,
      verifiedAt: null,
      verifiedBy: null,
    }),
    contact: Object.freeze({
      phone: "+557500000000",
      whatsapp: "+557500000000",
      email: "public@example.com",
      website: "https://example.com",
    }),
    openingHours: null,
    amenities: Object.freeze(["sunset"]),
    tags: Object.freeze(["nightlife"]),
    capabilities: Object.freeze({
      enabled: Object.freeze(["directions", "whatsapp"] as const),
    }),
    visibility: "public",
    publicationState: "published",
    createdAt: "2026-09-24T10:00:00.000Z",
    updatedAt: "2026-09-24T12:00:00.000Z",
    ...overrides,
  });
}

function governed(input: {
  state?: PublicPlaceGovernedRecord["publicationState"];
  published?: Place | null;
  revision?: number;
} = {}): PublicPlaceGovernedRecord {
  const published = input.published === undefined ? place() : input.published;
  return Object.freeze({
    placeId: "place-1",
    businessId: "business-1",
    destinationId: "morro-de-sao-paulo",
    publicationState: input.state ?? "published",
    publishedRevision:
      published === null
        ? null
        : Object.freeze({
            id: "place-1:r3",
            revision: input.revision ?? 3,
          }),
  });
}

describe("publishedRecordFromGovernedRecord", () => {
  it("hides never-published draft and review records", () => {
    expect(
      publishedRecordFromGovernedRecord(
        governed({ state: "draft", published: null }),
        null,
      ),
    ).toBeNull();
    expect(
      publishedRecordFromGovernedRecord(
        governed({ state: "review", published: null }),
        null,
      ),
    ).toBeNull();
  });

  it("keeps the prior published revision visible while a new revision is draft/review", () => {
    const previous = place({ description: "Versão pública anterior" });
    expect(
      publishedRecordFromGovernedRecord(
        governed({ state: "draft", published: previous, revision: 8 }),
        previous,
      )?.place.description,
    ).toBe("Versão pública anterior");
    expect(
      publishedRecordFromGovernedRecord(
        governed({ state: "review", published: previous, revision: 8 }),
        previous,
      )?.publishedRevision,
    ).toBe(8);
  });

  it("rejects a canonical snapshot from another Place scope", () => {
    expect(
      publishedRecordFromGovernedRecord(
        governed(),
        place({ id: asPlaceId("place-2") }),
      ),
    ).toBeNull();
    expect(
      publishedRecordFromGovernedRecord(
        governed(),
        place({ businessId: asBusinessId("business-2") }),
      ),
    ).toBeNull();
  });

  it("hides suspended and archived records even when a published revision exists", () => {
    expect(
      publishedRecordFromGovernedRecord(
        governed({ state: "suspended" }),
        place(),
      ),
    ).toBeNull();
    expect(
      publishedRecordFromGovernedRecord(
        governed({ state: "archived" }),
        place(),
      ),
    ).toBeNull();
  });
});

describe("parsePublicPlaceMapQuery", () => {
  it("accepts canonical destination/bbox/category/zoom and caps scale limit", () => {
    expect(
      parsePublicPlaceMapQuery({
        destinationId: "morro-de-sao-paulo",
        bbox: "-38.93,-13.40,-38.89,-13.35",
        category: "nightlife",
        zoom: "15",
        limit: "5000",
      }),
    ).toEqual({
      destinationId: "morro-de-sao-paulo",
      bbox: {
        west: -38.93,
        south: -13.4,
        east: -38.89,
        north: -13.35,
      },
      category: "nightlife",
      zoom: 15,
      limit: 1000,
    });
  });

  it.each([
    { destinationId: "", bbox: "-38,-13,-37,-12", zoom: 10 },
    { destinationId: "morro", bbox: "bad", zoom: 10 },
    { destinationId: "morro", bbox: "10,10,0,0", zoom: 10 },
    { destinationId: "morro", bbox: "-38,-13,-37,-12", zoom: 99 },
    {
      destinationId: "morro",
      bbox: "-38,-13,-37,-12",
      zoom: 10,
      limit: 0,
    },
  ])("rejects malformed public queries", (query) => {
    expect(() => parsePublicPlaceMapQuery(query)).toThrow();
  });
});

describe("createPublicPlaceReadModel", () => {
  function record(value: Place = place()): PublicPlacePublishedRecord {
    return Object.freeze({
      place: value,
      publishedRevisionId: "place-1:r3",
      publishedRevision: 3,
    });
  }

  it("returns a minimal map payload, enforces destination/category/bbox and exposes no admin fields", async () => {
    const repoItems = [
      record(),
      record(
        place({
          id: asPlaceId("wrong-destination"),
          destinationId: "itacare" as Place["destinationId"],
        }),
      ),
      record(
        place({
          id: asPlaceId("outside-bbox"),
          location: Object.freeze({
            ...place().location,
            latitude: -14,
            longitude: -39,
          }),
        }),
      ),
    ];
    const service = createPublicPlaceReadModel({
      repository: {
        listPublished: vi.fn(async () => ({
          items: repoItems,
          nextCursor: null,
        })),
        getPublished: vi.fn(async () => record()),
      },
      media: { getPublishedMedia: vi.fn(async () => null) },
      commerce: { getPublicCommerce: vi.fn(async () => null) },
      actions: {
        resolvePublicActions: vi.fn(async ({ place }: Parameters<PublicPlaceActionPort["resolvePublicActions"]>[0]) =>
          Object.freeze({
            placeId: place.id,
            businessId: "business-1",
            destinationId: place.destinationId,
            primaryAction: null,
            secondaryActions: Object.freeze([]),
          }),
        ),
      },
    });

    const result = await service.listMap({
      destinationId: "morro-de-sao-paulo",
      bbox: "-38.93,-13.40,-38.89,-13.35",
      category: "nightlife",
      zoom: 15,
    });

    expect(result.page.items).toHaveLength(1);
    expect(result.page.items[0]).toEqual({
      id: asPlaceId("place-1"),
      name: "Toca do Morcego",
      category: asCategoryId("nightlife"),
      lat: -13.377,
      lng: -38.915,
      presentation: { markerKey: "nightlife", priority: 0 },
    });
    expect(result.page.items[0]).not.toHaveProperty("businessId");
    expect(result.page.items[0]).not.toHaveProperty("contact");
    expect(result.cache.etag).toMatch(/^W\/"places-map-/u);
  });

  it("composes one public detail payload and delegates actions without duplicating action rules", async () => {
    const media = Object.freeze({
      placeId: "place-1",
      coverImage: null,
      gallery: Object.freeze([]),
      logo: null,
    });
    const commerce = Object.freeze({
      offers: Object.freeze([]),
      menu: null,
    });
    const actionResolver = vi.fn(async ({ place }: Parameters<PublicPlaceActionPort["resolvePublicActions"]>[0]) =>
      Object.freeze({
        placeId: place.id,
        businessId: "business-1",
        destinationId: place.destinationId,
        primaryAction: Object.freeze({
          id: "directions",
          label: "Como chegar",
          value: "place-action:directions:place-1",
          presentation: "primary" as const,
          priority: 30,
          disabled: false,
          availability: "available" as const,
        }),
        secondaryActions: Object.freeze([]),
      }),
    );
    const service = createPublicPlaceReadModel({
      repository: {
        listPublished: vi.fn(async () => ({ items: [], nextCursor: null })),
        getPublished: vi.fn(async () => record()),
      },
      media: { getPublishedMedia: vi.fn(async () => media) },
      commerce: { getPublicCommerce: vi.fn(async () => commerce) },
      actions: { resolvePublicActions: actionResolver },
    });

    const result = await service.getDetail(asPlaceId("place-1"), "pt-BR");

    expect(result.detail?.profile.id).toBe(asPlaceId("place-1"));
    expect(result.detail?.media).toBe(media);
    expect(result.detail?.commerce).toBe(commerce);
    expect(result.detail?.actions.primaryAction?.id).toBe("directions");
    expect(actionResolver).toHaveBeenCalledTimes(1);
    expect(result.detail).not.toHaveProperty("businessId");
    expect(result.detail).not.toHaveProperty("publicationState");
    expect(result.detail).not.toHaveProperty("audit");
    expect(result.cache?.cacheControl).toContain("stale-while-revalidate");
  });

  it("degrades failed sections locally without mixing data from another Place", async () => {
    const service = createPublicPlaceReadModel({
      repository: {
        listPublished: vi.fn(async () => ({ items: [], nextCursor: null })),
        getPublished: vi.fn(async () => record()),
      },
      media: {
        getPublishedMedia: vi.fn(async () => {
          throw new Error("MEDIA_UNAVAILABLE");
        }),
      },
      commerce: { getPublicCommerce: vi.fn(async () => null) },
      actions: {
        resolvePublicActions: vi.fn(async ({ place }: Parameters<PublicPlaceActionPort["resolvePublicActions"]>[0]) =>
          Object.freeze({
            placeId: place.id,
            businessId: "business-1",
            destinationId: place.destinationId,
            primaryAction: null,
            secondaryActions: Object.freeze([]),
          }),
        ),
      },
    });

    const result = await service.getDetail(asPlaceId("place-1"));

    expect(result.detail?.profile.id).toBe(asPlaceId("place-1"));
    expect(result.detail?.media).toBeNull();
    expect(result.detail?.commerce).toBeNull();
    expect(result.detail?.partial).toEqual({
      media: "unavailable",
      commerce: "ready",
      actions: "ready",
    });
  });

  it("returns null for private/unlisted data even if an adapter accidentally supplies it", async () => {
    const service = createPublicPlaceReadModel({
      repository: {
        listPublished: vi.fn(async () => ({
          items: [record(place({ visibility: "private" }))],
          nextCursor: null,
        })),
        getPublished: vi.fn(async () =>
          record(place({ visibility: "unlisted" })),
        ),
      },
      media: { getPublishedMedia: vi.fn(async () => null) },
      commerce: { getPublicCommerce: vi.fn(async () => null) },
      actions: {
        resolvePublicActions: vi.fn(async ({ place }: Parameters<PublicPlaceActionPort["resolvePublicActions"]>[0]) =>
          Object.freeze({
            placeId: place.id,
            businessId: "business-1",
            destinationId: place.destinationId,
            primaryAction: null,
            secondaryActions: Object.freeze([]),
          }),
        ),
      },
    });

    const map = await service.listMap({
      destinationId: "morro-de-sao-paulo",
      bbox: "-38.93,-13.40,-38.89,-13.35",
      zoom: 15,
    });
    const detail = await service.getDetail(asPlaceId("place-1"));

    expect(map.page.items).toEqual([]);
    expect(detail.detail).toBeNull();
  });
});


describe("handlePublicPlaceApiRequest", () => {
  function apiReadModel() {
    const published: PublicPlacePublishedRecord = Object.freeze({
      place: place(),
      publishedRevisionId: "place-1:r3",
      publishedRevision: 3,
    });
    return createPublicPlaceReadModel({
      repository: {
        listPublished: vi.fn(async () => ({
          items: [published],
          nextCursor: null,
        })),
        getPublished: vi.fn(async () => published),
      },
      media: { getPublishedMedia: vi.fn(async () => null) },
      commerce: { getPublicCommerce: vi.fn(async () => null) },
      actions: {
        resolvePublicActions: vi.fn(async ({ place }: Parameters<PublicPlaceActionPort["resolvePublicActions"]>[0]) =>
          Object.freeze({
            placeId: place.id,
            businessId: "business-1",
            destinationId: place.destinationId,
            primaryAction: null,
            secondaryActions: Object.freeze([]),
          }),
        ),
      },
    });
  }

  it("serves GET /api/places/v1/map and supports conditional ETag", async () => {
    const readModel = apiReadModel();
    const first = await handlePublicPlaceApiRequest(readModel, {
      method: "GET",
      pathname: "/api/places/v1/map",
      query: {
        destinationId: "morro-de-sao-paulo",
        bbox: "-38.93,-13.40,-38.89,-13.35",
        zoom: 15,
      },
    });
    expect(first?.status).toBe(200);
    const etag = first?.headers.etag;
    expect(etag).toBeTruthy();

    const conditional = await handlePublicPlaceApiRequest(readModel, {
      method: "GET",
      pathname: "/api/places/v1/map",
      query: {
        destinationId: "morro-de-sao-paulo",
        bbox: "-38.93,-13.40,-38.89,-13.35",
        zoom: 15,
      },
      headers: { "if-none-match": etag },
    });
    expect(conditional?.status).toBe(304);
  });

  it("serves published place detail and rejects malformed queries/ids", async () => {
    const readModel = apiReadModel();
    const detail = await handlePublicPlaceApiRequest(readModel, {
      method: "GET",
      pathname: "/api/places/v1/place-1",
      locale: "pt-BR",
    });
    expect(detail?.status).toBe(200);

    const malformedMap = await handlePublicPlaceApiRequest(readModel, {
      method: "GET",
      pathname: "/api/places/v1/map",
      query: { destinationId: "morro", bbox: "bad", zoom: 15 },
    });
    expect(malformedMap?.status).toBe(400);

    const malformedId = await handlePublicPlaceApiRequest(readModel, {
      method: "GET",
      pathname: "/api/places/v1/%2Fetc",
    });
    expect(malformedId?.status).toBe(400);
  });
});
