import type {
  AssistantDialogIntentHandler,
  AssistantDialogResponse,
} from "@touristic/assistant";
import {
  createMapboxSearchProvider,
  createSearchApplication,
  createSearchPresentationRows,
  formatSearchResultText,
  getSearchPresentationCopy,
  isLikelyV1PlaceQuery,
  morroV1SearchCatalog,
  normalizeSearchText,
  type MapboxSearchOptions,
  type MapboxSearchResult,
  type MorroV1SearchCatalogItem,
  type SearchPresentationItem,
} from "@touristic/search";

export interface AssistantSearchAdapterOptions {
  readonly fetch?: typeof globalThis.fetch;
  readonly mapboxAccessToken?: string;
}

type AssistantSearchLanguage = "pt" | "en" | "es" | "he";

const CANONICAL_SEARCH_DESTINATION_ID = "morro-de-sao-paulo";
const CANONICAL_SEARCH_BBOX = "-39.05,-13.50,-38.89,-13.35";
const CANONICAL_SEARCH_ZOOM = "13";
const CANONICAL_SEARCH_LIMIT = "1000";

interface CanonicalSearchPlace {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly lat: number;
  readonly lng: number;
}

function isCanonicalSearchPlace(value: unknown): value is CanonicalSearchPlace {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    typeof item.name === "string" &&
    typeof item.category === "string" &&
    typeof item.lat === "number" &&
    Number.isFinite(item.lat) &&
    typeof item.lng === "number" &&
    Number.isFinite(item.lng)
  );
}

function canonicalSearchScore(name: string, query: string): number | null {
  const normalizedName = normalizeSearchText(name);
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return null;
  if (normalizedName === normalizedQuery) return 0;
  if (normalizedName.startsWith(normalizedQuery)) return 1;
  if (normalizedName.includes(normalizedQuery)) return 2;
  const tokens = normalizedQuery.split(/\s+/u).filter(Boolean);
  if (
    tokens.length > 0 &&
    tokens.every((token) => normalizedName.includes(token))
  ) {
    return 3;
  }
  return null;
}

async function searchCanonicalPlaces(
  fetchImplementation: typeof globalThis.fetch,
  query: string,
): Promise<readonly CanonicalSearchPlace[]> {
  if (!isLikelyV1PlaceQuery(query)) return [];
  try {
    const params = new URLSearchParams({
      destinationId: CANONICAL_SEARCH_DESTINATION_ID,
      bbox: CANONICAL_SEARCH_BBOX,
      zoom: CANONICAL_SEARCH_ZOOM,
      limit: CANONICAL_SEARCH_LIMIT,
    });
    const response = await fetchImplementation(
      `/api/places/v1/map?${params.toString()}`,
      { method: "GET", headers: { Accept: "application/json" } },
    );
    if (!response.ok) return [];
    const body: unknown = await response.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return [];
    const rawItems = (body as Record<string, unknown>).items;
    if (!Array.isArray(rawItems)) return [];
    return Object.freeze(
      rawItems
        .filter(isCanonicalSearchPlace)
        .map((item) => ({
          item,
          score: canonicalSearchScore(item.name, query),
        }))
        .filter(
          (
            candidate,
          ): candidate is { item: CanonicalSearchPlace; score: number } =>
            candidate.score !== null,
        )
        .sort(
          (left, right) =>
            left.score - right.score ||
            left.item.name.localeCompare(right.item.name),
        )
        .slice(0, 8)
        .map(({ item }) => Object.freeze(item)),
    );
  } catch {
    return [];
  }
}

function providerUnavailableCopy(language: AssistantSearchLanguage): string {
  switch (language) {
    case "en":
      return "I couldn't search for new places right now. Your current map context was preserved.";
    case "es":
      return "No pude buscar nuevos lugares ahora. Se conservó el contexto actual del mapa.";
    case "he":
      return "לא ניתן לחפש מקומות חדשים כרגע. ההקשר הנוכחי במפה נשמר.";
    default:
      return "Não foi possível buscar novos lugares agora. O contexto atual do mapa foi preservado.";
  }
}

function localPresentationItem(
  item: MorroV1SearchCatalogItem,
): SearchPresentationItem {
  return { name: item.name, category: item.category };
}

function externalPresentationItem(
  item: MapboxSearchResult,
): SearchPresentationItem {
  return {
    name: item.name,
    category: item.category,
    ...(item.placeFormatted ? { placeFormatted: item.placeFormatted } : {}),
  };
}

