export interface MapboxSearchProximity {
  readonly lon: number;
  readonly lat: number;
}

export interface MapboxSearchOptions {
  readonly language?: string;
  readonly limit?: number;
  readonly types?: string;
  readonly country?: string;
  readonly proximity?: MapboxSearchProximity | null;
  readonly bbox?: string;
  readonly poiCategory?: string;
}

export interface MapboxSearchResult {
  readonly name: string;
  readonly lat: number;
  readonly lon: number;
  readonly description: string;
  readonly fullAddress: string;
  readonly placeFormatted: string;
  readonly featureType: string;
  readonly category: string;
  readonly poiCategories: readonly string[];
  readonly maki: string;
  readonly mapboxId: string;
  readonly source: "mapbox";
}

interface MapboxFeatureProperties {
  readonly name?: string;
  readonly name_preferred?: string;
  readonly full_address?: string;
  readonly place_formatted?: string;
  readonly feature_type?: string;
  readonly poi_category?: readonly string[];
  readonly maki?: string;
  readonly mapbox_id?: string;
}

interface MapboxFeature {
  readonly properties?: MapboxFeatureProperties;
  readonly geometry?: {
    readonly coordinates?: readonly number[];
  };
}

interface MapboxSearchResponse {
  readonly features?: readonly MapboxFeature[];
}

export interface MapboxSearchProviderConfig {
  readonly token: string;
  readonly fetch: typeof fetch;
  readonly now?: () => number;
}

const SEARCH_BASE_URL = "https://api.mapbox.com/search/searchbox/v1/forward";
const CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_PROXIMITY: MapboxSearchProximity = Object.freeze({
  lon: -38.9159,
  lat: -13.3775,
});

const FEATURE_CATEGORY: Readonly<Record<string, string>> = Object.freeze({
  poi: "attractions",
  address: "addresses",
  place: "places",
  locality: "places",
  neighborhood: "places",
  region: "places",
  country: "places",
  street: "addresses",
  postcode: "addresses",
  district: "places",
  city: "places",
});

function categoryFromPoiCategories(
  featureType: string,
  poiCategories: readonly string[],
): string {
  const category = FEATURE_CATEGORY[featureType] ?? "places";
  const poiCategory = poiCategories[0]?.toLowerCase();
  if (!poiCategory) return category;

  if (
    poiCategory.includes("restaurant") ||
    poiCategory.includes("food") ||
    poiCategory.includes("cafe")
  ) {
    return "restaurants";
  }
  if (
    poiCategory.includes("hotel") ||
    poiCategory.includes("lodging") ||
    poiCategory.includes("inn")
  ) {
    return "hotels";
  }
  if (
    poiCategory.includes("shop") ||
    poiCategory.includes("store") ||
    poiCategory.includes("market")
  ) {
    return "shops";
  }
  if (
    poiCategory.includes("bar") ||
    poiCategory.includes("nightclub") ||
    poiCategory.includes("pub")
  ) {
    return "nightlife";
  }
  if (
    poiCategory.includes("hospital") ||
    poiCategory.includes("police") ||
    poiCategory.includes("pharmacy")
  ) {
    return "emergencies";
  }
  if (
    poiCategory.includes("beach") ||
    poiCategory.includes("park") ||
    poiCategory.includes("museum") ||
    poiCategory.includes("monument")
  ) {
    return "attractions";
  }

  return category;
}

export function normalizeMapboxFeature(
  feature: MapboxFeature,
): MapboxSearchResult {
  const properties = feature.properties ?? {};
  const coordinates = feature.geometry?.coordinates ?? [0, 0];
  const fullAddress = properties.full_address ?? "";
  const placeFormatted = properties.place_formatted ?? "";
  const featureType = properties.feature_type ?? "unknown";
  const poiCategories = Object.freeze([...(properties.poi_category ?? [])]);

  return Object.freeze({
    name: properties.name_preferred ?? properties.name ?? "Local desconhecido",
    lat: coordinates[1] ?? 0,
    lon: coordinates[0] ?? 0,
    description: fullAddress || placeFormatted,
    fullAddress,
    placeFormatted,
    featureType,
    category: categoryFromPoiCategories(featureType, poiCategories),
    poiCategories,
    maki: properties.maki ?? "",
    mapboxId: properties.mapbox_id ?? "",
    source: "mapbox" as const,
  });
}

export function createMapboxSearchProvider(config: MapboxSearchProviderConfig) {
  const cache = new Map<
    string,
    { readonly timestamp: number; readonly results: readonly MapboxSearchResult[] }
  >();
  const now = config.now ?? Date.now;

  async function search(
    query: string,
    options: MapboxSearchOptions = {},
  ): Promise<readonly MapboxSearchResult[]> {
    if (!query || query.trim().length < 2 || !config.token) {
      return Object.freeze([]);
    }

    const cacheKey = `${query.toLowerCase()}|${JSON.stringify(options)}`;
    const cached = cache.get(cacheKey);
    if (cached && now() - cached.timestamp < CACHE_TTL_MS) return cached.results;

    const params = new URLSearchParams();
    params.set("q", query.trim());
    params.set("access_token", config.token);
    params.set("language", options.language || "pt");
    params.set("limit", String(Math.min(options.limit || 5, 10)));

    if (options.proximity !== null) {
      const proximity = options.proximity ?? DEFAULT_PROXIMITY;
      params.set("proximity", `${proximity.lon},${proximity.lat}`);
    }
    if (options.types) params.set("types", options.types);
    if (options.country) params.set("country", options.country);
    if (options.bbox) params.set("bbox", options.bbox);
    if (options.poiCategory) params.set("poi_category", options.poiCategory);

    try {
      const response = await config.fetch(`${SEARCH_BASE_URL}?${params.toString()}`);
      if (!response.ok) return Object.freeze([]);

      const payload = (await response.json()) as MapboxSearchResponse;
      if (!payload.features?.length) return Object.freeze([]);

      const results = Object.freeze(payload.features.map(normalizeMapboxFeature));
      cache.set(cacheKey, { timestamp: now(), results });
      return results;
    } catch {
      return Object.freeze([]);
    }
  }

  return Object.freeze({
    search,
    searchPoi: (query: string, options: MapboxSearchOptions = {}) =>
      search(query, { ...options, types: "poi" }),
    searchPlaces: (query: string, options: MapboxSearchOptions = {}) =>
      search(query, {
        ...options,
        types: "place,locality,neighborhood,address,street,region,country",
      }),
    searchGlobal: (query: string, options: MapboxSearchOptions = {}) =>
      search(query, { ...options, proximity: options.proximity ?? null }),
    clearCache: () => cache.clear(),
  });
}
