export const BUSINESS_TUTORIAL_EVENT_LABELS = Object.freeze({
  business_discovered_by_menu: "Descoberta pelo menu",
  business_discovered_by_text_search: "Busca por texto",
  business_discovered_by_name: "Busca pelo nome",
  business_discovered_by_voice: "Busca por voz",
  business_recommended_by_assistant: "Recomendação da IA",
  business_profile_opened: "Perfil aberto",
  business_contact_action: "Ação de contato",
  business_route_started: "Rota iniciada",
  business_demo_promotion_created: "Promoção criada",
  business_demo_promotion_viewed: "Promoção visualizada",
} as const);

export type BusinessTutorialEventKey =
  keyof typeof BUSINESS_TUTORIAL_EVENT_LABELS;

export interface BusinessTutorialWorkspaceMetric {
  readonly key: BusinessTutorialEventKey;
  readonly label: string;
  readonly value: number;
}

export interface BusinessTutorialWorkspaceSnapshot {
  readonly businessName: string;
  readonly metrics: readonly BusinessTutorialWorkspaceMetric[];
  readonly eventCount: number;
  readonly tutorial: true;
  readonly excludeFromBusinessMetrics: true;
}

export interface BusinessTutorialPromotion {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly cta: string;
  readonly validUntil: string;
  readonly environment: "sandbox";
  readonly publishable: false;
  readonly tutorial: true;
  readonly excludeFromBusinessMetrics: true;
}

function safeText(value: unknown, fallback = "", maxLength = 220): string {
  if (typeof value !== "string") return fallback;
  const sanitized = value.replace(/[<>]/gu, "").trim().slice(0, maxLength);
  return sanitized || fallback;
}

function eventCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}

export function incrementBusinessTutorialEventSummary(
  summary: unknown,
  key: BusinessTutorialEventKey,
): Readonly<Record<BusinessTutorialEventKey, number>> {
  const record =
    summary && typeof summary === "object"
      ? (summary as Record<string, unknown>)
      : {};
  const next = {} as Record<BusinessTutorialEventKey, number>;
  for (const eventKey of Object.keys(
    BUSINESS_TUTORIAL_EVENT_LABELS,
  ) as BusinessTutorialEventKey[]) {
    next[eventKey] = eventCount(record[eventKey]) + (eventKey === key ? 1 : 0);
  }
  return Object.freeze(next);
}

export function buildBusinessTutorialWorkspaceSnapshot(input: {
  readonly businessName?: unknown;
  readonly eventSummary?: unknown;
}): BusinessTutorialWorkspaceSnapshot {
  const record =
    input.eventSummary && typeof input.eventSummary === "object"
      ? (input.eventSummary as Record<string, unknown>)
      : {};
  const metrics = Object.freeze(
    (
      Object.entries(BUSINESS_TUTORIAL_EVENT_LABELS) as readonly [
        BusinessTutorialEventKey,
        string,
      ][]
    ).map(([key, label]) =>
      Object.freeze({ key, label, value: eventCount(record[key]) }),
    ),
  );
  return Object.freeze({
    businessName: safeText(input.businessName, "Sua empresa", 180),
    metrics,
    eventCount: metrics.reduce((total, metric) => total + metric.value, 0),
    tutorial: true,
    excludeFromBusinessMetrics: true,
  });
}

export function getBusinessTutorialPromotionDefaults(
  category: unknown,
): Readonly<{
  title: string;
  description: string;
  cta: string;
}> {
  const key = safeText(category, "", 80);
  const defaults: Record<string, readonly [string, string, string]> = {
    restaurant: [
      "Oferta especial de hoje",
      "Condição exclusiva para quem encontrou a empresa pelo Morro Digital.",
      "Ver oferta",
    ],
    lodging: [
      "Benefício na reserva",
      "Consulte uma condição especial para sua hospedagem.",
      "Consultar",
    ],
    tour: [
      "Condição especial no passeio",
      "Garanta uma vantagem ao reservar pelo Morro Digital.",
      "Reservar",
    ],
    events: [
      "Ingresso ou benefício especial",
      "Confira a condição disponível para este evento.",
      "Ver evento",
    ],
  };
  const [title, description, cta] = defaults[key] ?? [
    "Oferta especial",
    "Confira uma condição exclusiva disponível agora.",
    "Ver oferta",
  ];
  return Object.freeze({ title, description, cta });
}

export function buildBusinessTutorialPromotion(
  input: Readonly<Record<string, unknown>>,
  id = `tutorial-promotion-${Date.now()}`,
): BusinessTutorialPromotion | null {
  const title = safeText(input.title, "", 90);
  const description = safeText(input.description, "", 220);
  const cta = safeText(input.cta, "", 50);
  if (!title || !description || !cta) return null;
  return Object.freeze({
    id: safeText(id, "tutorial-promotion", 120),
    title,
    description,
    cta,
    validUntil: safeText(input.validUntil, "", 20),
    environment: "sandbox",
    publishable: false,
    tutorial: true,
    excludeFromBusinessMetrics: true,
  });
}
