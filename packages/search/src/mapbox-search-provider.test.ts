import { describe, expect, it, vi } from "vitest";

import {
  createMapboxSearchProvider,
  normalizeMapboxFeature,
} from "./mapbox-search-provider.js";

function response(payload: unknown, ok = true): Response {
  return {
    ok,
    json: async () => payload,
  } as Response;
}

function requestedUrl(
  fetchMock: ReturnType<typeof vi.fn<typeof fetch>>,
  index: number,
): URL {
  const input = fetchMock.mock.calls[index]?.[0];
  if (!input) throw new Error(`Missing fetch call at index ${index}`);

  if (typeof input === "string") return new URL(input);
  if (input instanceof URL) return input;
  return new URL(input.url);
}

describe("Mapbox Search provider", () => {
  it("fails closed for short queries and missing token", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const withoutToken = createMapboxSearchProvider({
      token: "",
      fetch: fetchMock,
    });
    const provider = createMapboxSearchProvider({
      token: "token",
      fetch: fetchMock,
    });

    await expect(withoutToken.search("morro")).resolves.toEqual([]);
    await expect(provider.search(" ")).resolves.toEqual([]);
    await expect(provider.search("a")).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("preserves V1 default and optional request parameters", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response({ features: [] }));
    const provider = createMapboxSearchProvider({
      token: "token",
      fetch: fetchMock,
    });

    await provider.search("Morro", {
      language: "es",
      limit: 50,
      types: "poi",
      country: "BR",
      proximity: { lon: -38.9, lat: -13.3 },
      bbox: "-39,-14,-38,-13",
      poiCategory: "restaurant",
    });

    const url = requestedUrl(fetchMock, 0);
    expect(url.searchParams.get("q")).toBe("Morro");
    expect(url.searchParams.get("language")).toBe("es");
    expect(url.searchParams.get("limit")).toBe("10");
    expect(url.searchParams.get("types")).toBe("poi");
    expect(url.searchParams.get("country")).toBe("BR");
    expect(url.searchParams.get("proximity")).toBe("-38.9,-13.3");
    expect(url.searchParams.get("bbox")).toBe("-39,-14,-38,-13");
    expect(url.searchParams.get("poi_category")).toBe("restaurant");
  });

  it("uses Morro defaults and supports global search without proximity", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response({ features: [] }));
    const provider = createMapboxSearchProvider({
      token: "token",
      fetch: fetchMock,
    });

    await provider.search("Praia");
    await provider.searchGlobal("Salvador");

    const localUrl = requestedUrl(fetchMock, 0);
    const globalUrl = requestedUrl(fetchMock, 1);
    expect(localUrl.searchParams.get("language")).toBe("pt");
    expect(localUrl.searchParams.get("limit")).toBe("5");
    expect(localUrl.searchParams.get("proximity")).toBe("-38.9159,-13.3775");
    expect(globalUrl.searchParams.has("proximity")).toBe(false);
  });

  it("normalizes Mapbox features into the V1 internal result model", () => {
    expect(
      normalizeMapboxFeature({
        properties: {
          name: "Café Teste",
          full_address: "Rua Teste, 1",
          feature_type: "poi",
          poi_category: ["cafe"],
          mapbox_id: "id-1",
        },
        geometry: { coordinates: [-38.9, -13.3] },
      }),
    ).toMatchObject({
      name: "Café Teste",
      lat: -13.3,
      lon: -38.9,
      category: "restaurants",
      description: "Rua Teste, 1",
      mapboxId: "id-1",
      source: "mapbox",
    });
  });

  it("caches successful results for five minutes and expires afterward", async () => {
    let now = 1_000;
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      response({
        features: [
          {
            properties: { name: "Farol", feature_type: "poi" },
            geometry: { coordinates: [-38.9, -13.3] },
          },
        ],
      }),
    );
    const provider = createMapboxSearchProvider({
      token: "token",
      fetch: fetchMock,
      now: () => now,
    });

    await provider.search("Farol", { language: "pt" });
    await provider.search("Farol", { language: "pt" });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    now += 5 * 60 * 1000;
    await provider.search("Farol", { language: "pt" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("degrades HTTP, malformed and thrown fetch failures to an empty result", async () => {
    const httpFailure = createMapboxSearchProvider({
      token: "token",
      fetch: vi.fn<typeof fetch>().mockResolvedValue(response({}, false)),
    });
    const empty = createMapboxSearchProvider({
      token: "token",
      fetch: vi.fn<typeof fetch>().mockResolvedValue(response({})),
    });
    const thrown = createMapboxSearchProvider({
      token: "token",
      fetch: vi.fn<typeof fetch>().mockRejectedValue(new Error("network")),
    });

    await expect(httpFailure.search("Morro")).resolves.toEqual([]);
    await expect(empty.search("Morro")).resolves.toEqual([]);
    await expect(thrown.search("Morro")).resolves.toEqual([]);
  });
});
