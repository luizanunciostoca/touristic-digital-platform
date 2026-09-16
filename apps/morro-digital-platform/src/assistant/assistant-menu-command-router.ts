import { morroV1SearchCatalog } from "@touristic/search";

import type { ExploreLocationsCommand } from "../map/explore-locations-control.js";

const CATEGORY_ALIASES = Object.freeze({
  beaches: [
    "praia",
    "praias",
    "beach",
    "beaches",
    "beachs",
    "playa",
    "playas",
    "mar",
    "litoral",
    "orla",
    "costa",
    "חופים",
    "חוף",
  ],
  restaurants: [
    "restaurante",
    "restaurantes",
    "restaurant",
    "restaurants",
    "comida",
    "food",
    "onde comer",
    "lugar para comer",
    "מסעדות",
    "מסעדה",
  ],
  hotels: [
    "pousada",
    "pousadas",
    "hotel",
    "hotels",
    "hostel",
    "hospedagem",
    "acomodacao",
    "accommodation",
    "lodging",
    "מלונות",
    "לינה",
  ],
  shops: [
    "loja",
    "lojas",
    "shop",
    "shops",
    "shopping",
    "compras",
    "store",
    "stores",
    "artesanato",
    "souvenir",
    "חנויות",
    "חנות",
  ],
  transport: [
    "transporte",
    "transportes",
    "transport",
    "transfer",
    "transfers",
    "como me locomover",
    "תחבורה",
  ],
  attractions: [
    "atracao",
    "atracoes",
    "attraction",
    "attractions",
    "ponto turistico",
    "pontos turisticos",
    "turismo",
    "o que visitar",
    "sightseeing",
    "אטרקציות",
    "אטרקציה",
  ],
  tours: [
    "passeio",
    "passeios",
    "tour",
    "tours",
    "excursao",
    "excursoes",
    "paseo",
    "paseos",
    "סיורים",
    "סיור",
  ],
  nightlife: [
    "vida noturna",
    "nightlife",
    "balada",
    "baladas",
    "festa",
    "festas",
    "bares",
    "clubs",
    "חיי לילה",
  ],
  emergencies: [
    "emergencia",
    "emergencias",
    "emergency",
    "emergencies",
    "socorro",
    "hospital",
    "policia",
    "bombeiros",
    "urgencia",
    "חירום",
    "מקרי חירום",
  ],
});

const OPTION_ALIASES = Object.freeze({
  surf: ["surf", "ondas", "ondas para surf", "praia com ondas"],
  mergulho: ["mergulho", "snorkel", "snorkeling", "mergulhar", "צלילה"],
  "por do sol": ["por do sol", "pôr do sol", "sunset", "entardecer", "שקיעה"],
  familiar: [
    "familiar",
    "familia",
    "família",
    "tranquila",
    "tranquilo",
    "para criancas",
    "para crianças",
    "family",
    "kids",
    "משפחה",
  ],
  estrutura: [
    "estrutura",
    "bares",
    "com estrutura",
    "estrutura e bares",
    "animada",
  ],
  proximo: [
    "proximo",
    "próximo",
    "proximos",
    "próximos",
    "perto de mim",
    "mais perto",
    "nearby",
    "close to me",
    "cerca de mi",
    "קרוב אליי",
  ],
  "ver todos": [
    "ver todos",
    "ver todas",
    "mostrar todos",
    "mostrar todas",
    "show all",
    "todos",
    "todas",
    "ver todo",
    "mostrar todo",
    "הצג הכל",
  ],
  "voltar filtros": [
    "voltar filtros",
    "voltar aos filtros",
    "filtros",
    "back to filters",
    "volver a filtros",
    "חזרה למסננים",
  ],
  "voltar menu": [
    "voltar menu",
    "voltar ao menu",
    "voltar ao menu principal",
    "menu principal",
    "back to main menu",
    "volver al menu principal",
    "חזרה לתפריט הראשי",
  ],
  "condicoes da praia": [
    "condicoes da praia",
    "condições da praia",
    "condicao da praia",
    "condição da praia",
    "condicoes",
    "condições",
  ],
  "como chegar": [
    "como chegar",
    "como chego",
    "rota",
    "directions",
    "route",
    "me leve",
    "navegar",
    "como llegar",
    "איך להגיע",
  ],
  "ver fotos": [
    "fotos",
    "foto",
    "ver fotos",
    "mostrar fotos",
    "photos",
    "photo",
    "imagens",
    "galeria",
    "fotos",
    "תמונות",
  ],
  informacoes: [
    "informacoes",
    "informações",
    "informacao",
    "informação",
    "info",
    "detalhes",
    "details",
    "informacion",
    "información",
    "מידע",
    "פרטים",
  ],
  "mais opcoes": [
    "mais opcoes",
    "mais opções",
    "outras opcoes",
    "outras opções",
    "more options",
    "mas opciones",
    "más opciones",
    "אפשרויות נוספות",
  ],
});

