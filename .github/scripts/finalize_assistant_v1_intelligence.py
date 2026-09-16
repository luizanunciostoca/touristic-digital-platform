from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    target = Path(path)
    text = target.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected 1 match, got {count}: {old[:120]!r}")
    target.write_text(text.replace(old, new, 1))


intent = "packages/assistant/src/intent-engine.ts"
replace_once(
    intent,
    '  | "thanks"\n  | "category_beaches"',
    '  | "thanks"\n  | "recommendation"\n  | "compare"\n  | "category_beaches"',
)
marker = "\n];\n\nconst PLACE_NAMES = ["
patterns = r'''
  {
    intent: "recommendation",
    confidence: 0.9,
    patterns: [
      /(me recomend|recomend|sugest|o que voce indica|o que você indica|o que e bom|o que é bom|o melhor|o mais famoso|o mais popular|what do you recommend|suggest|best place|recomiend|suger|mejor lugar|ממליץ|ממליצה|ממליצים|המלצה)/i,
    ],
  },
  {
    intent: "compare",
    confidence: 0.85,
    patterns: [
      /(comparar|compare|diferenca entre|diferença entre|qual e melhor|qual é melhor|versus|vs\.?|diferencia entre|cu[aá]l es mejor|להשוות|מול)/i,
      /(?:praia|pousada|hotel|restaurante|bar|toca|farol|forte|mirante).{0,50}\bou\b.{0,50}(?:praia|pousada|hotel|restaurante|bar|toca|farol|forte|mirante)/i,
    ],
  },
  {
    intent: "category_filtered",
    confidence: 0.9,
    patterns: [
      /(barato|economico|econômico|em conta|budget|cheap).*(restaurante|pousada|hotel|comida)/i,
      /(luxo|luxury|premium|top|melhor).*(restaurante|pousada|hotel)/i,
      /(romantico|romântico|casal|couple).*(restaurante|pousada)/i,
      /(familia|família|crianca|criança|kids).*(praia|restaurante|atracao)/i,
      /(frente|beira|perto).*(praia|mar|beach).*(pousada|hotel|restaurante)/i,
      /(restaurante|comida|comer).*(praia|vila|segunda|terceira|quarta)/i,
      /(pousada|hotel).*(praia|vila|segunda|terceira|quarta)/i,
      /(praia).*(calma|tranquila|familia|crianca|snorkel|mergulho)/i,
    ],
  },'''
replace_once(intent, marker, patterns + marker)

replace_once(
    "packages/assistant/src/llm-policy.ts",
    '  "accessibility",\n  "unknown",',
    '  "accessibility",\n  "place_search",\n  "unknown",',
)
replace_once(
    "packages/assistant/src/dialog-controller.ts",
    '          if (intent.intent === "unknown") {',
    '          if (intent.intent === "unknown" || intent.intent === "place_search") {',
)
replace_once(
    "apps/morro-digital-platform/src/assistant/assistant-domain-adapter.test.ts",
    "  input = intent,\n): AssistantDialogIntentHandlerContext {",
    "  input: string = intent,\n): AssistantDialogIntentHandlerContext {",
)

router = "apps/morro-digital-platform/src/assistant/assistant-menu-command-router.ts"
router_marker = "\nfunction tryOpenCategory(document: Document, message: string): boolean {"
router_helper = r'''

const DIRECT_CATEGORY_PREFIXES = Object.freeze([
  "ver ",
  "mostrar ",
  "abrir ",
  "explorar ",
  "quero ",
  "quero ver ",
  "show ",
  "open ",
  "explore ",
  "quiero ",
  "quiero ver ",
]);

function directCategoryForMessage(message: string): string | null {
  const normalizedMessage = normalizeAssistantMenuCommand(message);
  if (!normalizedMessage) return null;
  const candidates = new Set<string>([normalizedMessage]);
  for (const prefix of DIRECT_CATEGORY_PREFIXES) {
    if (!normalizedMessage.startsWith(prefix)) continue;
    const remainder = normalizedMessage.slice(prefix.length).trim();
    if (remainder) candidates.add(remainder);
  }
  for (const [category, aliases] of Object.entries(CATEGORY_ALIASES)) {
    for (const rawAlias of aliases) {
      const alias = normalizeAssistantMenuCommand(rawAlias);
      if (alias && candidates.has(alias)) return category;
    }
  }
  return null;
}'''
replace_once(router, router_marker, router_helper + router_marker)
router_path = Path(router)
router_text = router_path.read_text()
category_site = "const category = categoryForMessage(message);"
if router_text.count(category_site) != 2:
    raise SystemExit(f"router category sites: {router_text.count(category_site)}")
