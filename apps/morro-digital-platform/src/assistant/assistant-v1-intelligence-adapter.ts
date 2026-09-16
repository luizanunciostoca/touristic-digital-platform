import {
  createAssistantUserProfileManager,
  getAssistantMainMenu,
  getAssistantSmartRecommendation,
  type AssistantDialogIntentHandler,
  type AssistantDialogIntentHandlerContext,
  type AssistantDialogResponse,
  type AssistantLocale,
} from "@touristic/assistant";
import {
  morroV1SearchCatalog,
  normalizeSearchText,
  type MorroV1SearchCatalogItem,
} from "@touristic/search";

type AssistantProfileManager = ReturnType<
  typeof createAssistantUserProfileManager
>;

export interface AssistantV1IntelligenceAdapterOptions {
  readonly profile: Pick<
    AssistantProfileManager,
    "getUserProfile" | "getRecentPlaces"
  >;
  readonly now?: () => number;
}

const CATEGORY_LABELS: Readonly<Record<string, string>> = Object.freeze({
  beaches: "praias",
  restaurants: "restaurantes",
  hotels: "pousadas",
  shops: "lojas",
  attractions: "atrações",
  nightlife: "vida noturna",
  tours: "passeios",
  emergencies: "emergências",
  transport: "transporte",
});

function languageFor(
  request: AssistantDialogIntentHandlerContext,
): AssistantLocale {
  return request.intent.entities.language ?? "pt";
}

function localizedCategoryLabel(category: string, locale: AssistantLocale): string {
  const menuItem = getAssistantMainMenu(locale).find(
    (item) => item.value === category,
  );
  return menuItem?.label ?? CATEGORY_LABELS[category] ?? category;
}

function searchableText(place: MorroV1SearchCatalogItem): string {
  return normalizeSearchText(
    [
      place.name,
      place.category,
      place.area ?? "",
      ...(place.aliases ?? []),
      ...(place.tags ?? []),
    ].join(" "),
  );
}

function scorePlace(
  place: MorroV1SearchCatalogItem,
  request: AssistantDialogIntentHandlerContext,
): number {
  const haystack = searchableText(place);
  const query = normalizeSearchText(request.input);
  const entities = request.intent.entities;
  const modifiers = request.intent.modifiers;
  let score = 0;

  if (entities.area === "praia" && /praia|beira mar|frente ao mar/.test(haystack)) {
    score += 5;
  }
  if (entities.area === "vila" && /vila|centro/.test(haystack)) score += 5;
  if (
    entities.priceQualifier === "cheap" &&
    /econom|barat|acessiv|budget|em conta|popular/.test(haystack)
  ) {
    score += 6;
  }
  if (
    entities.priceQualifier === "expensive" &&
    /lux|premium|sofistic|exclusiv|confort/.test(haystack)
  ) {
    score += 6;
  }
  if (entities.mealType === "breakfast" && /cafe|breakfast|manha/.test(haystack)) {
    score += 5;
  }
  if (entities.mealType === "lunch" && /almoco|lunch|refeicao|prato/.test(haystack)) {
    score += 5;
  }
  if (
    entities.mealType === "dinner" &&
    /jantar|dinner|romant|sunset|drinks/.test(haystack)
  ) {
    score += 5;
  }
  if (entities.timeQualifier === "night" && /noite|night|bar|balada|drinks|sunset/.test(haystack)) {
    score += 4;
  }
  if (entities.distanceQualifier === "near" && /vila|centro|primeira|segunda praia/.test(haystack)) {
    score += 2;
  }

  if (/romant|casal|honeymoon|lua de mel/.test(query) && /romant|sunset|vista|especial/.test(haystack)) {
    score += 5;
  }
  if (/famil|crianc|kids|children/.test(query) && /famil|calma|tranquil|segura/.test(haystack)) {
    score += 5;
  }
  if (/aventur|trilha|mergulho|snorkel|caiaque/.test(query) && /aventur|trilha|mergulho|snorkel|caiaque/.test(haystack)) {
    score += 5;
  }
  if (/por do sol|sunset/.test(query) && /sunset|por do sol|vista/.test(haystack)) {
    score += 5;
  }

  if (modifiers.includes("cheap") && /econom|barat|acessiv|budget|em conta|popular/.test(haystack)) score += 7;
  if (modifiers.includes("luxury") && /lux|premium|sofistic|exclusiv|confort|requint/.test(haystack)) score += 7;
  if (modifiers.includes("nearby") && /vila|centro|primeira|segunda praia|principal/.test(haystack)) score += 5;
  if (modifiers.includes("romantic") && /romant|sunset|vista|especial|casal|lua de mel/.test(haystack)) score += 8;
  if (modifiers.includes("family") && /famil|calma|tranquil|segura|crianca|kids/.test(haystack)) score += 8;
  if (modifiers.includes("beachside") && /praia|beira mar|frente ao mar|orla/.test(haystack)) score += 7;
  if (modifiers.includes("village_center") && /vila|centro|principal|rua/.test(haystack)) score += 6;
  if (modifiers.includes("vegetarian") && /vegetar|vegano|natural|saudavel|organico/.test(haystack)) score += 9;
  if (modifiers.includes("scenic_view") && /vista|panoram|sunset|por do sol|mirante|farol/.test(haystack)) score += 7;
  if (modifiers.includes("open_now") && /24h|aberto|sempre|noite/.test(haystack)) score += 4;
  if (modifiers.includes("cheap") && /lux|premium|exclusiv|sofistic/.test(haystack)) score -= 5;
  if (modifiers.includes("luxury") && /econom|barat|acessiv|popular/.test(haystack)) score -= 5;

  return score;
}

