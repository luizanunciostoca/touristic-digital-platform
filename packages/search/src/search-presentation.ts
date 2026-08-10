export type SearchPresentationLocale = "pt" | "en" | "es" | "he";

export interface SearchPresentationItem {
  readonly name: string;
  readonly category: string;
  readonly placeFormatted?: string;
}

export interface SearchPresentationRow {
  readonly index: number;
  readonly icon: string;
  readonly name: string;
  readonly description: string;
}

export interface SearchPresentationCopy {
  readonly loading: string;
  readonly empty: string;
  readonly error: string;
  readonly resultsHeading: (query: string) => string;
  readonly selectPrompt: string;
}

const CATEGORY_ICONS: Readonly<Record<string, string>> = Object.freeze({
  restaurants: "🍽️",
  hotels: "🏨",
  shops: "🛍️",
  nightlife: "🌙",
  emergencies: "🚨",
  attractions: "📍",
  places: "🏙️",
  addresses: "📬",
  beaches: "🏖️",
  tours: "🗺️",
});

const COPY: Readonly<Record<SearchPresentationLocale, SearchPresentationCopy>> =
  Object.freeze({
    pt: Object.freeze({
      loading: "Pensando...",
      empty: "Não encontrei informações sobre isso. Pode tentar de outra forma?",
      error:
        "Desculpe, ocorreu um erro ao processar sua solicitação. Tente novamente.",
      resultsHeading: (query: string) =>
        `Encontrei estes resultados para "${query}":`,
      selectPrompt: "Selecione um local para ver no mapa:",
    }),
    en: Object.freeze({
      loading: "Thinking...",
      empty: "I couldn't find information about that. Could you try another way?",
      error:
        "Sorry, an error occurred while processing your request. Please try again.",
      resultsHeading: (query: string) => `Found these results for "${query}":`,
      selectPrompt: "Select a place to view on the map:",
    }),
    es: Object.freeze({
      loading: "Pensando...",
      empty:
        "No encontré información sobre eso. ¿Puedes intentarlo de otra forma?",
      error:
        "Lo siento, ocurrió un error al procesar tu solicitud. Por favor, inténtalo de nuevo.",
      resultsHeading: (query: string) =>
        `Encontré estos resultados para "${query}":`,
      selectPrompt: "Selecciona un lugar para ver en el mapa:",
    }),
    he: Object.freeze({
      loading: "חושב...",
      empty: "לא מצאתי מידע על זה. האם תוכל לנסות בצורה אחרת?",
      error: "מצטער, אירעה שגיאה בעיבוד בקשתך. אנא נסה שוב.",
      resultsHeading: (query: string) => `מצאתי תוצאות אלה עבור "${query}":`,
      selectPrompt: "בחר מקום לצפייה במפה:",
    }),
  });

export function resolveSearchPresentationLocale(
  locale: string | undefined,
): SearchPresentationLocale {
  const normalized = locale?.toLowerCase().split("-")[0];
  if (normalized === "en" || normalized === "es" || normalized === "he") {
    return normalized;
  }
  return "pt";
}

export function getSearchCategoryIcon(category: string): string {
  return CATEGORY_ICONS[category] ?? "📍";
}

export function formatSearchResultText(result: SearchPresentationItem): string {
  return result.placeFormatted
    ? `${result.name} — ${result.placeFormatted}`
    : result.name;
}

export function createSearchPresentationRows(
  results: readonly SearchPresentationItem[],
): readonly SearchPresentationRow[] {
  return Object.freeze(
    results.map((result, index) =>
      Object.freeze({
        index: index + 1,
        icon: getSearchCategoryIcon(result.category),
        name: result.name,
        description: result.placeFormatted
          ? ` — ${result.placeFormatted}`
          : "",
      }),
    ),
  );
}

export function getSearchPresentationCopy(
  locale?: string,
): SearchPresentationCopy {
  return COPY[resolveSearchPresentationLocale(locale)];
}