router_path.write_text(
    router_text.replace(category_site, "const category = directCategoryForMessage(message);")
)

runtime = "apps/morro-digital-platform/src/assistant/browser-assistant-runtime.ts"
replace_once(
    runtime,
    '  type AssistantDialogResponse,\n} from "@touristic/assistant";',
    '  type AssistantDialogResponse,\n  type AssistantInterestCategory,\n} from "@touristic/assistant";',
)
replace_once(
    runtime,
    'import { createAssistantLlmHandler } from "./assistant-llm-adapter.js";',
    'import { createAssistantLlmHandler } from "./assistant-llm-adapter.js";\nimport { createAssistantV1IntelligenceHandlers } from "./assistant-v1-intelligence-adapter.js";',
)
awaiting = '''const CONTROLLER_OWNED_AWAITING_TYPES = new Set([
  "awaiting_place",
  "awaiting_category",
  "awaiting_destination",
]);'''
interest = awaiting + r'''

function toProfileInterestCategory(
  value: string | null,
): AssistantInterestCategory | null {
  switch (value) {
    case "beaches":
    case "restaurants":
    case "hotels":
    case "shops":
    case "attractions":
    case "nightlife":
    case "tours":
    case "emergencies":
      return value;
    default:
      return null;
  }
}'''
replace_once(runtime, awaiting, interest)
replace_once(
    runtime,
    "  const controller = createAssistantDialogController({",
    "  const intelligenceHandlers = createAssistantV1IntelligenceHandlers({ profile });\n  const controller = createAssistantDialogController({",
)
replace_once(
    runtime,
    "      ...domainHandlers,\n      ...navigationHandlers,",
    "      ...domainHandlers,\n      ...intelligenceHandlers,\n      ...navigationHandlers,",
)
replace_once(
    runtime,
    "    if (menuRouted) {\n      currentPresentation = null;",
    '''    if (menuRouted) {
      const routedState = readExploreState();
      profile.recordInteraction(
        value,
        toProfileInterestCategory(routedState.category),
      );
      if (context.getContext().awaiting?.type === "confirmar_navegacao") {
        context.updateContext({ awaiting: null, pendingRoute: null });
      }
      currentPresentation = null;''',
)

intelligence = "apps/morro-digital-platform/src/assistant/assistant-v1-intelligence-adapter.ts"
replace_once(
    intelligence,
    '''  createAssistantUserProfileManager,
  getAssistantMainMenu,
  getAssistantSmartRecommendation,''',
    '''  createAssistantProactiveSuggestionEngine,
  createAssistantUserProfileManager,
  getAssistantContextualMenu,
  getAssistantMainMenu,
  getAssistantSmartRecommendation,''',
)
replace_once(
    intelligence,
    '    "getUserProfile" | "getRecentPlaces"\n',
    '    "getUserProfile" | "getRecentPlaces" | "getTopInterests"\n',
)
replace_once(
    intelligence,
    '''  const [first, second] = candidates;
  const firstFacts = factualPlaceSummary(first, locale);
  const secondFacts = factualPlaceSummary(second, locale);''',
    '''  const first = candidates[0];
  const second = candidates[1];
  if (!first || !second) {
    return {
      text: comparisonPrompt(locale),
      metadata: { domain: "compare", state: "awaiting_places" },
    };
  }
  const firstFacts = factualPlaceSummary(first, locale);
  const secondFacts = factualPlaceSummary(second, locale);''',
)
replace_once(
    intelligence,
    '''  const recentPlaces = options.profile.getRecentPlaces(5);
  const now = options.now?.() ?? Date.now();
  const result = getAssistantSmartRecommendation({
    locale: languageFor(request),
    hour: new Date(now).getHours(),
    profile,
    recentPlaces,
  });
  return {
    text: result.text,
    options: [...result.options],''',
    '''  const recentPlaces = options.profile
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
  const result = getAssistantSmartRecommendation({
    locale: languageFor(request),
    hour: new Date(now).getHours(),
    profile,
    recentPlaces,
  });
  return {
    text: result.text,
    options: result.options.map((value) => ({ label: value, value })),''',
)
function_marker = '''export function createAssistantV1IntelligenceHandlers(
  options: AssistantV1IntelligenceAdapterOptions,
): Partial<Record<string, AssistantDialogIntentHandler>> {
  return {'''
