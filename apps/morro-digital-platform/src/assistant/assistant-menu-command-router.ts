import { morroV1SearchCatalog } from "@touristic/search";

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
  ],
  transport: [
    "transporte",
    "transportes",
    "transport",
    "transfer",
    "transfers",
    "como me locomover",
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
  ],
});

const OPTION_ALIASES = Object.freeze({
  surf: ["surf", "ondas", "ondas para surf", "praia com ondas"],
  mergulho: ["mergulho", "snorkel", "snorkeling", "mergulhar"],
  "por do sol": ["por do sol", "pôr do sol", "sunset", "entardecer"],
  familiar: [
    "familiar",
    "familia",
    "família",
    "tranquila",
    "tranquilo",
    "para criancas",
    "para crianças",
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
  ],
  "ver todos": [
    "ver todos",
    "ver todas",
    "mostrar todos",
    "mostrar todas",
    "show all",
    "todos",
    "todas",
  ],
  "voltar filtros": [
    "voltar filtros",
    "voltar aos filtros",
    "filtros",
    "back to filters",
  ],
  "voltar menu": [
    "voltar menu",
    "voltar ao menu",
    "voltar ao menu principal",
    "menu principal",
    "back to main menu",
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
  ],
  informacoes: [
    "informacoes",
    "informações",
    "informacao",
    "informação",
    "info",
    "detalhes",
    "details",
  ],
  "mais opcoes": [
    "mais opcoes",
    "mais opções",
    "outras opcoes",
    "outras opções",
    "more options",
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
    .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
    .map(normalizeAssistantMenuCommand)
    .filter(Boolean);
}

function buttonAliases(button: HTMLButtonElement): readonly string[] {
  const value = normalizeAssistantMenuCommand(button.dataset.value || "");
  return NORMALIZED_OPTION_ALIASES[value] ?? [];
}

function semanticButtonScore(message: string, button: HTMLButtonElement): number {
  const normalizedMessage = normalizeAssistantMenuCommand(message);
  if (!normalizedMessage) return 0;

  let score = 0;
  for (const candidate of [...buttonTexts(button), ...buttonAliases(button)]) {
    if (candidate === normalizedMessage) score = Math.max(score, 100);
    if (
      candidate.length >= 4 &&
      normalizedMessage.length >= 4 &&
      (normalizedMessage.includes(candidate) || candidate.includes(normalizedMessage))
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
    return Array.from(flow.querySelectorAll<HTMLButtonElement>(".assistant-option-btn"));
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
  return Array.from(current.querySelectorAll<HTMLButtonElement>(".assistant-option-btn"));
}

function clearPriorDynamicPresentation(document: Document): void {
  const area = document.querySelector("#assistant-messages .messages-area");
  if (!(area instanceof HTMLElement)) return;

  for (const container of Array.from(area.querySelectorAll(".assistant-options"))) {
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

function tryOpenCategory(document: Document, message: string): boolean {
  const category = categoryForMessage(message);
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
      normalizeAssistantMenuCommand(button.dataset.value || "").includes("ver todos"),
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

/**
 * Routes deterministic assistant commands through the same visible controls
 * used by the V1-compatible menu. Stage-local choices win over global
 * category aliases so "surf" filters an open beach flow instead of reopening
 * the category.
 */
export function routeAssistantMenuCommand(
  document: Document,
  message: string,
): boolean {
  if (tryClickVisibleOption(document, message)) return true;
  if (tryOpenCategory(document, message)) return true;
  return false;
}

/** Executes the small, sanitized action vocabulary accepted from the LLM. */
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