export interface AssistantExploreStateSnapshot {
  readonly category: string | null;
  readonly stage: string | null;
  readonly markerCount: number;
}

export function normalizeAssistantMenuCommand(value: string): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s\[\]_]/gu, " ")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const NORMALIZED_OPTION_ALIASES = Object.freeze(
  Object.fromEntries(
    Object.entries(OPTION_ALIASES).map(([value, aliases]) => [
      normalizeAssistantMenuCommand(value),
      aliases.map(normalizeAssistantMenuCommand),
    ]),
  ) as Record<string, readonly string[]>,
);

function isElementVisible(element: Element): boolean {
  if (!(element instanceof HTMLElement)) return false;
  if (element.classList.contains("hidden")) return false;
  if (element.getAttribute("aria-hidden") === "true") return false;
  const style = getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden";
}

function buttonTexts(button: HTMLButtonElement): readonly string[] {
  return [
    button.dataset.value,
    button.dataset.locationName,
    button.textContent,
    button.getAttribute("aria-label"),
  ]
    .filter(
      (value): value is string =>
        typeof value === "string" && Boolean(value.trim()),
    )
    .map(normalizeAssistantMenuCommand)
    .filter(Boolean);
}

function buttonAliases(button: HTMLButtonElement): readonly string[] {
  const value = normalizeAssistantMenuCommand(button.dataset.value || "");
  return NORMALIZED_OPTION_ALIASES[value] ?? [];
}

function semanticButtonScore(
  message: string,
  button: HTMLButtonElement,
): number {
  const normalizedMessage = normalizeAssistantMenuCommand(message);
  if (!normalizedMessage) return 0;

  let score = 0;
  for (const candidate of [...buttonTexts(button), ...buttonAliases(button)]) {
    if (candidate === normalizedMessage) score = Math.max(score, 100);
    if (
      candidate.length >= 4 &&
      normalizedMessage.length >= 4 &&
      (normalizedMessage.includes(candidate) ||
        candidate.includes(normalizedMessage))
    ) {
      score = Math.max(score, 80);
    }

    const messageTokens = new Set(normalizedMessage.split(" "));
    const candidateTokens = candidate
      .split(" ")
      .filter((token) => token.length >= 3);
    if (
      candidateTokens.length > 0 &&
      candidateTokens.every((token) => messageTokens.has(token))
    ) {
      score = Math.max(score, 70 + candidateTokens.length);
    }
  }
  return score;
}

function activeFlowButtons(document: Document): readonly HTMLButtonElement[] {
  const flow = document.getElementById("assistant-category-results");
  if (flow && isElementVisible(flow)) {
    return Array.from(
      flow.querySelectorAll<HTMLButtonElement>(".assistant-option-btn"),
    );
  }

  const containers = Array.from(
    document.querySelectorAll("#assistant-messages .assistant-options"),
  ).filter(
    (container): container is HTMLElement =>
      container instanceof HTMLElement &&
      isElementVisible(container) &&
      !container.querySelector("[data-explore-category]"),
  );
  const current = containers.at(-1);
  if (!current) return [];
  return Array.from(
    current.querySelectorAll<HTMLButtonElement>(".assistant-option-btn"),
  );
}

function clearPriorDynamicPresentation(document: Document): void {
  const area = document.querySelector("#assistant-messages .messages-area");
  if (!(area instanceof HTMLElement)) return;

  for (const container of Array.from(
    area.querySelectorAll(".assistant-options"),
  )) {
    if (!(container instanceof HTMLElement)) continue;
    if (container.querySelector("[data-explore-category]")) continue;
    container.remove();
  }

  for (const presentation of Array.from(
    area.querySelectorAll(
      ".assistant-photo-carousel, .assistant-photo-back-options",
    ),
  )) {
    presentation.remove();
  }
}