function rankedPlaces(
  category: string,
  request: AssistantDialogIntentHandlerContext,
): readonly MorroV1SearchCatalogItem[] {
  return morroV1SearchCatalog
    .filter((place) => place.category === category)
    .map((place, index) => ({
      place,
      index,
      score: scorePlace(place, request),
    }))
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.index - right.index ||
        left.place.name.localeCompare(right.place.name),
    )
    .map(({ place }) => place);
}

function inferCategory(
  request: AssistantDialogIntentHandlerContext,
): string | null {
  return request.intent.entities.category ?? request.context.lastCategory ?? null;
}

function recommendationCopy(
  locale: AssistantLocale,
  categoryLabel: string,
  places: readonly MorroV1SearchCatalogItem[],
): string {
  const names = places.map((place, index) => `${index + 1}. ${place.name}`).join("\n");
  const copy = {
    pt: `Com base no que você pediu, estas são as sugestões de ${categoryLabel} com melhor correspondência nos dados disponíveis:\n\n${names}\n\nEscolha um local para continuar.`,
    en: `Based on your request, these ${categoryLabel} options are the closest matches in the available data:\n\n${names}\n\nChoose a place to continue.`,
    es: `Según tu pedido, estas opciones de ${categoryLabel} son las que mejor coinciden con los datos disponibles:\n\n${names}\n\nElige un lugar para continuar.`,
    he: `לפי הבקשה שלך, אלו אפשרויות ${categoryLabel} שמתאימות בצורה הטובה ביותר לנתונים הזמינים:\n\n${names}\n\nבחר מקום כדי להמשיך.`,
  } as const;
  return copy[locale];
}

function catalogRecommendation(
  request: AssistantDialogIntentHandlerContext,
): AssistantDialogResponse | null {
  const category = inferCategory(request);
  if (!category) return null;
  const topPlaces = rankedPlaces(category, request).slice(0, 3);
  if (topPlaces.length === 0) return null;
  const locale = languageFor(request);
  return {
    text: recommendationCopy(
      locale,
      localizedCategoryLabel(category, locale),
      topPlaces,
    ),
    options: [
      ...topPlaces.map((place) => ({ label: place.name, value: place.name })),
      { label: locale === "en" ? "Show all" : locale === "es" ? "Ver todos" : locale === "he" ? "הצג הכל" : "Ver todos", value: "ver todos" },
    ],
    metadata: {
      domain: "recommendation",
      state: "resolved",
      category,
      recommendedPlaces: topPlaces.map((place) => place.name),
      action: `show_category:${category}`,
      deterministic: true,
    },
  };
}

function findCatalogPlace(query: string): MorroV1SearchCatalogItem | null {
  const normalized = normalizeSearchText(query);
  return (
    morroV1SearchCatalog.find((place) => {
      if (normalizeSearchText(place.name) === normalized) return true;
      return (place.aliases ?? []).some(
        (alias) => normalizeSearchText(alias) === normalized,
      );
    }) ?? null
  );
}

