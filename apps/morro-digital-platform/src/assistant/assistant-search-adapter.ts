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
  const mapboxProvider = token
    ? createMapboxSearchProvider({ token, fetch: fetchImplementation })
    : undefined;
  let externalProviderFailed = false;
  const externalProvider = mapboxProvider
    ? {
        async search(
          query: string,
          searchOptions?: MapboxSearchOptions,
        ) {
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
    const result = await application.search(query, { language });
    const providerUnavailable =
      result.source === "none" &&
      isLikelyV1PlaceQuery(query) &&
      (!externalProvider || externalProviderFailed);

    const items: readonly SearchPresentationItem[] =
      result.source === "local"
        ? result.localResults.map(({ item }) => localPresentationItem(item))
        : result.source === "mapbox"
          ? result.externalResults.map(externalPresentationItem)
          : [];

    const exploreResults =
      result.source === "local"
        ? result.localResults.map(({ item }) => ({
            name: item.name,
            category: item.category,
            latitude: item.latitude,
            longitude: item.longitude,
            ...(item.area ? { area: item.area } : {}),
            source: "local" as const,
          }))
        : result.source === "mapbox"
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
        source: result.source,
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