function tryClickVisibleOption(document: Document, message: string): boolean {
  const buttons = activeFlowButtons(document);
  if (buttons.length === 0) return false;

  const normalizedMessage = normalizeAssistantMenuCommand(message);
  if (/^\d+$/u.test(normalizedMessage)) {
    const oneBasedIndex = Number(normalizedMessage);
    const selected = buttons[oneBasedIndex - 1];
    if (selected) {
      selected.click();
      return true;
    }
  }

  if (normalizedMessage === "voltar" || normalizedMessage === "back") {
    const backButton = buttons.find((button) => {
      const value = normalizeAssistantMenuCommand(button.dataset.value || "");
      const label = normalizeAssistantMenuCommand(button.textContent || "");
      return (
        value.startsWith("[sub]") ||
        value === "voltar filtros" ||
        value === "voltar menu" ||
        label.includes("voltar") ||
        label.includes("back")
      );
    });
    if (backButton) {
      backButton.click();
      return true;
    }
  }

  let bestButton: HTMLButtonElement | null = null;
  let bestScore = 0;
  for (const button of buttons) {
    const score = semanticButtonScore(message, button);
    if (score > bestScore) {
      bestButton = button;
      bestScore = score;
    }
  }
  if (!bestButton || bestScore < 70) return false;
  bestButton.click();
  return true;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function categoryForMessage(message: string): string | null {
  const normalizedMessage = normalizeAssistantMenuCommand(message);
  if (!normalizedMessage) return null;

  let match: string | null = null;
  let longestAlias = 0;
  for (const [category, aliases] of Object.entries(CATEGORY_ALIASES)) {
    for (const rawAlias of aliases) {
      const alias = normalizeAssistantMenuCommand(rawAlias);
      if (!alias) continue;
      const direct = normalizedMessage === alias;
      const embedded =
        alias.length >= 4 &&
        new RegExp(`(^|\\s)${escapeRegex(alias)}(\\s|$)`).test(
          normalizedMessage,
        );
      if ((direct || embedded) && alias.length > longestAlias) {
        match = category;
        longestAlias = alias.length;
      }
    }
  }
  return match;
}

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
}
function tryOpenCategory(document: Document, message: string): boolean {
  const category = directCategoryForMessage(message);
  if (!category) return false;
  const button = document.getElementById(`assistant-category-${category}`);
  if (!(button instanceof HTMLButtonElement)) return false;
  clearPriorDynamicPresentation(document);
  button.click();
  return true;
}

function exactCatalogPlace(name: string) {
  const normalized = normalizeAssistantMenuCommand(name);
  return morroV1SearchCatalog.find(
    (place) => normalizeAssistantMenuCommand(place.name) === normalized,
  );
}

function tryOpenPlace(document: Document, name: string): boolean {
  const place = exactCatalogPlace(name);
  if (!place) return false;

  const categoryButton = document.getElementById(
    `assistant-category-${place.category}`,
  );
  if (!(categoryButton instanceof HTMLButtonElement)) return false;

  clearPriorDynamicPresentation(document);
  categoryButton.click();

  const allButton = Array.from(
    document.querySelectorAll<HTMLButtonElement>(
      "#assistant-category-results .assistant-option-btn",
    ),
  ).find(
    (button) =>
      button.dataset.exploreAction === "all" ||
      normalizeAssistantMenuCommand(button.dataset.value || "").includes(
        "ver todos",
      ),
  );
  allButton?.click();

  const placeButton = Array.from(
    document.querySelectorAll<HTMLButtonElement>(
      "#assistant-category-results [data-location-name]",
    ),
  ).find(
    (button) =>
      normalizeAssistantMenuCommand(button.dataset.locationName || "") ===
      normalizeAssistantMenuCommand(place.name),
  );
  if (!placeButton) return false;
  placeButton.click();
  return true;
}