function comparisonCandidates(
  request: AssistantDialogIntentHandlerContext,
): readonly MorroV1SearchCatalogItem[] {
  const normalizedInput = normalizeSearchText(request.input);
  const found: MorroV1SearchCatalogItem[] = [];
  const seen = new Set<string>();

  for (const place of morroV1SearchCatalog) {
    const candidates = [place.name, ...(place.aliases ?? [])]
      .map(normalizeSearchText)
      .filter(Boolean);
    if (!candidates.some((candidate) => normalizedInput.includes(candidate))) {
      continue;
    }
    if (seen.has(place.name)) continue;
    found.push(place);
    seen.add(place.name);
  }

  if (found.length === 1 && request.context.lastPlace) {
    const contextual = findCatalogPlace(request.context.lastPlace);
    if (contextual && !seen.has(contextual.name)) found.unshift(contextual);
  }

  return found.slice(0, 2);
}

function factualPlaceSummary(
  place: MorroV1SearchCatalogItem,
  locale: AssistantLocale,
): string {
  const category = localizedCategoryLabel(place.category, locale);
  const facts = [category];
  if (place.area) facts.push(place.area);
  if (place.tags?.length) facts.push(place.tags.slice(0, 4).join(", "));
  return facts.join(" · ");
}

function comparisonPrompt(locale: AssistantLocale): string {
  return {
    pt: "Posso comparar dois lugares, mas preciso dos dois nomes. Exemplo: Segunda Praia ou Toca do Morcego?",
    en: "I can compare two places, but I need both names. Example: Second Beach or Toca do Morcego?",
    es: "Puedo comparar dos lugares, pero necesito ambos nombres. Ejemplo: ¿Segunda Playa o Toca do Morcego?",
    he: "אני יכול להשוות בין שני מקומות, אבל צריך את שני השמות. למשל: Second Beach או Toca do Morcego?",
  }[locale];
}

function comparisonResponse(
  request: AssistantDialogIntentHandlerContext,
): AssistantDialogResponse {
  const locale = languageFor(request);
  const candidates = comparisonCandidates(request);
  if (candidates.length < 2) {
    return {
      text: comparisonPrompt(locale),
      metadata: { domain: "compare", state: "awaiting_places" },
    };
  }

  const [first, second] = candidates;
  const firstFacts = factualPlaceSummary(first, locale);
  const secondFacts = factualPlaceSummary(second, locale);
  const text = {
    pt: `${first.name}: ${firstFacts}.\n\n${second.name}: ${secondFacts}.\n\nEsses são os fatos disponíveis no catálogo; escolha um deles para abrir detalhes ou navegar.`,
    en: `${first.name}: ${firstFacts}.\n\n${second.name}: ${secondFacts}.\n\nThese are the facts available in the catalog; choose one to open details or navigate.`,
    es: `${first.name}: ${firstFacts}.\n\n${second.name}: ${secondFacts}.\n\nEstos son los datos disponibles en el catálogo; elige uno para abrir detalles o navegar.`,
    he: `${first.name}: ${firstFacts}.\n\n${second.name}: ${secondFacts}.\n\nאלה העובדות הזמינות בקטלוג; בחר מקום כדי לפתוח פרטים או לנווט.`,
  }[locale];

  return {
    text,
    options: candidates.map((place) => ({ label: place.name, value: place.name })),
    metadata: {
      domain: "compare",
      state: "resolved",
      places: candidates.map((place) => place.name),
      ...(first.category === second.category
        ? { action: `show_category:${first.category}` }
        : {}),
      deterministic: true,
    },
  };
}

function smartRecommendation(
  request: AssistantDialogIntentHandlerContext,
  options: AssistantV1IntelligenceAdapterOptions,
): AssistantDialogResponse {
  const profile = options.profile.getUserProfile();
  const recentPlaces = options.profile.getRecentPlaces(5);
  const now = options.now?.() ?? Date.now();
  const result = getAssistantSmartRecommendation({
    locale: languageFor(request),
    hour: new Date(now).getHours(),
    profile,
    recentPlaces,
  });
  return {
    text: result.text,
    options: [...result.options],
    metadata: {
      domain: "recommendation",
      state: "contextual",
      recommendations: [...result.recommendations],
      deterministic: true,
    },
  };
}

export function createAssistantV1IntelligenceHandlers(
  options: AssistantV1IntelligenceAdapterOptions,
): Partial<Record<string, AssistantDialogIntentHandler>> {
  return {
    recommendation: (request) =>
      catalogRecommendation(request) ?? smartRecommendation(request, options),
    category_filtered: (request) =>
      catalogRecommendation(request) ?? smartRecommendation(request, options),
    compare: (request) => comparisonResponse(request),
  };
}
