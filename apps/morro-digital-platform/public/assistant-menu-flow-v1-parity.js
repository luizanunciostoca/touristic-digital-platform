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
  voltar_filtros: [
    "voltar filtros",
    "voltar aos filtros",
    "filtros",
    "back to filters",
  ],
  voltar_menu: [
    "voltar menu",
    "voltar ao menu",
    "voltar ao menu principal",
    "menu principal",
    "back to main menu",
  ],
  "condições da praia": [
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
  "informações": [
    "informacoes",
    "informações",
    "informacao",
    "informação",
    "info",
    "detalhes",
    "details",
  ],
  "mais opções": [
    "mais opcoes",
    "mais opções",
    "outras opcoes",
    "outras opções",
    "more options",
  ],
});

export function normalizeAssistantMenuCommand(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s\[\]_]/gu, " ")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isElementVisible(element) {
  if (!(element instanceof HTMLElement)) return false;
  if (element.classList.contains("hidden")) return false;
  if (element.getAttribute("aria-hidden") === "true") return false;
  const style = getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden";
}

function buttonTexts(button) {
  return [
    button.dataset.value,
    button.dataset.locationName,
    button.textContent,
    button.getAttribute("aria-label"),
  ]
    .filter((value) => typeof value === "string" && value.trim())
    .map(normalizeAssistantMenuCommand)
    .filter(Boolean);
}

function buttonAliases(button) {
  const value = normalizeAssistantMenuCommand(button.dataset.value || "");
  return (OPTION_ALIASES[value] || []).map(normalizeAssistantMenuCommand);
}

function semanticButtonScore(message, button) {
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

function activeFlowButtons() {
  const flow = document.getElementById("assistant-category-results");
  if (flow && isElementVisible(flow)) {
    return Array.from(flow.querySelectorAll(".assistant-option-btn")).filter(
      (button) => button instanceof HTMLButtonElement,
    );
  }

  const containers = Array.from(
    document.querySelectorAll("#assistant-messages .assistant-options"),
  ).filter(
    (container) =>
      container instanceof HTMLElement &&
      isElementVisible(container) &&
      !container.querySelector("[data-explore-category]"),
  );
  const current = containers.at(-1);
  if (!(current instanceof HTMLElement)) return [];
  return Array.from(current.querySelectorAll(".assistant-option-btn")).filter(
    (button) => button instanceof HTMLButtonElement,
  );
}

function tryClickVisibleOption(message) {
  const buttons = activeFlowButtons();
  if (buttons.length === 0) return false;

  const normalizedMessage = normalizeAssistantMenuCommand(message);
  if (normalizedMessage === "voltar" || normalizedMessage === "back") {
    const backButton = buttons.find((button) => {
      const value = normalizeAssistantMenuCommand(button.dataset.value || "");
      const label = normalizeAssistantMenuCommand(button.textContent || "");
      return (
        value.startsWith("[sub] ") ||
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

  let bestButton = null;
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

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function categoryForMessage(message) {
  const normalizedMessage = normalizeAssistantMenuCommand(message);
  if (!normalizedMessage) return null;

  let match = null;
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

function tryOpenCategory(message) {
  const category = categoryForMessage(message);
  if (!category) return false;
  const button = document.getElementById(`assistant-category-${category}`);
  if (!(button instanceof HTMLButtonElement)) return false;
  button.click();
  return true;
}

/**
 * V1 routes typed commands through the same semantic actions as visible
 * assistant options. Keep stage-local choices first so terms such as "surf"
 * filter the active beach flow instead of reopening the category.
 */
export function routeTypedAssistantCommand(message) {
  if (tryClickVisibleOption(message)) return true;
  if (tryOpenCategory(message)) return true;
  return false;
}