function commandForButton(
  button: HTMLButtonElement,
): ExploreLocationsCommand | null {
  const place = button.dataset.locationName?.trim();
  if (place) return Object.freeze({ type: "select_place", place });

  const action = button.dataset.exploreAction;
  if (action === "all") return Object.freeze({ type: "show_all" });
  if (action === "nearby") return Object.freeze({ type: "show_nearby" });
  if (action === "back-filters") {
    return Object.freeze({ type: "back_to_filters" });
  }
  if (action === "back-menu") {
    return Object.freeze({ type: "back_to_menu" });
  }

  const value = button.dataset.value?.trim();
  if (!value) return null;
  if (value.startsWith("[sub]")) {
    return Object.freeze({ type: "show_all" });
  }
  return Object.freeze({ type: "apply_option", value });
}

function commandForVisibleOption(
  document: Document,
  message: string,
): ExploreLocationsCommand | null {
  const buttons = activeFlowButtons(document);
  if (buttons.length === 0) return null;

  const normalizedMessage = normalizeAssistantMenuCommand(message);
  if (/^\d+$/u.test(normalizedMessage)) {
    const selected = buttons[Number(normalizedMessage) - 1];
    return selected ? commandForButton(selected) : null;
  }

  if (
    normalizedMessage === "voltar" ||
    normalizedMessage === "back" ||
    normalizedMessage === "volver"
  ) {
    const backButton = buttons.find((button) => {
      const value = normalizeAssistantMenuCommand(button.dataset.value || "");
      const label = normalizeAssistantMenuCommand(button.textContent || "");
      return (
        value.startsWith("[sub]") ||
        value === "voltar filtros" ||
        value === "voltar menu" ||
        label.includes("voltar") ||
        label.includes("back") ||
        label.includes("volver")
      );
    });
    return backButton ? commandForButton(backButton) : null;
  }

  let bestButton: HTMLButtonElement | null = null;
  let bestScore = 0;
  for (const button of buttons) {
    const score = semanticButtonScore(message, button);
    if (score > bestScore) {
      bestButton = button;
      bestScore = score;
    }
  }
  return bestButton && bestScore >= 70 ? commandForButton(bestButton) : null;
}

/** Resolves text, voice, or option input to one typed Explore product command. */
export function resolveAssistantMenuCommand(
  document: Document,
  message: string,
): ExploreLocationsCommand | null {
  const visible = commandForVisibleOption(document, message);
  if (visible) return visible;

  const place = exactCatalogPlace(message);
  if (place) {
    return Object.freeze({ type: "select_place", place: place.name });
  }

  const category = directCategoryForMessage(message);
  return category ? Object.freeze({ type: "open_category", category }) : null;
}

/** Converts the strict LLM action vocabulary to the same typed Explore command. */
export function resolveAssistantRuntimeAction(
  action: string,
): ExploreLocationsCommand | null {
  if (action.startsWith("show_category:")) {
    const rawCategory = action.slice("show_category:".length);
    const category = categoryForMessage(rawCategory);
    return category ? Object.freeze({ type: "open_category", category }) : null;
  }
  if (action.startsWith("show_place:")) {
    const place = exactCatalogPlace(action.slice("show_place:".length));
    return place
      ? Object.freeze({ type: "select_place", place: place.name })
      : null;
  }
  return null;
}

/**
 * Legacy compatibility fallback. Production runtime uses
 * resolveAssistantMenuCommand() + ExploreLocationsControl.execute().
 */
export function routeAssistantMenuCommand(
  document: Document,
  message: string,
): boolean {
  if (tryClickVisibleOption(document, message)) return true;
  if (tryOpenCategory(document, message)) return true;
  return false;
}

/** Legacy isolated-runtime fallback for the sanitized LLM action vocabulary. */
export function executeAssistantRuntimeAction(
  document: Document,
  action: string,
): boolean {
  if (action.startsWith("show_category:")) {
    return tryOpenCategory(document, action.slice("show_category:".length));
  }
  if (action.startsWith("show_place:")) {
    return tryOpenPlace(document, action.slice("show_place:".length));
  }
  return false;
}

export function readAssistantExploreState(
  document: Document,
): AssistantExploreStateSnapshot {
  const map = document.getElementById("map");
  return Object.freeze({
    category: map?.getAttribute("data-explore-category") ?? null,
    stage: map?.getAttribute("data-explore-stage") ?? null,
    markerCount: Number(map?.getAttribute("data-map-marker-count") ?? "0"),
  });
}
