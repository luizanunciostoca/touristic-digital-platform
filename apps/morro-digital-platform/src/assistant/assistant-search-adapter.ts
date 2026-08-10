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
  morroV1SearchCatalog,
  type MapboxSearchResult,
  type MorroV1SearchCatalogItem,
  type SearchPresentationItem,
} from "@touristic/search";

export interface AssistantSearchAdapterOptions {
  readonly fetch?: typeof globalThis.fetch;
  readonly mapboxAccessToken?: string;
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

export function createAssistantSearchHandler(
  options: AssistantSearchAdapterOptions = {},
): AssistantDialogIntentHandler {
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  const token = options.mapboxAccessToken?.trim();
  const externalProvider = token
    ? createMapboxSearchProvider({ token, fetch: fetchImplementation })
    : undefined;
  const application = createSearchApplication({
    catalog: morroV1SearchCatalog,
    ...(externalProvider ? { externalProvider } : {}),
  });

  return async (request): Promise<AssistantDialogResponse> => {
    const query = request.intent.entities.searchQuery ?? request.input;
    const language = request.intent.entities.language ?? "pt";
    const copy = getSearchPresentationCopy(language);
    const result = await application.search(query, { language });

    const items: readonly SearchPresentationItem[] =
      result.source === "local"
        ? result.localResults.map(({ item }) => localPresentationItem(item))
        : result.source === "mapbox"
          ? result.externalResults.map(externalPresentationItem)
          : [];

    if (items.length === 0) {
      return {
        text: copy.empty,
        metadata: { domain: "search", state: "empty", query, language },
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
        value: `mais informações sobre ${item.name}`,
      })),
      metadata: {
        domain: "search",
        state: "resolved",
        source: result.source,
        query,
        language,
        count: items.length,
        results: items.map((item) => ({ ...item })),
      },
    };
  };
}
