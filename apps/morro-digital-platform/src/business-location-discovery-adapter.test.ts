import { describe, expect, it, vi } from "vitest";

import type { DestinationId } from "@touristic/core";
import {
  asBusinessId,
  asCategoryId,
  asPlaceId,
  type Place,
  type PlaceAccessScope,
} from "@touristic/business";

import {
  createBusinessLocationDiscoveryAdapter,
  createManualLocationSelection,
  normalizeLocationDiscoveryQuery,
  type BusinessLocationPlaceRepository,
} from "./business-location-discovery-adapter.js";

const destinationId = "morro-de-sao-paulo" as DestinationId;
const businessId = asBusinessId("business-toca");
const placeId = asPlaceId("place-toca");
const categoryId = asCategoryId("category-nightlife");

const mutationScope: PlaceAccessScope = Object.freeze({
  businessIds: Object.freeze([businessId]),
  destinationIds: Object.freeze([destinationId]),
  capabilities: Object.freeze(["business.update"] as const),
});

function makePlace(overrides: Partial<Place> = {}): Place {
  return Object.freeze({
    id: placeId,
    businessId,
    destinationId,
    name: "Toca do Morcego",
    slug: "toca-do-morcego",
    categoryId,
    subcategoryIds: Object.freeze([]),
    shortDescription: "",
    description: "",
    location: Object.freeze({
      latitude: -13.3766787,
      longitude: -38.9172057,
      address: "Morro de São Paulo",
      area: "Centro",
      source: "imported",
      externalProvider: "morro-v1-catalog",
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
    capabilities: Object.freeze({ enabled: Object.freeze([]) }),
    visibility: "private",
    publicationState: "draft",
    createdAt: "2026-09-24T00:00:00.000Z",
    updatedAt: "2026-09-24T00:00:00.000Z",
    ...overrides,
  });
}

function createRepository(
  initialPlaces: readonly Place[] = [makePlace()],
): BusinessLocationPlaceRepository & { readonly saved: Place[] } {
  const places = [...initialPlaces];
  const saved: Place[] = [];
  return {
    saved,
    async getById(id) {
      return places.find((place) => place.id === id) ?? null;
    },
    async listByDestination(id) {
      return Object.freeze(
        places.filter((place) => place.destinationId === id),
      );
    },
    async save(place) {
      saved.push(place);
      const index = places.findIndex((entry) => entry.id === place.id);
      if (index >= 0) places[index] = place;
      else places.push(place);
      return place;
    },
  };
}

function createAdapter(
  input: {
    readonly repository?: BusinessLocationPlaceRepository;
    readonly fetch?: typeof globalThis.fetch;
    readonly token?: string;
    readonly radiusMeters?: number;
    readonly geolocation?: {
      readonly getCurrentPosition: Geolocation["getCurrentPosition"];
    };
    readonly timeoutMs?: number;
  } = {},
) {
  return createBusinessLocationDiscoveryAdapter({
    destination: {
      id: destinationId,
      center: { latitude: -13.3833, longitude: -38.9167 },
      radiusMeters: input.radiusMeters ?? 15_000,
    },
    repository: input.repository ?? createRepository(),
    ...(input.fetch ? { fetch: input.fetch } : {}),
    ...(input.token ? { mapboxAccessToken: input.token } : {}),
    ...(input.geolocation ? { geolocation: input.geolocation } : {}),
    ...(input.timeoutMs ? { providerTimeoutMs: input.timeoutMs } : {}),
  });
}

function searchRequest(query: string) {
  return {
    businessId,
    destinationId,
    query,
    scope: mutationScope,
    language: "pt",
    limit: 10,
  } as const;
}

function mapboxPayload(features: readonly Record<string, unknown>[]): Response {
  return new Response(JSON.stringify({ features }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Wave B business location discovery", () => {
  it("finds an exact canonical business before external confirmation", async () => {
    const fetchSpy = vi.fn<typeof globalThis.fetch>(async () =>
      mapboxPayload([]),
    );
    const adapter = createAdapter({ fetch: fetchSpy, token: "pk.test" });

    const results = await adapter.search(searchRequest("Toca do Morcego"));

    expect(results[0]).toEqual(
      expect.objectContaining({
        source: "canonical",
        name: "Toca do Morcego",
        confidence: 1,
        eligible: true,
      }),
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("returns multiple similar candidates without auto-selecting one", async () => {
    const repository = createRepository([
      makePlace(),
      makePlace({
        id: asPlaceId("place-toca-praia"),
        name: "Toca do Morcego Praia",
        slug: "toca-do-morcego-praia",
        location: Object.freeze({
          ...makePlace().location,
          latitude: -13.378,
          longitude: -38.914,
        }),
      }),
    ]);
    const adapter = createAdapter({ repository });

    const results = await adapter.search(searchRequest("Toca"));

    expect(
      results.filter((candidate) => candidate.source === "canonical"),
    ).toHaveLength(2);
    expect(repository.saved).toHaveLength(0);
  });

  it("returns no candidate when local and provider sources have no match", async () => {
    const repository = createRepository([]);
    const adapter = createAdapter({
      repository,
      token: "pk.test",
      fetch: async () => mapboxPayload([]),
    });

    await expect(
      adapter.search(searchRequest("Empresa inexistente xyz")),
    ).resolves.toEqual([]);
  });

  it("marks a provider result outside the destination as ineligible", async () => {
    const repository = createRepository([]);
    const adapter = createAdapter({
      repository,
      token: "pk.test",
      radiusMeters: 5_000,
      fetch: async () =>
        mapboxPayload([
          {
            properties: {
              name: "Empresa Salvador",
              full_address: "Salvador, Bahia",
              feature_type: "poi",
              poi_category: ["restaurant"],
              mapbox_id: "mbx.salvador",
            },
            geometry: { coordinates: [-38.5014, -12.9714] },
          },
        ]),
    });

    const results = await adapter.search(searchRequest("Empresa Salvador"));

    expect(results[0]).toEqual(
      expect.objectContaining({
        source: "mapbox",
        eligible: false,
        rejectionReason: "OUTSIDE_DESTINATION",
      }),
    );
  });

  it("deduplicates the same local business across canonical and legacy sources", async () => {
    const adapter = createAdapter();

    const results = await adapter.search(searchRequest("Toca do Morcego"));
    const localToca = results.filter(
      (candidate) =>
        candidate.name === "Toca do Morcego" &&
        Math.abs(candidate.latitude - -13.3766787) < 0.00001 &&
        Math.abs(candidate.longitude - -38.9172057) < 0.00001,
    );

    expect(localToca).toHaveLength(1);
    expect(localToca[0]?.source).toBe("canonical");
  });

  it("fails soft when the external provider is unavailable", async () => {
    const repository = createRepository([]);
    const adapter = createAdapter({
      repository,
      token: "pk.test",
      fetch: async () => new Response("down", { status: 503 }),
    });

    await expect(
      adapter.search(searchRequest("Provider only place")),
    ).resolves.toEqual([]);
  });

  it("fails soft on provider timeout", async () => {
    const repository = createRepository([]);
    const adapter = createAdapter({
      repository,
      token: "pk.test",
      timeoutMs: 5,
      fetch: async () =>
        new Promise<Response>(() => {
          // Intentionally unresolved to prove the timeout boundary.
        }),
    });

    await expect(
      adapter.search(searchRequest("Provider timeout place")),
    ).resolves.toEqual([]);
  });

  it("returns denied when GPS permission is denied", async () => {
    const adapter = createAdapter({
      geolocation: {
        getCurrentPosition(_success, error) {
          error?.({
            code: 1,
            message: "denied",
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3,
          });
        },
      },
    });

    await expect(adapter.requestDeviceLocation()).resolves.toEqual({
      status: "denied",
      selection: null,
      accuracy: null,
    });
  });

  it("creates a valid manual latitude/longitude fallback", () => {
    expect(
      createManualLocationSelection(-13.38, -38.91, {
        address: "Rua <b>Teste</b>",
        area: "Centro",
      }),
    ).toEqual({
      source: "manual",
      latitude: -13.38,
      longitude: -38.91,
      address: "Rua Teste",
      area: "Centro",
      externalProvider: null,
      externalPlaceId: null,
    });
  });

  it("rejects invalid latitude and longitude", () => {
    expect(() => createManualLocationSelection(91, -38.91)).toThrowError(
      "INVALID_LATITUDE",
    );
    expect(() => createManualLocationSelection(-13.38, -181)).toThrowError(
      "INVALID_LONGITUDE",
    );
  });

  it("persists a confirmed Mapbox location with verification metadata", async () => {
    const repository = createRepository();
    const adapter = createAdapter({ repository });
    const candidate = {
      candidateId: "mapbox:mbx.toca",
      source: "mapbox",
      name: "Toca do Morcego",
      address: "Morro de São Paulo, BA",
      category: "nightlife",
      latitude: -13.3767,
      longitude: -38.9172,
      externalProvider: "mapbox",
      externalPlaceId: "mbx.toca",
      distanceMeters: 700,
      confidence: 0.95,
      eligible: true,
      rejectionReason: null,
    } as const;

    const saved = await adapter.confirmCandidate({
      placeId,
      businessId,
      destinationId,
      scope: mutationScope,
      candidate,
      verifiedAt: "2026-09-24T21:00:00.000Z",
      verifiedBy: "operator-1",
    });

    expect(saved.location).toEqual({
      latitude: -13.3767,
      longitude: -38.9172,
      address: "Morro de São Paulo, BA",
      area: "",
      source: "mapbox",
      externalProvider: "mapbox",
      externalPlaceId: "mbx.toca",
      verifiedAt: "2026-09-24T21:00:00.000Z",
      verifiedBy: "operator-1",
    });
    expect(repository.saved).toHaveLength(1);
  });

  it("blocks cross-business location mutation", async () => {
    const repository = createRepository();
    const adapter = createAdapter({ repository });

    await expect(
      adapter.confirmSelection({
        placeId,
        businessId: asBusinessId("other-business"),
        destinationId,
        scope: {
          businessIds: [asBusinessId("other-business")],
          destinationIds: [destinationId],
          capabilities: ["business.update"],
        },
        selection: createManualLocationSelection(-13.38, -38.91),
        verifiedAt: "2026-09-24T21:00:00.000Z",
        verifiedBy: "operator-1",
      }),
    ).rejects.toThrowError("CROSS_BUSINESS_LOCATION_MUTATION");
    expect(repository.saved).toHaveLength(0);
  });

  it("blocks arbitrary or cross-destination mutation", async () => {
    const repository = createRepository();
    const adapter = createAdapter({ repository });
    const wrongDestination = "itacare" as DestinationId;

    await expect(
      adapter.confirmSelection({
        placeId,
        businessId,
        destinationId: wrongDestination,
        scope: {
          businessIds: [businessId],
          destinationIds: [wrongDestination],
          capabilities: ["business.update"],
        },
        selection: createManualLocationSelection(-13.38, -38.91),
        verifiedAt: "2026-09-24T21:00:00.000Z",
        verifiedBy: "operator-1",
      }),
    ).rejects.toThrowError("LOCATION_DESTINATION_DENIED");
    expect(repository.saved).toHaveLength(0);
  });

  it("rejects confirmation outside the configured destination boundary", async () => {
    const repository = createRepository();
    const adapter = createAdapter({ repository, radiusMeters: 5_000 });

    await expect(
      adapter.confirmSelection({
        placeId,
        businessId,
        destinationId,
        scope: mutationScope,
        selection: createManualLocationSelection(-12.9714, -38.5014),
        verifiedAt: "2026-09-24T21:00:00.000Z",
        verifiedBy: "operator-1",
      }),
    ).rejects.toThrowError("LOCATION_OUTSIDE_DESTINATION");
  });

  it("sanitizes injection-shaped search text before provider use", async () => {
    let observedUrl = "";
    const repository = createRepository([]);
    const adapter = createAdapter({
      repository,
      token: "pk.test",
      fetch: async (input) => {
        observedUrl =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url;
        return mapboxPayload([]);
      },
    });

    const raw = "<script>alert(1)</script> Toca";
    await adapter.search(searchRequest(raw));

    expect(normalizeLocationDiscoveryQuery(raw)).not.toContain("<");
    expect(normalizeLocationDiscoveryQuery(raw)).not.toContain(">");
    expect(decodeURIComponent(observedUrl)).not.toContain("<script>");
    expect(decodeURIComponent(observedUrl)).not.toContain("</script>");
  });
});
