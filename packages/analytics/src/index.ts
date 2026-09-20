export const ANALYTICS_EVENT_NAMES = Object.freeze([
  "session_started",
  "category_viewed",
  "place_viewed",
  "search_submitted",
  "assistant_query",
  "directions_started",
  "tour_started",
  "tour_completed",
  "commerce_clicked",
  "offer_selected",
  "reservation_started",
  "checkout_started",
  "payment_approved",
  "ticket_issued",
] as const);

export type AnalyticsEventName = (typeof ANALYTICS_EVENT_NAMES)[number];

export const ANALYTICS_FUNNEL_STAGES = Object.freeze([
  "discover",
  "place",
  "intent",
  "checkout",
  "payment",
  "ticket",
] as const);

export type AnalyticsFunnelStage = (typeof ANALYTICS_FUNNEL_STAGES)[number];

export const ANALYTICS_FUNNEL_STAGE_EVENTS: Readonly<
  Record<AnalyticsFunnelStage, readonly AnalyticsEventName[]>
> = Object.freeze({
  discover: ["session_started", "category_viewed", "search_submitted"],
  place: ["place_viewed"],
  intent: [
    "assistant_query",
    "directions_started",
    "tour_started",
    "tour_completed",
    "commerce_clicked",
    "offer_selected",
    "reservation_started",
  ],
  checkout: ["checkout_started"],
  payment: ["payment_approved"],
  ticket: ["ticket_issued"],
});

export type AnalyticsConsentState = "unknown" | "granted" | "denied";
export type AnalyticsPrimitive = string | number | boolean | null;
export type AnalyticsAttributes = Readonly<Record<string, AnalyticsPrimitive>>;

export interface AnalyticsContext {
  readonly sessionId: string;
  readonly destinationId?: string;
  readonly locale?: string;
  readonly source?: string;
}

export interface AnalyticsEventInput {
  readonly name: AnalyticsEventName;
  readonly context: AnalyticsContext;
  readonly attributes?: Readonly<Record<string, unknown>>;
}

export interface AnalyticsEvent {
  readonly schemaVersion: "1";
  readonly eventId: string;
  readonly name: AnalyticsEventName;
  readonly occurredAt: string;
  readonly sessionId: string;
  readonly destinationId?: string;
  readonly locale?: string;
  readonly source?: string;
  readonly attributes: AnalyticsAttributes;
}

export interface AnalyticsTransport {
  send(event: AnalyticsEvent): void | Promise<void>;
}

export interface AnalyticsCollector {
  track(input: AnalyticsEventInput): Promise<AnalyticsTrackResult>;
}

export type AnalyticsTrackResult =
  | Readonly<{ status: "sent"; event: AnalyticsEvent }>
  | Readonly<{ status: "dropped"; reason: "consent_not_granted" }>
  | Readonly<{
      status: "rejected";
      reason: "invalid_context" | "invalid_attributes";
    }>;

export interface CreateAnalyticsCollectorOptions {
  readonly transport: AnalyticsTransport;
  readonly getConsent: () => AnalyticsConsentState;
  readonly createEventId?: () => string;
  readonly now?: () => Date;
}

const ATTRIBUTE_ALLOWLIST: Readonly<
  Record<AnalyticsEventName, readonly string[]>
> = Object.freeze({
  session_started: ["entryPoint", "returningVisitor"],
  category_viewed: ["categoryId", "resultCount"],
  place_viewed: ["placeId", "categoryId"],
  search_submitted: ["queryLength", "resultCount", "filterCount"],
  assistant_query: [
    "queryLength",
    "inputMode",
    "hasPlaceContext",
    "hasNavigationContext",
  ],
  directions_started: ["placeId", "travelMode"],
  tour_started: ["tourId", "stopCount"],
  tour_completed: ["tourId", "completedStops", "durationSeconds"],
  commerce_clicked: ["placeId", "offerId", "surface"],
  offer_selected: ["placeId", "offerId", "quantity"],
  reservation_started: ["placeId", "offerId", "quantity"],
  checkout_started: ["orderId", "itemCount", "currency"],
  payment_approved: ["orderId", "paymentMethod", "currency"],
  ticket_issued: ["orderId", "ticketCount", "ticketType"],
});

