import { describe, expect, it, vi } from "vitest";

import type { SearchCatalogItem } from "./index.js";
import type { MapboxSearchResult } from "./mapbox-search-provider.js";
import {
  createSearchApplication,
  filterV1RegionalMapboxResults,
  isLikelyV1PlaceQuery,
  isWithinV1SearchRegion,
} from "./search-application.js";

const catalog: readonly SearchCatalogItem[] = Object.freeze([
  Object.freeze({
    id: "farol",
    name: "Farol do Morro",
    category: "attractions",
    aliases: Object.freeze(["farol"]),
    tags: Object.freeze(["sunset"]),
    area: "Vila",
  }),
]);

function mapboxResult(
  overrides: Partial<MapboxSearchResult> = {},
): MapboxSearchResult {
  return Object.freeze({
    name: "Resultado externo",
    lat: -13.376,
    lon: -38.917,
    description: "",
    fullAddress: "",
    placeFormatted: "Bahia, Brasil",
    featureType: "poi",
    category: "attractions",
    poiCategories: Object.freeze([]),
    maki: "",
    mapboxId: "mapbox-id",
    source: "mapbox",
    ...overrides,
  });
}

describe("Search application V1 orchestration", () => {
  it("returns local matches before consulting the external provider", async () => {
    const externalSearch = vi.fn().mockResolvedValue([mapboxResult()]);
    const application = createSearchApplication({
      catalog,
      externalProvider: { search: externalSearch },
    });

    const result = await application.search("farol");

    expect(result.source).toBe("local");
    expect(result.localResults).toHaveLength(1);
    expect(result.localResults[0]?.item.name).toBe("Farol do Morro");
    expect(result.externalResults).toEqual([]);
    expect(externalSearch).not.toHaveBeenCalled();
  });

  it("uses Mapbox only as fallback for inputs that look like place names", async () => {
    const externalSearch = vi.fn().mockResolvedValue([mapboxResult()]);
    const application = createSearchApplication({
      catalog,
      externalProvider: { search: externalSearch },
    });

    const generic = await application.search("onde fica salvador");
    const place = await application.search("Salvador", {
      language: "es",
      externalLimit: 4,
    });

    expect(generic.source).toBe("none");
    expect(place.source).toBe("mapbox");
    expect(externalSearch).toHaveBeenCalledTimes(1);
    expect(externalSearch).toHaveBeenCalledWith("Salvador", {
      language: "es",
      limit: 4,
    });
  });

  it("preserves the V1 generic-question prefix guard", () => {
    expect(isLikelyV1PlaceQuery("Salvador")).toBe(true);
    expect(isLikelyV1PlaceQuery("Toca do Morcego")).toBe(true);
    expect(isLikelyV1PlaceQuery("onde fica Salvador")).toBe(false);
    expect(isLikelyV1PlaceQuery("como chegar")).toBe(false);
    expect(isLikelyV1PlaceQuery("ha restaurante")).toBe(false);
    expect(isLikelyV1PlaceQuery("ab")).toBe(false);
  });

  it("keeps only Mapbox results accepted by the V1 regional filter", () => {
    const results = filterV1RegionalMapboxResults([
      mapboxResult({ mapboxId: "bahia", placeFormatted: "Salvador, Bahia" }),
      mapboxResult({
        mapboxId: "nearby",
        placeFormatted: "Local sem marcador regional",
        lat: -13.4,
        lon: -38.95,
      }),
      mapboxResult({
        mapboxId: "remote",
        placeFormatted: "Lisboa, Portugal",
        lat: 38.7223,
        lon: -9.1393,
      }),
      mapboxResult({
        mapboxId: "empty-copy",
        placeFormatted: "",
        lat: 38.7223,
        lon: -9.1393,
      }),
    ]);

    expect(results.map((result) => result.mapboxId)).toEqual([
      "bahia",
      "nearby",
      "empty-copy",
    ]);
    expect(isWithinV1SearchRegion(-13.4, -38.95)).toBe(true);
    expect(isWithinV1SearchRegion(38.7223, -9.1393)).toBe(false);
  });

  it("forwards explicit proximity and fails closed on provider errors", async () => {
    const proximity = { lon: -38.9, lat: -13.3 } as const;
    const successfulSearch = vi.fn().mockResolvedValue([mapboxResult()]);
    const successful = createSearchApplication({
      catalog: [],
      externalProvider: { search: successfulSearch },
    });
    const failing = createSearchApplication({
      catalog: [],
      externalProvider: {
        search: vi.fn().mockRejectedValue(new Error("provider failure")),
      },
    });

    const success = await successful.search("Garapua", { proximity });
    const failure = await failing.search("Garapua");

    expect(success.source).toBe("mapbox");
    expect(successfulSearch).toHaveBeenCalledWith("Garapua", {
      language: "pt",
      limit: 5,
      proximity,
    });
    expect(failure).toEqual({
      source: "none",
      localResults: [],
      externalResults: [],
    });
  });
});
