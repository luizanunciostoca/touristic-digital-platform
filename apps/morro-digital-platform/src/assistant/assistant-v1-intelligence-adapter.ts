import {
  createAssistantProactiveSuggestionEngine,
  createAssistantUserProfileManager,
  getAssistantContextualMenu,
  getAssistantMainMenu,
  getAssistantSmartRecommendation,
  type AssistantDialogIntentHandler,
  type AssistantDialogIntentHandlerContext,
  type AssistantDialogResponse,
  type AssistantLocale,
  type AssistantProactiveWeather,
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
    "getUserProfile" | "getRecentPlaces" | "getTopInterests"
  >;
  readonly now?: () => number;
  readonly getWeather?: () => Promise<AssistantProactiveWeather | null>;
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

function localizedCategoryLabel(
  category: string,
  locale: AssistantLocale,
): string {
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

  if (
    entities.area === "praia" &&
    /praia|beira mar|frente ao mar/.test(haystack)
  ) {
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
  if (
    entities.mealType === "breakfast" &&
    /cafe|breakfast|manha/.test(haystack)
  ) {
    score += 5;
  }
  if (
    entities.mealType === "lunch" &&
    /almoco|lunch|refeicao|prato/.test(haystack)
  ) {
    score += 5;
  }
  if (
    entities.mealType === "dinner" &&
    /jantar|dinner|romant|sunset|drinks/.test(haystack)
  ) {
    score += 5;
  }
  if (
    entities.timeQualifier === "night" &&
    /noite|night|bar|balada|drinks|sunset/.test(haystack)
  ) {
    score += 4;
  }
  if (
    entities.distanceQualifier === "near" &&
    /vila|centro|primeira|segunda praia/.test(haystack)
  ) {
    score += 2;
  }

  if (
    /romant|casal|honeymoon|lua de mel/.test(query) &&
    /romant|sunset|vista|especial/.test(haystack)
  ) {
    score += 5;
  }
  if (
    /famil|crianc|kids|children/.test(query) &&
    /famil|calma|tranquil|segura/.test(haystack)
  ) {
    score += 5;
  }
  if (
    /aventur|trilha|mergulho|snorkel|caiaque/.test(query) &&
    /aventur|trilha|mergulho|snorkel|caiaque/.test(haystack)
  ) {
    score += 5;
  }
  if (
    /por do sol|sunset/.test(query) &&
    /sunset|por do sol|vista/.test(haystack)
  ) {
    score += 5;
  }

  if (
    modifiers.includes("cheap") &&
    /econom|barat|acessiv|budget|em conta|popular/.test(haystack)
  )
    score += 7;
  if (
    modifiers.includes("luxury") &&
    /lux|premium|sofistic|exclusiv|confort|requint/.test(haystack)
  )
    score += 7;
  if (
    modifiers.includes("nearby") &&
    /vila|centro|primeira|segunda praia|principal/.test(haystack)
  )
    score += 5;
  if (
    modifiers.includes("romantic") &&
    /romant|sunset|vista|especial|casal|lua de mel/.test(haystack)
  )
    score += 8;
  if (
    modifiers.includes("family") &&
    /famil|calma|tranquil|segura|crianca|kids/.test(haystack)
  )
    score += 8;
  if (
    modifiers.includes("beachside") &&
    /praia|beira mar|frente ao mar|orla/.test(haystack)
  )
    score += 7;
  if (
    modifiers.includes("village_center") &&
    /vila|centro|principal|rua/.test(haystack)
  )
    score += 6;
  if (
    modifiers.includes("vegetarian") &&
    /vegetar|vegano|natural|saudavel|organico/.test(haystack)
  )
    score += 9;
  if (
    modifiers.includes("scenic_view") &&
    /vista|panoram|sunset|por do sol|mirante|farol/.test(haystack)
  )
    score += 7;
  if (
    modifiers.includes("open_now") &&
    /24h|aberto|sempre|noite/.test(haystack)
  )
    score += 4;
  if (
    modifiers.includes("cheap") &&
    /lux|premium|exclusiv|sofistic/.test(haystack)
  )
    score -= 5;
  if (
    modifiers.includes("luxury") &&
    /econom|barat|acessiv|popular/.test(haystack)
  )
    score -= 5;

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
  return (
    request.intent.entities.category ?? request.context.lastCategory ?? null
  );
}

const CATEGORY_BY_INTENT: Readonly<Record<string, string>> = Object.freeze({
  category_beaches: "beaches",
  category_restaurants: "restaurants",
  category_hotels: "hotels",
  category_shops: "shops",
  category_attractions: "attractions",
  category_nightlife: "nightlife",
  category_tours: "tours",
  category_emergencies: "emergencies",
});

async function resolveWeather(
  options: AssistantV1IntelligenceAdapterOptions,
): Promise<AssistantProactiveWeather | null> {
  if (!options.getWeather) return null;
  try {
    return await options.getWeather();
  } catch {
    return null;
  }
}

function filterKeywordForRequest(
  request: AssistantDialogIntentHandlerContext,
): string | null {
  const modifiers = request.intent.modifiers;
  if (modifiers.includes("vegetarian")) return "vegetariano";
  if (modifiers.includes("beachside")) return "na praia";
  if (modifiers.includes("village_center")) return "na vila";
  if (modifiers.includes("cheap")) return "economico";
  if (modifiers.includes("luxury")) return "luxo";
  if (modifiers.includes("romantic")) return "romantico";
  if (modifiers.includes("family")) return "familiar";
  if (modifiers.includes("scenic_view")) return "vista";

  const entities = request.intent.entities;
  if (entities.area === "praia") return "na praia";
  if (entities.area === "vila") return "na vila";
  if (entities.priceQualifier === "cheap") return "economico";
  if (entities.priceQualifier === "expensive") return "luxo";
  if (entities.mealType === "breakfast") return "cafe";
  if (entities.mealType === "dinner") return "jantar";
  if (entities.timeQualifier === "night") return "bar";
  if (entities.distanceQualifier === "near") return "proximo";

  const normalized = normalizeSearchText(request.input);
  const candidates = [
    "pizza",
    "frutos do mar",
    "vegetariano",
    "bar",
    "surf",
    "mergulho",
    "por do sol",
    "familiar",
    "estrutura",
    "frente a praia",
    "luxo",
    "economico",
    "artesanato",
    "farmacia",
    "historico",
    "vida noturna",
    "musica ao vivo",
    "balada",
    "sunset",
    "barco",
    "aventura",
    "hospital",
  ];
  return candidates.find((candidate) => normalized.includes(candidate)) ?? null;
}

function categoryResponse(
  request: AssistantDialogIntentHandlerContext,
  category: string,
): AssistantDialogResponse {
  const locale = languageFor(request);
  const label = localizedCategoryLabel(category, locale);
  const count = morroV1SearchCatalog.filter(
    (place) => place.category === category,
  ).length;
  const text = {
    pt: `${label}: encontrei ${count} locais. Como você quer filtrar?`,
    en: `${label}: I found ${count} places. How would you like to filter them?`,
    es: `${label}: encontré ${count} lugares. ¿Cómo quieres filtrarlos?`,
    he: `${label}: מצאתי ${count} מקומות. איך תרצה לסנן אותם?`,
  }[locale];
  return {
    text,
    metadata: {
      domain: "category",
      state: "resolved",
      category,
      action: `show_category:${category}`,
      deterministic: true,
    },
  };
}

function categoryFilteredResponse(
  request: AssistantDialogIntentHandlerContext,
): AssistantDialogResponse | null {
  const category = inferCategory(request);
  if (!category) return null;
  const response = catalogRecommendation(request);
  if (!response) return categoryResponse(request, category);
  const filter = filterKeywordForRequest(request);
  if (!filter) return response;
  return {
    ...response,
    metadata: {
      ...(response.metadata ?? {}),
      domain: "category_filtered",
      filter,
      deterministic: true,
      exploreCommands: [
        { type: "open_category", category },
        filter === "proximo"
          ? { type: "show_nearby" }
          : { type: "apply_option", value: filter },
      ],
    },
  };
}

function transportResponse(
  request: AssistantDialogIntentHandlerContext,
): AssistantDialogResponse {
  const locale = languageFor(request);
  const directCategory =
    /^(transporte|transportes|transport|transporte na ilha|transfer|transfers)$/iu.test(
      request.input.trim(),
    );
  if (directCategory) return categoryResponse(request, "transport");
  const copy = {
    pt: "Para chegar a Morro de São Paulo, o caminho mais comum é via Salvador de catamarã ou via Valença com lancha/ferry. Já na ilha, os deslocamentos costumam ser a pé, de barco, buggy ou transporte local autorizado. Posso orientar como chegar, deslocamento na ilha ou um roteiro inicial.",
    en: "To reach Morro de São Paulo, the most common routes are catamaran from Salvador or boat/ferry via Valença. Once on the island, people usually get around on foot, by boat, buggy or local authorized transport. I can guide you on how to get there, island transport or a starter itinerary.",
    es: "Para llegar a Morro de São Paulo, lo más común es ir en catamarán desde Salvador o vía Valença con lancha/ferry. Ya en la isla, los desplazamientos suelen ser a pie, en barco, buggy o transporte local autorizado. Puedo orientarte sobre cómo llegar, moverte por la isla o un itinerario inicial.",
    he: "כדי להגיע למורו דה סאו פאולו, האפשרויות הנפוצות הן קטמרן מסלבדור או דרך ולנסה עם סירה/מעבורת. בתוך האי מתניידים בדרך כלל ברגל, בסירה, בבאגי או בתחבורה מקומית מורשית. אוכל לעזור עם ההגעה, התחבורה באי או מסלול התחלתי.",
  } as const;
  const optionCopy = {
    pt: ["Como chegar", "Catamarã", "Transporte na ilha", "Passeios"],
    en: ["How to get there", "Catamaran", "Island transport", "Tours"],
    es: ["Cómo llegar", "Catamarán", "Transporte en la isla", "Paseos"],
    he: ["איך להגיע", "קטמרן", "תחבורה באי", "סיורים"],
  } as const;
  return {
    text: copy[locale],
    options: optionCopy[locale].map((value) => ({ label: value, value })),
    metadata: { domain: "transport", state: "resolved", deterministic: true },
  };
}

function accessibilityResponse(
  request: AssistantDialogIntentHandlerContext,
): AssistantDialogResponse {
  const locale = languageFor(request);
  const normalized = normalizeSearchText(request.input);
  const emphasis = /cadeir|wheelchair/u.test(normalized)
    ? "wheelchair"
    : /crianc|bebe|family|kids/u.test(normalized)
      ? "family"
      : "mobility";
  const text = {
    pt: "Posso orientar com foco em acessibilidade. Em Morro, o acesso varia conforme terreno, ladeiras, areia e estabelecimento. O ideal é filtrar locais adequados, confirmar o acesso e evitar trechos difíceis antes da rota.",
    en: "I can guide you with accessibility in mind. In Morro, access varies with terrain, slopes, sand and the venue. The safest approach is to filter suitable places, confirm access and avoid difficult stretches before routing.",
    es: "Puedo orientarte con foco en accesibilidad. En Morro, el acceso varía según el terreno, las pendientes, la arena y el establecimiento. Lo ideal es filtrar lugares adecuados, confirmar el acceso y evitar tramos difíciles antes de crear la ruta.",
    he: "אני יכול לעזור תוך התמקדות בנגישות. במורו רמת הגישה משתנה לפי השטח, העליות, החול וסוג המקום. מומלץ לסנן מקומות מתאימים, לאשר גישה ולהימנע מקטעים קשים לפני יצירת מסלול.",
  } as const;
  const menus = getAssistantMainMenu(locale);
  const values = ["restaurants", "beaches", "hotels"];
  const options: { label: string; value: string }[] = values.flatMap(
    (value) => {
      const item = menus.find((candidate) => candidate.value === value);
      return item ? [{ label: item.label, value: item.label }] : [];
    },
  );
  options.push({
    label:
      locale === "en"
        ? "Nearby"
        : locale === "es"
          ? "Cerca de mí"
          : locale === "he"
            ? "קרוב אליי"
            : "Próximos a mim",
    value:
      locale === "en"
        ? "Nearby"
        : locale === "es"
          ? "Cerca de mí"
          : locale === "he"
            ? "קרוב אליי"
            : "Próximos a mim",
  });
  return {
    text: text[locale],
    options,
    metadata: {
      domain: "accessibility",
      state: "resolved",
      emphasis,
      deterministic: true,
    },
  };
}

async function practicalTipsResponse(
  request: AssistantDialogIntentHandlerContext,
  options: AssistantV1IntelligenceAdapterOptions,
): Promise<AssistantDialogResponse> {
  const locale = languageFor(request);
  const profile = options.profile.getUserProfile();
  const now = options.now?.() ?? Date.now();
  const hour = new Date(now).getHours();
  const weather = await resolveWeather(options);
  const tips: Record<AssistantLocale, string[]> = {
    pt: [],
    en: [],
    es: [],
    he: [],
  };
  if ((weather?.precipprob ?? 0) >= 50) {
    tips.pt.push(
      "☔ Leve capa ou guarda-chuva porque há chance relevante de chuva.",
    );
    tips.en.push(
      "☔ Bring a light rain layer or umbrella because rain is likely.",
    );
    tips.es.push(
      "☔ Lleva una capa ligera o paraguas porque hay buena probabilidad de lluvia.",
    );
    tips.he.push("☔ קח שכמייה קלה או מטרייה כי יש סיכוי משמעותי לגשם.");
  }
  if ((weather?.temp ?? 0) >= 30) {
    tips.pt.push("☀️ Use protetor solar, água e faça pausas na sombra.");
    tips.en.push("☀️ Use sunscreen, drink water and take breaks in the shade.");
    tips.es.push("☀️ Usa protector solar, bebe agua y haz pausas a la sombra.");
    tips.he.push("☀️ השתמש בקרם הגנה, שתה מים ועשה הפסקות בצל.");
  }
  if (hour >= 17) {
    tips.pt.push(
      "🌅 Se ainda der tempo, programe o pôr do sol e depois jantar ou vida noturna.",
    );
    tips.en.push(
      "🌅 If you still have time, plan sunset first and dinner or nightlife afterwards.",
    );
    tips.es.push(
      "🌅 Si aún tienes tiempo, programa primero el atardecer y luego cena o vida nocturna.",
    );
    tips.he.push(
      "🌅 אם עדיין יש זמן, תכנן קודם שקיעה ואז ארוחת ערב או חיי לילה.",
    );
  }
  if (profile.behavior.isFamilyTrip) {
    tips.pt.push(
      "👨‍👩‍👧 Para família, priorize praias mais calmas e deslocamentos curtos.",
    );
    tips.en.push(
      "👨‍👩‍👧 For families, prioritize calmer beaches and shorter transfers.",
    );
    tips.es.push(
      "👨‍👩‍👧 Para familias, prioriza playas más tranquilas y trayectos cortos.",
    );
    tips.he.push("👨‍👩‍👧 למשפחות כדאי להעדיף חופים רגועים ומעברים קצרים.");
  }
  if (profile.behavior.isAdventurer) {
    tips.pt.push(
      "🤿 Para aventura, confirme maré e condições antes de mergulho ou trilha.",
    );
    tips.en.push(
      "🤿 For adventure plans, check tide and conditions before diving or hiking.",
    );
    tips.es.push(
      "🤿 Para aventura, confirma la marea y las condiciones antes de bucear o hacer senderismo.",
    );
    tips.he.push("🤿 לתכניות הרפתקה, בדוק גאות ותנאים לפני צלילה או הליכה.");
  }
  if (profile.behavior.isFirstTimer) {
    tips.pt.push(
      "🧭 Se é sua primeira vez, comece pela vila e Segunda Praia para se orientar melhor.",
    );
    tips.en.push(
      "🧭 If this is your first time, start in the village and Second Beach to get oriented.",
    );
    tips.es.push(
      "🧭 Si es tu primera vez, empieza por la villa y Segunda Playa para orientarte mejor.",
    );
    tips.he.push(
      "🧭 אם זו הפעם הראשונה שלך, התחל בכפר ובחוף השני כדי להתמצא טוב יותר.",
    );
  }
  if (/dinheiro|cash|pix/u.test(normalizeSearchText(request.input))) {
    tips.pt.push(
      "💳 Tenha uma alternativa ao cartão, porque a disponibilidade de pagamento pode variar.",
    );
    tips.en.push(
      "💳 Keep an alternative to cards, because payment availability can vary.",
    );
    tips.es.push(
      "💳 Ten una alternativa a la tarjeta, porque la forma de pago puede variar.",
    );
    tips.he.push("💳 החזק חלופה לכרטיס, כי אפשרויות התשלום עשויות להשתנות.");
  }
  if (tips[locale].length === 0) {
    tips.pt.push(
      "🧴 Leve protetor solar e água.",
      "🗺️ Organize seus deslocamentos por região para andar menos.",
      "🌊 Consulte maré e clima antes de passeios de barco e piscinas naturais.",
    );
    tips.en.push(
      "🧴 Bring sunscreen and water.",
      "🗺️ Organize your plans by area to walk less.",
      "🌊 Check tide and weather before boat trips and natural pools.",
    );
    tips.es.push(
      "🧴 Lleva protector solar y agua.",
      "🗺️ Organiza tus planes por zona para caminar menos.",
      "🌊 Consulta la marea y el clima antes de paseos en barco y piscinas naturales.",
    );
    tips.he.push(
      "🧴 קח קרם הגנה ומים.",
      "🗺️ ארגן את התכניות לפי אזור כדי ללכת פחות.",
      "🌊 בדוק גאות ומזג אוויר לפני שיט ובריכות טבעיות.",
    );
  }
  const intro = {
    pt: "Aqui vão dicas realmente úteis para aproveitar melhor Morro de São Paulo:",
    en: "Here are practical tips to enjoy Morro de São Paulo better:",
    es: "Aquí tienes consejos realmente útiles para disfrutar mejor de Morro de São Paulo:",
    he: "הנה טיפים פרקטיים שיעזרו לך ליהנות יותר ממורו דה סאו פאולו:",
  } as const;
  return {
    text: `${intro[locale]}\n\n${tips[locale].map((tip) => `• ${tip}`).join("\n")}`,
    metadata: {
      domain: "practical_tips",
      state: "resolved",
      deterministic: true,
      weatherAware: weather !== null,
    },
  };
}

function recommendationCopy(
  locale: AssistantLocale,
  categoryLabel: string,
  places: readonly MorroV1SearchCatalogItem[],
): string {
  const names = places
    .map((place, index) => `${index + 1}. ${place.name}`)
    .join("\n");
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
      {
        label:
          locale === "en"
            ? "Show all"
            : locale === "es"
              ? "Ver todos"
              : locale === "he"
                ? "הצג הכל"
                : "Ver todos",
        value: "ver todos",
      },
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

  const first = candidates[0];
  const second = candidates[1];
  if (!first || !second) {
    return {
      text: comparisonPrompt(locale),
      metadata: { domain: "compare", state: "awaiting_places" },
    };
  }
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
    options: candidates.map((place) => ({
      label: place.name,
      value: place.name,
    })),
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

async function smartRecommendation(
  request: AssistantDialogIntentHandlerContext,
  options: AssistantV1IntelligenceAdapterOptions,
): Promise<AssistantDialogResponse> {
  const profile = options.profile.getUserProfile();
  const recentPlaces = options.profile
    .getRecentPlaces(5)
    .filter(
      (place): place is typeof place & { timestamp: number } =>
        typeof place.timestamp === "number",
    )
    .map((place) => ({
      name: place.name,
      ...(place.category !== undefined ? { category: place.category } : {}),
      timestamp: place.timestamp,
    }));
  const now = options.now?.() ?? Date.now();
  const weather = await resolveWeather(options);
  const result = getAssistantSmartRecommendation({
    locale: languageFor(request),
    hour: new Date(now).getHours(),
    profile,
    recentPlaces,
    weather,
  });
  return {
    text: result.text,
    options: result.options.map((value) => ({ label: value, value })),
    metadata: {
      domain: "recommendation",
      state: "contextual",
      recommendations: [...result.recommendations],
      deterministic: true,
      weatherAware: weather !== null,
    },
  };
}

export function createAssistantV1IntelligenceHandlers(
  options: AssistantV1IntelligenceAdapterOptions,
): Partial<Record<string, AssistantDialogIntentHandler>> {
  const proactiveEngine = createAssistantProactiveSuggestionEngine({
    ...(options.now ? { now: options.now } : {}),
  });
  const greeting: AssistantDialogIntentHandler = async (request) => {
    const now = options.now?.() ?? Date.now();
    const profile = options.profile.getUserProfile();
    const recentPlaces = options.profile
      .getRecentPlaces(5)
      .filter(
        (place): place is typeof place & { timestamp: number } =>
          typeof place.timestamp === "number",
      )
      .map((place) => ({
        name: place.name,
        ...(place.category !== undefined ? { category: place.category } : {}),
        timestamp: place.timestamp,
      }));
    const hour = new Date(now).getHours();
    const locale = languageFor(request);
    const weather = await resolveWeather(options);
    const menu = getAssistantContextualMenu({
      locale,
      hour,
      profile,
      topInterests: options.profile.getTopInterests(3),
      recentPlaces,
      weather,
    });
    const suggestion = proactiveEngine.getSuggestion({
      hour,
      profile,
      recentPlaces,
      weather,
      now,
    });
    return {
      text: menu.intro,
      options: menu.buttons.map((button) => ({
        label: button.label,
        value: button.value.startsWith("[place]")
          ? button.value.slice("[place]".length)
          : button.value,
      })),
      metadata: {
        domain: "proactive",
        state: "contextual_menu",
        suggestion: suggestion?.type ?? null,
        priority: suggestion?.priority ?? null,
        weatherAware: weather !== null,
      },
    };
  };

  const categoryHandlers = Object.fromEntries(
    Object.entries(CATEGORY_BY_INTENT).map(([intent, category]) => [
      intent,
      (request: AssistantDialogIntentHandlerContext) =>
        categoryResponse(request, category),
    ]),
  ) as Partial<Record<string, AssistantDialogIntentHandler>>;

  return {
    ...categoryHandlers,
    greeting,
    recommendation: async (request) =>
      catalogRecommendation(request) ??
      (await smartRecommendation(request, options)),
    category_filtered: (request) =>
      categoryFilteredResponse(request) ??
      smartRecommendation(request, options),
    compare: (request) => comparisonResponse(request),
    transport: (request) => transportResponse(request),
    accessibility: (request) => accessibilityResponse(request),
    practical_tips: (request) => practicalTipsResponse(request, options),
  };
}
