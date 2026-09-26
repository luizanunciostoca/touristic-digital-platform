import { describe, expect, it, vi } from "vitest";

import { fetchAssistantPlaceDetails } from "./assistant-place-details-adapter.js";

function fetchInputUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function mapboxResponse(): Response {
  return new Response(
    JSON.stringify({
      features: [
        {
          geometry: { coordinates: [-38.91, -13.38] },
          properties: {
            mapbox_id: "poi.far",
            full_address: "Resultado distante",
            poi_category: ["bar"],
          },
        },
        {
          geometry: { coordinates: [-38.9118443, -13.3800508] },
          properties: {
            mapbox_id: "poi.segunda-praia",
            full_address: "Segunda Praia, Morro de São Paulo",
            poi_category: ["beach"],
            metadata: {
              open_hours: { open_now: true },
              phone: "+55 75 99999-0000",
              website: "https://example.com/segunda-praia",
            },
          },
        },
      ],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

describe("assistant place details adapter", () => {
  it("prefers canonical published Place details and never calls Mapbox", async () => {
    const fetchImplementation = vi.fn<typeof globalThis.fetch>(
      async (input) => {
        const url = fetchInputUrl(input);
        if (url.startsWith("/api/places/v1/map?")) {
          return new Response(
            JSON.stringify({
              items: [
                {
                  id: "place-toca-do-morcego",
                  name: "Toca do Morcego",
                  category: "nightlife",
                  lat: -13.377,
                  lng: -38.917,
                  presentation: { markerKey: "nightlife", priority: 10 },
                },
              ],
              nextCursor: null,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (url.startsWith("/api/places/v1/place-toca-do-morcego?")) {
          return new Response(
            JSON.stringify({
              profile: {
                id: "place-toca-do-morcego",
                destinationId: "morro-de-sao-paulo",
                name: "Toca do Morcego",
                slug: "toca-do-morcego",
                categoryId: "nightlife",
                subcategoryIds: [],
                shortDescription: "Vida noturna em Morro de São Paulo.",
                description: "Vida noturna em Morro de São Paulo.",
                location: {
                  latitude: -13.377,
                  longitude: -38.917,
                  address: "Morro de São Paulo",
                  area: "Centro",
                },
                contact: {
                  phone: "+55 75 99999-1111",
                  whatsapp: null,
                  email: null,
                  website: "https://example.com/toca",
                },
                openingHours: null,
                amenities: [],
                tags: [],
                capabilities: ["directions", "photos"],
              },
              media: null,
              commerce: null,
              actions: {
                placeId: "place-toca-do-morcego",
                businessId: "toca-do-morcego",
                destinationId: "morro-de-sao-paulo",
                primaryAction: null,
                secondaryActions: [],
              },
              partial: {
                media: "unavailable",
                commerce: "ready",
                actions: "ready",
              },
              revision: { id: "place-toca-do-morcego:r3", number: 3 },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        throw new Error(`unexpected external request: ${url}`);
      },
    );

    await expect(
      fetchAssistantPlaceDetails("Toca do Morcego", {
        accessToken: "pk.test",
        fetch: fetchImplementation,
      }),
    ).resolves.toEqual({
      name: "Toca do Morcego",
      address: "Morro de São Paulo",
      category: "Vida Noturna",
      openNow: null,
      phone: "+55 75 99999-1111",
      website: "https://example.com/toca",
      mapboxId: null,
      source: "canonical",
      placeId: "place-toca-do-morcego",
    });

    expect(
      fetchImplementation.mock.calls.some(([input]) =>
        fetchInputUrl(input).startsWith("https://api.mapbox.com/"),
      ),
    ).toBe(false);
  });

  it("uses the curated V1 destination as Mapbox fallback query and proximity", async () => {
    const fetchImplementation = vi.fn<typeof globalThis.fetch>(
      async (input) => {
        const url = fetchInputUrl(input);
        if (url.startsWith("/api/places/v1/map?")) {
          return new Response(JSON.stringify({ items: [], nextCursor: null }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return mapboxResponse();
      },
    );

    const details = await fetchAssistantPlaceDetails("praia 2", {
      accessToken: "pk.test",
      fetch: fetchImplementation,
    });

    expect(details).toEqual({
      name: "Segunda Praia",
      address: "Segunda Praia, Morro de São Paulo",
      category: "beach",
      openNow: true,
      phone: "+55 75 99999-0000",
      website: "https://example.com/segunda-praia",
      mapboxId: "poi.segunda-praia",
    });
    const mapboxCall = fetchImplementation.mock.calls.find(([input]) =>
      fetchInputUrl(input).startsWith("https://api.mapbox.com/"),
    );
    expect(mapboxCall).toBeDefined();
    const requestUrl = mapboxCall ? fetchInputUrl(mapboxCall[0]) : "";
    expect(requestUrl).toContain("q=Segunda+Praia");
    expect(requestUrl).toContain("access_token=pk.test");
    expect(requestUrl).toContain("proximity=-38.9118443%2C-13.3800508");
  });

  it("does not call Mapbox without a public access token", async () => {
    const fetchImplementation = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response(JSON.stringify({ items: [], nextCursor: null }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );

    await expect(
      fetchAssistantPlaceDetails("Segunda Praia", {
        fetch: fetchImplementation,
      }),
    ).resolves.toBeNull();
    expect(
      fetchImplementation.mock.calls.some(([input]) =>
        fetchInputUrl(input).startsWith("https://api.mapbox.com/"),
      ),
    ).toBe(false);
  });

  it("returns null instead of inventing details for an unknown place", async () => {
    const fetchImplementation = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response(JSON.stringify({ items: [], nextCursor: null }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );

    await expect(
      fetchAssistantPlaceDetails("Lugar inexistente XYZ", {
        accessToken: "pk.test",
        fetch: fetchImplementation,
      }),
    ).resolves.toBeNull();
    expect(
      fetchImplementation.mock.calls.some(([input]) =>
        fetchInputUrl(input).startsWith("https://api.mapbox.com/"),
      ),
    ).toBe(false);
  });
});