function detailsSelectionValue(
  name: string,
  language: AssistantSearchLanguage,
): string {
  switch (language) {
    case "en":
      return `Tell me more about ${name}`;
    case "es":
      return `Detalles sobre ${name}`;
    case "he":
      return `פרטים על ${name}`;
    default:
      return `Fale sobre ${name}`;
  }
}

export function createAssistantSearchHandler(
  options: AssistantSearchAdapterOptions = {},
): AssistantDialogIntentHandler {
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  const token = options.mapboxAccessToken?.trim();
  let externalProviderFailed = false;
  const observedFetch: typeof fetch = async (input, init) => {
    try {
      const response = await fetchImplementation(input, init);
      if (!response.ok) externalProviderFailed = true;
      return response;
    } catch (error) {
      externalProviderFailed = true;
      throw error;
    }
  };
  const mapboxProvider = token
    ? createMapboxSearchProvider({ token, fetch: observedFetch })
    : undefined;
  const externalProvider = mapboxProvider
    ? {
        async search(query: string, searchOptions?: MapboxSearchOptions) {
          try {
            return await mapboxProvider.search(query, searchOptions);
          } catch (error) {
            externalProviderFailed = true;
            throw error;
          }
        },
      }
    : undefined;
  const application = createSearchApplication({
    catalog: morroV1SearchCatalog,
    ...(externalProvider ? { externalProvider } : {}),
  });

  return async (request): Promise<AssistantDialogResponse> => {
    const query = request.intent.entities.searchQuery ?? request.input;
    const language = request.intent.entities.language ?? "pt";
    const copy = getSearchPresentationCopy(language);
    externalProviderFailed = false;
    const canonicalResults = await searchCanonicalPlaces(
      fetchImplementation,
      query,
    );
    const result =
      canonicalResults.length === 0
        ? await application.search(query, { language })
        : null;
    const providerUnavailable =
      canonicalResults.length === 0 &&
      result?.source === "none" &&
      isLikelyV1PlaceQuery(query) &&
      (!externalProvider || externalProviderFailed);

    const items: readonly SearchPresentationItem[] =
      canonicalResults.length > 0
        ? canonicalResults.map((item) => ({
            name: item.name,
            category: item.category,
          }))
        : result?.source === "local"
          ? result.localResults.map(({ item }) => localPresentationItem(item))
          : result?.source === "mapbox"
            ? result.externalResults.map(externalPresentationItem)
            : [];

    const exploreResults =
      canonicalResults.length > 0
        ? canonicalResults.map((item) => ({
            name: item.name,
            category: item.category,
            latitude: item.lat,
            longitude: item.lng,
            source: "canonical" as const,
            placeId: item.id,
          }))
        : result?.source === "local"
          ? result.localResults.map(({ item }) => ({
              name: item.name,
              category: item.category,
              latitude: item.latitude,
              longitude: item.longitude,
              ...(item.area ? { area: item.area } : {}),
              source: "local" as const,
            }))
          : result?.source === "mapbox"
            ? result.externalResults.map((item) => ({
                name: item.name,
                category: item.category,
                latitude: item.lat,
                longitude: item.lon,
                ...(item.placeFormatted || item.fullAddress
                  ? { area: item.placeFormatted || item.fullAddress }
                  : {}),
                source: "mapbox" as const,
              }))
            : [];

    const exploreCommand = Object.freeze({
      type: "show_search_results" as const,
      query,
      status: providerUnavailable
        ? ("error" as const)
        : exploreResults.length === 0
          ? ("empty" as const)
          : ("ready" as const),
      ...(providerUnavailable
        ? { statusText: providerUnavailableCopy(language) }
        : {}),
      results: Object.freeze(exploreResults),
    });

    if (items.length === 0) {
      return {
        text: providerUnavailable
          ? providerUnavailableCopy(language)
          : copy.empty,
        metadata: {
          domain: "search",
          state: providerUnavailable ? "provider_unavailable" : "empty",
          query,
          language,
          deterministic: true,
          exploreCommands: [exploreCommand],
        },
      };
    }

    const rows = createSearchPresentationRows(items);
    const lines = rows.map(
      (row) => `${row.index}. ${row.icon} ${row.name}${row.description}`,
    );
    return {
      text: [copy.resultsHeading(query), ...lines, copy.selectPrompt].join(
        "\n",
      ),
      options: items.map((item) => ({
        label: formatSearchResultText(item),
        value: detailsSelectionValue(item.name, language),
      })),
      metadata: {
        domain: "search",
        state: "resolved",
        source:
          canonicalResults.length > 0
            ? "canonical"
            : (result?.source ?? "none"),
        query,
        language,
        count: items.length,
        results: items.map((item) => ({ ...item })),
        deterministic: true,
        exploreCommands: [exploreCommand],
      },
    };
  };
}