function_replacement = r'''export function createAssistantV1IntelligenceHandlers(
  options: AssistantV1IntelligenceAdapterOptions,
): Partial<Record<string, AssistantDialogIntentHandler>> {
  const proactiveEngine = createAssistantProactiveSuggestionEngine({
    ...(options.now ? { now: options.now } : {}),
  });
  const greeting: AssistantDialogIntentHandler = (request) => {
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
    const menu = getAssistantContextualMenu({
      locale,
      hour,
      profile,
      topInterests: options.profile.getTopInterests(3),
      recentPlaces,
    });
    const suggestion = proactiveEngine.getSuggestion({
      hour,
      profile,
      recentPlaces,
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
      },
    };
  };

  return {
    greeting,'''
replace_once(intelligence, function_marker, function_replacement)

nav_install = "apps/morro-digital-platform/src/navigation/browser-navigation-runtime-install.ts"
replace_once(
    nav_install,
    "  const assistant = installAssistant({",
    "  const explore = getMorroDigitalApplication(options.document)?.exploreLocations;\n  const assistant = installAssistant({",
)
replace_once(
    nav_install,
    "    explore: getMorroDigitalApplication(options.document)?.exploreLocations,",
    "    ...(explore ? { explore } : {}),",
)

nav_test = Path("apps/morro-digital-platform/src/assistant/assistant-navigation-adapter.test.ts")
nav_text = nav_test.read_text()
start_marker = '  it("starts the real navigation boundary with normalized destination coordinates", async () => {'
end_marker = '  it("stops the navigation bootstrap for cancel_navigation", async () => {'
start = nav_text.find(start_marker)
end = nav_text.find(end_marker)
if start < 0 or end < 0 or end <= start:
    raise SystemExit("navigation adapter legacy test block not found")
replacement = '''  it("confirms before starting the real navigation boundary with normalized destination coordinates", async () => {
    const start = vi.fn(async () => ({ type: "FeatureCollection", features: [] }));
    const destination = {
      name: "Farol do Morro",
      latitude: -13.376,
      longitude: -38.913,
    };
    const handlers = createAssistantNavigationAppHandlers({
      navigation: { start, stop: vi.fn() },
      resolver: { resolveDestination: vi.fn(() => destination) },
    });
    const navigateIntent: AssistantIntentResult = {
      intent: "navigate",
      confidence: 0.95,
      entities: { place: "Farol do Morro" },
      normalized: "ir para farol do morro",
      modifiers: [],
    };

    const pending = await handlers.navigate(request(navigateIntent));
    expect(start).not.toHaveBeenCalled();
    expect(pending).toMatchObject({
      metadata: {
        navigation: "awaiting_confirmation",
        pendingRoute: destination,
      },
    });

    const context = createDefaultAssistantContext(() => 1000);
    context.awaiting = { type: "confirmar_navegacao", intent: "navigate" };
    context.pendingRoute = destination;
    const confirmed = await handlers.confirm({
      input: "sim",
      intent: {
        intent: "confirm",
        confidence: 1,
        entities: {},
        normalized: "sim",
        modifiers: [],
        contextual: true,
      },
      context,
    });

    expect(start).toHaveBeenCalledWith({
      longitude: -38.913,
      latitude: -13.376,
    });
    expect(confirmed).toMatchObject({
      metadata: { navigation: "started", destination: "Farol do Morro" },
    });
  });

'''
nav_test.write_text(nav_text[:start] + replacement + nav_text[end:])