const FORBIDDEN_ATTRIBUTE_KEYS = Object.freeze([
  "email",
  "phone",
  "telephone",
  "name",
  "fullName",
  "message",
  "query",
  "searchQuery",
  "prompt",
  "address",
  "document",
  "cpf",
  "card",
  "token",
  "secret",
]);

function isNonEmptyIdentifier(value: string): boolean {
  return value.trim().length > 0 && value.length <= 160;
}

function isSafePrimitive(value: unknown): value is AnalyticsPrimitive {
  if (value === null || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") return value.length <= 240;
  return false;
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= 160
    ? normalized
    : undefined;
}

function isForbiddenKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return FORBIDDEN_ATTRIBUTE_KEYS.some(
    (forbidden) => normalized === forbidden.toLowerCase(),
  );
}

export function sanitizeAnalyticsAttributes(
  name: AnalyticsEventName,
  attributes: Readonly<Record<string, unknown>> | undefined,
): AnalyticsAttributes | null {
  if (!attributes) return Object.freeze({});

  const allowed = new Set(ATTRIBUTE_ALLOWLIST[name]);
  const sanitized: Record<string, AnalyticsPrimitive> = {};

  for (const [key, value] of Object.entries(attributes)) {
    if (isForbiddenKey(key)) return null;
    if (!allowed.has(key)) continue;
    if (!isSafePrimitive(value)) return null;
    sanitized[key] = value;
  }

  return Object.freeze(sanitized);
}

export function createAnalyticsEvent(
  input: AnalyticsEventInput,
  options: Readonly<{ eventId: string; occurredAt: string }>,
): AnalyticsEvent | null {
  if (
    !isNonEmptyIdentifier(input.context.sessionId) ||
    !isNonEmptyIdentifier(options.eventId)
  ) {
    return null;
  }

  const attributes = sanitizeAnalyticsAttributes(input.name, input.attributes);
  if (!attributes) return null;

  const destinationId = normalizeOptionalText(input.context.destinationId);
  const locale = normalizeOptionalText(input.context.locale);
  const source = normalizeOptionalText(input.context.source);

  return Object.freeze({
    schemaVersion: "1",
    eventId: options.eventId.trim(),
    name: input.name,
    occurredAt: options.occurredAt,
    sessionId: input.context.sessionId.trim(),
    ...(destinationId ? { destinationId } : {}),
    ...(locale ? { locale } : {}),
    ...(source ? { source } : {}),
    attributes,
  });
}

function defaultCreateEventId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `analytics-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

export function createAnalyticsCollector(
  options: CreateAnalyticsCollectorOptions,
): AnalyticsCollector {
  const createEventId = options.createEventId ?? defaultCreateEventId;
  const now = options.now ?? (() => new Date());

  return Object.freeze({
    async track(input: AnalyticsEventInput): Promise<AnalyticsTrackResult> {
      if (options.getConsent() !== "granted") {
        return Object.freeze({
          status: "dropped",
          reason: "consent_not_granted",
        });
      }

      if (!isNonEmptyIdentifier(input.context.sessionId)) {
        return Object.freeze({
          status: "rejected",
          reason: "invalid_context",
        });
      }

      const attributes = sanitizeAnalyticsAttributes(
        input.name,
        input.attributes,
      );
      if (!attributes) {
        return Object.freeze({
          status: "rejected",
          reason: "invalid_attributes",
        });
      }

      const event = createAnalyticsEvent(
        { ...input, attributes },
        {
          eventId: createEventId(),
          occurredAt: now().toISOString(),
        },
      );
      if (!event) {
        return Object.freeze({
          status: "rejected",
          reason: "invalid_context",
        });
      }

      await options.transport.send(event);
      return Object.freeze({ status: "sent", event });
    },
  });
}

export function createSameOriginAnalyticsTransport(
  fetcher: typeof fetch,
  endpoint = "/api/analytics/v1/events",
): AnalyticsTransport {
  return Object.freeze({
    async send(event: AnalyticsEvent): Promise<void> {
      const response = await fetcher(endpoint, {
        method: "POST",
        headers: Object.freeze({ "content-type": "application/json" }),
        body: JSON.stringify(event),
        credentials: "same-origin",
        keepalive: true,
      });
      if (!response.ok) {
        throw new Error(
          `Analytics delivery failed with HTTP ${response.status}.`,
        );
      }
    },
  });
}
