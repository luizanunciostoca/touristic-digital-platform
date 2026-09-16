from pathlib import Path
import re


def replace_once(path: str, old: str, new: str) -> None:
    target = Path(path)
    text = target.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one match, got {count}: {old[:160]!r}")
    target.write_text(text.replace(old, new, 1))


def replace_regex(path: str, pattern: str, replacement: str) -> None:
    target = Path(path)
    text = target.read_text()
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"{path}: expected one regex match, got {count}: {pattern[:160]!r}")
    target.write_text(updated)


adapter = "apps/morro-digital-platform/src/assistant/assistant-v1-intelligence-adapter.ts"
replace_once(
    adapter,
    '''  type AssistantDialogResponse,\n  type AssistantLocale,\n} from "@touristic/assistant";''',
    '''  type AssistantDialogResponse,\n  type AssistantLocale,\n  type AssistantProactiveWeather,\n} from "@touristic/assistant";''',
)
replace_once(
    adapter,
    '''  readonly now?: () => number;\n}''',
    '''  readonly now?: () => number;\n  readonly getWeather?: () => Promise<AssistantProactiveWeather | null>;\n}''',
)

helpers = r'''

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
  const directCategory = /^(transporte|transportes|transport|transporte na ilha|transfer|transfers)$/iu.test(
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
  const options = values.flatMap((value) => {
    const item = menus.find((candidate) => candidate.value === value);
    return item ? [{ label: item.label, value: item.label }] : [];
  });
  options.push({
    label: locale === "en" ? "Nearby" : locale === "es" ? "Cerca de mí" : locale === "he" ? "קרוב אליי" : "Próximos a mim",
    value: locale === "en" ? "Nearby" : locale === "es" ? "Cerca de mí" : locale === "he" ? "קרוב אליי" : "Próximos a mim",
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
    tips.pt.push("☔ Leve capa ou guarda-chuva porque há chance relevante de chuva.");
    tips.en.push("☔ Bring a light rain layer or umbrella because rain is likely.");
    tips.es.push("☔ Lleva una capa ligera o paraguas porque hay buena probabilidad de lluvia.");
    tips.he.push("☔ קח שכמייה קלה או מטרייה כי יש סיכוי משמעותי לגשם.");
  }
  if ((weather?.temp ?? 0) >= 30) {
    tips.pt.push("☀️ Use protetor solar, água e faça pausas na sombra.");
    tips.en.push("☀️ Use sunscreen, drink water and take breaks in the shade.");
    tips.es.push("☀️ Usa protector solar, bebe agua y haz pausas a la sombra.");
    tips.he.push("☀️ השתמש בקרם הגנה, שתה מים ועשה הפסקות בצל.");
  }
  if (hour >= 17) {
    tips.pt.push("🌅 Se ainda der tempo, programe o pôr do sol e depois jantar ou vida noturna.");
    tips.en.push("🌅 If you still have time, plan sunset first and dinner or nightlife afterwards.");
    tips.es.push("🌅 Si aún tienes tiempo, programa primero el atardecer y luego cena o vida nocturna.");
    tips.he.push("🌅 אם עדיין יש זמן, תכנן קודם שקיעה ואז ארוחת ערב או חיי לילה.");
  }
  if (profile.behavior.isFamilyTrip) {
    tips.pt.push("👨‍👩‍👧 Para família, priorize praias mais calmas e deslocamentos curtos.");
    tips.en.push("👨‍👩‍👧 For families, prioritize calmer beaches and shorter transfers.");
    tips.es.push("👨‍👩‍👧 Para familias, prioriza playas más tranquilas y trayectos cortos.");
    tips.he.push("👨‍👩‍👧 למשפחות כדאי להעדיף חופים רגועים ומעברים קצרים.");
  }
  if (profile.behavior.isAdventurer) {
    tips.pt.push("🤿 Para aventura, confirme maré e condições antes de mergulho ou trilha.");
    tips.en.push("🤿 For adventure plans, check tide and conditions before diving or hiking.");
    tips.es.push("🤿 Para aventura, confirma la marea y las condiciones antes de bucear o hacer senderismo.");
    tips.he.push("🤿 לתכניות הרפתקה, בדוק גאות ותנאים לפני צלילה או הליכה.");
  }
  if (profile.behavior.isFirstTimer) {
    tips.pt.push("🧭 Se é sua primeira vez, comece pela vila e Segunda Praia para se orientar melhor.");
    tips.en.push("🧭 If this is your first time, start in the village and Second Beach to get oriented.");
    tips.es.push("🧭 Si es tu primera vez, empieza por la villa y Segunda Playa para orientarte mejor.");
    tips.he.push("🧭 אם זו הפעם הראשונה שלך, התחל בכפר ובחוף השני כדי להתמצא טוב יותר.");
  }
  if (/dinheiro|cash|pix/u.test(normalizeSearchText(request.input))) {
    tips.pt.push("💳 Tenha uma alternativa ao cartão, porque a disponibilidade de pagamento pode variar.");
    tips.en.push("💳 Keep an alternative to cards, because payment availability can vary.");
    tips.es.push("💳 Ten una alternativa a la tarjeta, porque la forma de pago puede variar.");
    tips.he.push("💳 החזק חלופה לכרטיס, כי אפשרויות התשלום עשויות להשתנות.");
  }
  if (tips[locale].length === 0) {
    tips.pt.push("🧴 Leve protetor solar e água.", "🗺️ Organize seus deslocamentos por região para andar menos.", "🌊 Consulte maré e clima antes de passeios de barco e piscinas naturais.");
    tips.en.push("🧴 Bring sunscreen and water.", "🗺️ Organize your plans by area to walk less.", "🌊 Check tide and weather before boat trips and natural pools.");
    tips.es.push("🧴 Lleva protector solar y agua.", "🗺️ Organiza tus planes por zona para caminar menos.", "🌊 Consulta la marea y el clima antes de paseos en barco y piscinas naturales.");
    tips.he.push("🧴 קח קרם הגנה ומים.", "🗺️ ארגן את התכניות לפי אזור כדי ללכת פחות.", "🌊 בדוק גאות ומזג אוויר לפני שיט ובריכות טבעיות.");
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
'''
replace_once(
    adapter,
    '''function recommendationCopy(\n''',
    helpers + '''\nfunction recommendationCopy(\n''',
)

