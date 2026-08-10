import {
  searchCatalog,
  type SearchCatalogItem,
  type SearchFilters,
  type SearchResult,
} from "./index.js";
import type {
  MapboxSearchOptions,
  MapboxSearchProximity,
  MapboxSearchResult,
} from "./mapbox-search-provider.js";

export interface SearchExternalProvider {
  search(
    query: string,
    options?: MapboxSearchOptions,
  ): Promise<readonly MapboxSearchResult[]>;
}

export interface SearchApplicationOptions {
  readonly filters?: SearchFilters;
  readonly language?: string;
  readonly externalLimit?: number;
  readonly proximity?: MapboxSearchProximity | null;
}

export interface SearchApplicationResult<
  T extends SearchCatalogItem = SearchCatalogItem,
> {
  readonly source: "local" | "mapbox" | "none";
  readonly localResults: readonly SearchResult<T>[];
  readonly externalResults: readonly MapboxSearchResult[];
}

export interface SearchApplicationConfig<
  T extends SearchCatalogItem = SearchCatalogItem,
> {
  readonly catalog: readonly T[];
  readonly externalProvider?: SearchExternalProvider;
}

const MORRO_FILTER_CENTER = Object.freeze({
  lat: -13.376,
  lon: -38.917,
});
const MORRO_FILTER_RADIUS_METERS = 50_000;
const GENERIC_QUESTION_PREFIX =
  /^(como|quanto|qual|quando|onde|por que|porque|o que|quem|voce|me|meu|minha|tem|ha|existe|existem)$/i;

function emptyResult<T extends SearchCatalogItem>(): SearchApplicationResult<T> {
  return Object.freeze({
    source: "none",
    localResults: Object.freeze([]),
    externalResults: Object.freeze([]),
  });
}

function normalizeFallbackQuery(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function isLikelyV1PlaceQuery(query: string): boolean {
  const normalized = normalizeFallbackQuery(query);
  if (normalized.length < 3) return false;

  const firstToken = normalized.split(" ")[0] ?? "";
  return !GENERIC_QUESTION_PREFIX.test(firstToken);
}

export function isWithinV1SearchRegion(
  lat: number,
  lon: number,
  centerLat = MORRO_FILTER_CENTER.lat,
  centerLon = MORRO_FILTER_CENTER.lon,
  radiusMeters = MORRO_FILTER_RADIUS_METERS,
): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;

  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusMeters = 6_371_000;
  const deltaLat = toRadians(lat - centerLat);
  const deltaLon = toRadians(lon - centerLon);
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(centerLat)) *
      Math.cos(toRadians(lat)) *
      Math.sin(deltaLon / 2) ** 2;

  return (
    earthRadiusMeters *
      2 *
      Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine)) <=
    radiusMeters
  );
}

export function filterV1RegionalMapboxResults(
  results: readonly MapboxSearchResult[],
): readonly MapboxSearchResult[] {
  return Object.freeze(
    results.filter(
      (result) =>
        !result.placeFormatted ||
        result.placeFormatted.includes("Bahia") ||
        result.placeFormatted.includes("Brasil") ||
        result.placeFormatted.includes("Brazil") ||
        result.placeFormatted.includes("Morro") ||
        isWithinV1SearchRegion(result.lat, result.lon),
    ),
  );
}

export function createSearchApplication<T extends SearchCatalogItem>(
  config: SearchApplicationConfig<T>,
) {
  const catalog = Object.freeze([...config.catalog]);

  async function search(
    query: string,
    options: SearchApplicationOptions = {},
  ): Promise<SearchApplicationResult<T>> {
    const localResults = searchCatalog(catalog, query, options.filters ?? {});
    if (localResults.length > 0) {
      return Object.freeze({
        source: "local" as const,
        localResults,
        externalResults: Object.freeze([]),
      });
    }

    if (!config.externalProvider || !isLikelyV1PlaceQuery(query)) {
      return emptyResult<T>();
    }

    try {
      const externalResults = filterV1RegionalMapboxResults(
        await config.externalProvider.search(query, {
          language: options.language || "pt",
          limit: options.externalLimit || 5,
          ...(options.proximity === undefined
            ? {}
            : { proximity: options.proximity }),
        }),
      );

      if (externalResults.length === 0) return emptyResult<T>();

      return Object.freeze({
        source: "mapbox" as const,
        localResults: Object.freeze([]),
        externalResults,
      });
    } catch {
      return emptyResult<T>();
    }
  }

  return Object.freeze({ search });
}
