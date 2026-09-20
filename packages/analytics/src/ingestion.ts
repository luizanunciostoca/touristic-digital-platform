import {
  ANALYTICS_EVENT_NAMES,
  createAnalyticsEvent,
  type AnalyticsEvent,
  type AnalyticsEventInput,
  type AnalyticsEventName,
} from "./index.js";

export interface AnalyticsIngestionRecord {
  readonly event: AnalyticsEvent;
  readonly receivedAt: string;
  readonly retentionUntil: string;
}

export interface AnalyticsIngestionRepositoryPort {
  record(
    record: AnalyticsIngestionRecord,
  ): Promise<"stored" | "replayed">;
  purgeExpired(before: string): Promise<number>;
}

export interface AnalyticsIngestionService {
  ingest(value: unknown): Promise<
    Readonly<{
      status: "stored" | "replayed";
      event: AnalyticsEvent;
    }>
  >;
  purgeExpired(): Promise<number>;
}

export interface CreateAnalyticsIngestionServiceOptions {
  readonly repository: AnalyticsIngestionRepositoryPort;
  readonly now?: () => Date;
  readonly retentionDays: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function optionalString(
  value: unknown,
  maxLength = 160,
): string | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
}

function analyticsEventName(value: unknown): AnalyticsEventName | null {
  return typeof value === "string" &&
    (ANALYTICS_EVENT_NAMES as readonly string[]).includes(value)
    ? (value as AnalyticsEventName)
    : null;
}

export function parseAnalyticsWireEvent(value: unknown): AnalyticsEvent | null {
  if (!isRecord(value) || value.schemaVersion !== "1") return null;

  const eventId = optionalString(value.eventId);
  const name = analyticsEventName(value.name);
  const occurredAt = optionalString(value.occurredAt, 40);
  const sessionId = optionalString(value.sessionId);
  const destinationId = optionalString(value.destinationId);
  const locale = optionalString(value.locale, 40);
  const source = optionalString(value.source);
  const attributes = value.attributes;

  if (
    !eventId ||
    !name ||
    !occurredAt ||
    !sessionId ||
    destinationId === null ||
    locale === null ||
    source === null ||
    (attributes !== undefined && !isRecord(attributes))
  ) {
    return null;
  }

  const parsedOccurredAt = Date.parse(occurredAt);
  if (
    !Number.isFinite(parsedOccurredAt) ||
    new Date(parsedOccurredAt).toISOString() !== occurredAt
  ) {
    return null;
  }

  const input: AnalyticsEventInput = {
    name,
    context: {
      sessionId,
      ...(destinationId ? { destinationId } : {}),
      ...(locale ? { locale } : {}),
      ...(source ? { source } : {}),
    },
    ...(attributes ? { attributes } : {}),
  };

  return createAnalyticsEvent(input, { eventId, occurredAt });
}

function retentionUntil(now: Date, retentionDays: number): string {
  return new Date(
    now.getTime() + retentionDays * 24 * 60 * 60 * 1_000,
  ).toISOString();
}

export function createAnalyticsIngestionService(
  options: CreateAnalyticsIngestionServiceOptions,
): AnalyticsIngestionService {
  if (
    !Number.isInteger(options.retentionDays) ||
    options.retentionDays < 1 ||
    options.retentionDays > 365
  ) {
    throw new Error("ANALYTICS_RETENTION_DAYS_INVALID");
  }

  const now = options.now ?? (() => new Date());

  return Object.freeze({
    async ingest(value: unknown) {
      const event = parseAnalyticsWireEvent(value);
      if (!event) throw new Error("ANALYTICS_EVENT_INVALID");

      const receivedAt = now().toISOString();
      const status = await options.repository.record({
        event,
        receivedAt,
        retentionUntil: retentionUntil(
          new Date(receivedAt),
          options.retentionDays,
        ),
      });
      return Object.freeze({ status, event });
    },

    async purgeExpired(): Promise<number> {
      return options.repository.purgeExpired(now().toISOString());
    },
  });
}