new_smart = r'''async function smartRecommendation(
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
'''
replace_regex(
    adapter,
    r'''function smartRecommendation\(.*?\n}\n\nexport function createAssistantV1IntelligenceHandlers''',
    new_smart + '''\nexport function createAssistantV1IntelligenceHandlers''',
)

new_factory_tail = r'''  const greeting: AssistantDialogIntentHandler = async (request) => {
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
      catalogRecommendation(request) ?? (await smartRecommendation(request, options)),
    category_filtered: (request) =>
      categoryFilteredResponse(request) ?? smartRecommendation(request, options),
    compare: (request) => comparisonResponse(request),
    transport: (request) => transportResponse(request),
    accessibility: (request) => accessibilityResponse(request),
    practical_tips: (request) => practicalTipsResponse(request, options),
  };
}'''
replace_regex(
    adapter,
    r'''  const greeting: AssistantDialogIntentHandler = \(request\) => \{.*?\n  return \{\n    greeting,.*?\n  \};\n}''',
    new_factory_tail,
)

runtime = "apps/morro-digital-platform/src/assistant/browser-assistant-runtime.ts"
replace_once(
    runtime,
    '''import type { ExploreLocationsControl } from "../map/explore-locations-control.js";''',
    '''import type {\n  ExploreLocationsCommand,\n  ExploreLocationsControl,\n} from "../map/explore-locations-control.js";''',
)
replace_once(
    runtime,
    '''import type { NavigationSessionBootstrap } from "../navigation/navigation-session-bootstrap.js";''',
    '''import type { NavigationSessionBootstrap } from "../navigation/navigation-session-bootstrap.js";\nimport { fetchMorroWeather } from "../weather/weather-widget.js";''',
)

