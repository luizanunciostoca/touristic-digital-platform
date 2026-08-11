import type { BusinessOnboardingContext } from "./onboarding.js";

export interface BusinessTutorialRecommendationCandidate {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly categoryLabel: string;
  readonly specialty: string;
  readonly objective: string;
  readonly audience: string;
  readonly cta: string;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly locationSource: string;
  readonly locationIsExample: boolean;
  readonly tutorial: true;
  readonly excludeFromBusinessMetrics: true;
}

export interface BusinessTutorialRecommendationResult {
  readonly query: string;
  readonly score: number;
  readonly rendered: boolean;
  readonly candidate: BusinessTutorialRecommendationCandidate;
  readonly tutorial: true;
  readonly excludeFromBusinessMetrics: true;
}

const CATEGORY_TERMS = Object.freeze({
  restaurant: [
    "restaurante",
    "jantar",
    "almoço",
    "comida",
    "comer",
    "food",
    "dinner",
  ],
  lodging: ["pousada", "hotel", "hospedagem", "quarto", "stay", "lodging"],
  tour: ["passeio", "tour", "barco", "lancha", "mergulho"],
  transport: [
    "transfer",
    "transporte",
    "táxi",
    "taxi",
    "aeroporto",
    "salvador",
  ],
  fashion: ["roupa", "moda", "loja", "comprar", "acessórios", "souvenir"],
  market: ["mercado", "supermercado", "entrega", "bebidas", "compras"],
  events: ["evento", "festa", "noite", "ingresso", "show", "sunset"],
  other: ["negócio", "serviço", "empresa", "recomenda"],
} as const);

function safeText(value: unknown, maxLength = 240): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[<>]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, maxLength);
}

function normalize(value: unknown): string {
  return safeText(value, 240)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function locationDetails(value: unknown): {
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly source: string;
  readonly isExample: boolean;
} {
  if (!value || typeof value !== "object") {
    return Object.freeze({
      latitude: null,
      longitude: null,
      source: "tutorial",
      isExample: false,
    });
  }

  const record = value as Record<string, unknown>;
  const coordinates =
    record.coordinates && typeof record.coordinates === "object"
      ? (record.coordinates as Record<string, unknown>)
      : record;
  const latitude =
    typeof coordinates.latitude === "number" &&
    Number.isFinite(coordinates.latitude)
      ? coordinates.latitude
      : typeof coordinates.lat === "number" && Number.isFinite(coordinates.lat)
        ? coordinates.lat
        : null;
  const longitude =
    typeof coordinates.longitude === "number" &&
    Number.isFinite(coordinates.longitude)
      ? coordinates.longitude
      : typeof coordinates.lon === "number" && Number.isFinite(coordinates.lon)
        ? coordinates.lon
        : null;

  return Object.freeze({
    latitude,
    longitude,
    source: safeText(record.source, 80) || "tutorial",
    isExample: record.isExample === true || record.source === "device",
  });
}

export function buildBusinessTutorialRecommendationCandidate(
  context: BusinessOnboardingContext = {},
  input: {
    readonly categoryLabel?: string;
    readonly cta?: string;
    readonly id?: string;
  } = {},
): BusinessTutorialRecommendationCandidate {
  const location = locationDetails(context.businessLocation);
  const name = safeText(context.businessName, 180) || "Sua empresa";
  const slug = normalize(name).replace(/\s+/gu, "-") || "candidate";

  return Object.freeze({
    id: safeText(input.id, 180) || `tutorial-business-${slug}`,
    name,
    category: safeText(context.category, 120) || "other",
    categoryLabel: safeText(input.categoryLabel, 120) || "Negócio local",
    specialty: safeText(context.specialty, 180) || "Experiência local",
    objective: safeText(context.objective, 180),
    audience: safeText(context.audience, 180),
    cta: safeText(input.cta, 120) || "Ver empresa",
    latitude: location.latitude,
    longitude: location.longitude,
    locationSource: location.source,
    locationIsExample: location.isExample,
    tutorial: true,
    excludeFromBusinessMetrics: true,
  });
}

export function scoreBusinessTutorialRecommendation(
  queryInput: unknown,
  candidate: BusinessTutorialRecommendationCandidate,
): number {
  const query = normalize(queryInput);
  if (!query) return 0;

  const category = candidate.category as keyof typeof CATEGORY_TERMS;
  const terms = CATEGORY_TERMS[category] ?? CATEGORY_TERMS.other;
  let score = 0;

  if (terms.some((term) => query.includes(normalize(term)))) score += 55;
  if (candidate.specialty && query.includes(normalize(candidate.specialty))) {
    score += 30;
  }
  if (candidate.name && query.includes(normalize(candidate.name))) score += 100;
  if (candidate.audience && query.includes(normalize(candidate.audience))) {
    score += 15;
  }

  return Math.min(score, 100);
}

export function evaluateBusinessTutorialRecommendation(
  queryInput: unknown,
  candidate: BusinessTutorialRecommendationCandidate,
): BusinessTutorialRecommendationResult {
  const query = safeText(queryInput, 240);
  const score = scoreBusinessTutorialRecommendation(query, candidate);

  return Object.freeze({
    query,
    score,
    rendered: score >= 50,
    candidate,
    tutorial: true,
    excludeFromBusinessMetrics: true,
  });
}