command_reader = r'''

function readDeterministicExploreCommands(
  response: AssistantDialogResponse,
): readonly ExploreLocationsCommand[] {
  const metadata = response.metadata;
  if (
    !metadata ||
    typeof metadata !== "object" ||
    metadata.deterministic !== true ||
    metadata.fromLLM === true ||
    !Array.isArray(metadata.exploreCommands)
  ) {
    return [];
  }

  const commands: ExploreLocationsCommand[] = [];
  for (const raw of metadata.exploreCommands) {
    if (!raw || typeof raw !== "object" || !("type" in raw)) return [];
    const type = raw.type;
    if (type === "open_category" && "category" in raw && typeof raw.category === "string") {
      commands.push({ type, category: raw.category });
      continue;
    }
    if (type === "apply_option" && "value" in raw && typeof raw.value === "string") {
      commands.push({ type, value: raw.value });
      continue;
    }
    if (type === "show_all" || type === "show_nearby" || type === "back_to_filters" || type === "back_to_menu") {
      commands.push({ type });
      continue;
    }
    if (type === "select_place" && "place" in raw && typeof raw.place === "string") {
      commands.push({ type, place: raw.place });
      continue;
    }
    return [];
  }
  return Object.freeze(commands);
}
'''
replace_once(
    runtime,
    '''function appendPhotoCarousel(\n''',
    command_reader + '''\nfunction appendPhotoCarousel(\n''',
)

replace_once(
    runtime,
    '''  const intelligenceHandlers = createAssistantV1IntelligenceHandlers({\n    profile,\n  });''',
    '''  const intelligenceHandlers = createAssistantV1IntelligenceHandlers({\n    profile,\n    getWeather: async () => {\n      try {\n        const reading = await fetchMorroWeather(options.fetch ?? globalThis.fetch);\n        return {\n          temp: reading.temperatureCelsius,\n          precipprob: reading.rainChancePercent,\n          condition: String(reading.weatherCode),\n        };\n      } catch {\n        return null;\n      }\n    },\n  });''',
)

replace_regex(
    runtime,
    r'''    const runtimeAction = readRuntimeAction\(response\);\n    let actionExecuted = false;\n    if \(runtimeAction\) \{.*?\n    if \(actionExecuted && generation === requestGeneration\) \{\n      syncExploreContext\(\);\n      options\.document\.dispatchEvent\(\n        new CustomEvent\("morro:assistant-action-executed", \{\n          detail: \{ action: runtimeAction, source: "llm" \},\n        \}\),\n      \);\n    \}''',
    r'''    const runtimeAction = readRuntimeAction(response);
    const deterministicCommands = readDeterministicExploreCommands(response);
    let actionExecuted = false;
    if (deterministicCommands.length > 0 && options.explore) {
      actionExecuted = true;
      for (const command of deterministicCommands) {
        const executed = await options.explore.execute(command);
        if (destroyed || generation !== requestGeneration) {
          return supersededResponse();
        }
        if (!executed) {
          actionExecuted = false;
          break;
        }
      }
    } else if (runtimeAction) {
      if (options.explore) {
        const command = resolveAssistantRuntimeAction(runtimeAction);
        actionExecuted = command
          ? await options.explore.execute(command)
          : false;
      } else {
        actionExecuted = executeAssistantRuntimeAction(
          options.document,
          runtimeAction,
        );
      }
    }
    if (actionExecuted && generation === requestGeneration) {
      syncExploreContext();
      options.document.dispatchEvent(
        new CustomEvent("morro:assistant-action-executed", {
          detail:
            deterministicCommands.length > 0
              ? { commands: deterministicCommands, source: "deterministic" }
              : {
                  action: runtimeAction,
                  source:
                    response.metadata?.fromLLM === true
                      ? "llm"
                      : "deterministic",
                },
        }),
      );
    }''',
)

test = "apps/morro-digital-platform/src/assistant/assistant-v1-intelligence-adapter.test.ts"
insert_tests = r'''

  it("executes a filtered category through deterministic typed Explore commands", async () => {
    const profile = createAssistantUserProfileManager({ now: () => 1_000 });
    const handlers = createAssistantV1IntelligenceHandlers({ profile });
    const response = await handlers.category_filtered?.(
      request("category_filtered", "quero uma praia tranquila para crianças", {
        entities: { language: "pt", category: "beaches" },
        modifiers: ["family"],
      }),
    );

    expect(response?.metadata).toMatchObject({
      domain: "category_filtered",
      filter: "familiar",
      deterministic: true,
      exploreCommands: [
        { type: "open_category", category: "beaches" },
        { type: "apply_option", value: "familiar" },
      ],
    });
  });

  it("keeps V1 transport, accessibility and practical tips deterministic before LLM", async () => {
    const profile = createAssistantUserProfileManager({ now: () => 1_000 });
    const handlers = createAssistantV1IntelligenceHandlers({
      profile,
      now: () => new Date("2026-09-16T18:30:00-03:00").getTime(),
      getWeather: async () => ({ temp: 31, precipprob: 70, condition: "rain" }),
    });

    const transport = await handlers.transport?.(
      request("transport", "como chegar em Morro de São Paulo"),
    );
    const accessibility = await handlers.accessibility?.(
      request("accessibility", "acessível para cadeira de rodas"),
    );
    const tips = await handlers.practical_tips?.(
      request("practical_tips", "dicas para hoje"),
    );

    expect(transport?.metadata).toMatchObject({
      domain: "transport",
      deterministic: true,
    });
    expect(accessibility?.metadata).toMatchObject({
      domain: "accessibility",
      emphasis: "wheelchair",
      deterministic: true,
    });
    expect(tips?.metadata).toMatchObject({
      domain: "practical_tips",
      deterministic: true,
      weatherAware: true,
    });
    expect(tips?.text).toContain("chuva");
  });

  it("turns simple category intents into typed category actions", async () => {
    const profile = createAssistantUserProfileManager({ now: () => 1_000 });
    const handlers = createAssistantV1IntelligenceHandlers({ profile });
    const response = await handlers.category_beaches?.(
      request("category_beaches", "praias"),
    );

    expect(response?.metadata).toMatchObject({
      domain: "category",
      category: "beaches",
      action: "show_category:beaches",
      deterministic: true,
    });
  });

  it("feeds live weather into the proactive greeting when the provider is available", async () => {
    const profile = createAssistantUserProfileManager({ now: () => 1_000 });
    const handlers = createAssistantV1IntelligenceHandlers({
      profile,
      now: () => new Date("2026-09-16T14:00:00-03:00").getTime(),
      getWeather: async () => ({ temp: 27, precipprob: 85, condition: "rain" }),
    });
    const response = await handlers.greeting?.(request("greeting", "olá"));

    expect(response?.metadata).toMatchObject({
      domain: "proactive",
      weatherAware: true,
    });
    expect(response?.text.toLowerCase()).toContain("chuva");
  });
'''
replace_once(
    test,
    '''\n  it("returns a contextual proactive menu on greeting and respects the engine cooldown", async () => {''',
    insert_tests + '''\n\n  it("returns a contextual proactive menu on greeting and respects the engine cooldown", async () => {''',
)

workflow = ".github/workflows/assistant-input-menu-flow-v1-parity.yml"
replace_once(
    workflow,
    '''              await submit('praias');\n              await page.locator('#assistant-category-results[data-category="beaches"][data-stage="filters"]').waitFor({ state: 'visible' });''',
    '''              await submit('quero uma praia tranquila para crianças');\n              await page.locator('#assistant-category-results[data-category="beaches"][data-stage="places"]').waitFor({ state: 'visible', timeout: 8000 });\n              const familyState = await page.evaluate(() => ({\n                places: document.querySelectorAll('#assistant-category-results [data-location-name]').length,\n                markers: Number(document.getElementById('map')?.dataset.mapMarkerCount || 0),\n              }));\n              if (familyState.places < 1 || familyState.places >= 8 || familyState.places !== familyState.markers) {\n                throw new Error(`Compound V1 family filter did not execute semantically: ${JSON.stringify(familyState)}`);\n              }\n\n              await submit('back to main menu');\n              await page.locator('.assistant-options [data-explore-category="beaches"]').waitFor({ state: 'visible', timeout: 5000 });\n\n              await submit('praias');\n              await page.locator('#assistant-category-results[data-category="beaches"][data-stage="filters"]').waitFor({ state: 'visible' });''',
)

print("assistant V1 runtime parity patch applied")
