import type {
  Pool,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";

import type {
  AnalyticsEvent,
} from "@touristic/analytics";
import type {
  AnalyticsIngestionRecord,
  AnalyticsIngestionRepositoryPort,
} from "@touristic/analytics/ingestion";

interface AnalyticsEventRow extends RowDataPacket {
  event_id: string;
  schema_version: string;
  event_name: string;
  occurred_at: Date | string;
  session_id: string;
  destination_id: string | null;
  locale: string | null;
  source: string | null;
  attributes_json: unknown;
}

function timestamp(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("ANALYTICS_INVALID_DB_TIMESTAMP");
  }
  return date.toISOString();
}

function stableJson(value: Readonly<Record<string, unknown>>): string {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(value).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
  );
}

function rowAttributes(value: unknown): Readonly<Record<string, unknown>> {
  if (typeof value === "string") {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Readonly<Record<string, unknown>>;
    }
    throw new Error("ANALYTICS_INVALID_PERSISTED_EVENT");
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Readonly<Record<string, unknown>>;
  }
  throw new Error("ANALYTICS_INVALID_PERSISTED_EVENT");
}

function sameEvent(row: AnalyticsEventRow, event: AnalyticsEvent): boolean {
  return (
    row.event_id === event.eventId &&
    row.schema_version === event.schemaVersion &&
    row.event_name === event.name &&
    timestamp(row.occurred_at) === event.occurredAt &&
    row.session_id === event.sessionId &&
    row.destination_id === (event.destinationId ?? null) &&
    row.locale === (event.locale ?? null) &&
    row.source === (event.source ?? null) &&
    stableJson(rowAttributes(row.attributes_json)) ===
      stableJson(event.attributes)
  );
}

export class MySqlAnalyticsEventRepository
  implements AnalyticsIngestionRepositoryPort
{
  constructor(private readonly pool: Pool) {}

  private async findRow(eventId: string): Promise<AnalyticsEventRow | null> {
    const [rows] = await this.pool.execute<AnalyticsEventRow[]>(
      `SELECT
        event_id, schema_version, event_name, occurred_at, session_id,
        destination_id, locale, source, attributes_json
       FROM analytics_events
       WHERE event_id = ?
       LIMIT 1`,
      [eventId],
    );
    return rows[0] ?? null;
  }

  async record(
    record: AnalyticsIngestionRecord,
  ): Promise<"stored" | "replayed"> {
    const { event } = record;
    const [result] = await this.pool.execute<ResultSetHeader>(
      `INSERT IGNORE INTO analytics_events (
        event_id, schema_version, event_name, occurred_at, session_id,
        destination_id, locale, source, attributes_json, received_at,
        retention_until
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        event.eventId,
        event.schemaVersion,
        event.name,
        new Date(event.occurredAt),
        event.sessionId,
        event.destinationId ?? null,
        event.locale ?? null,
        event.source ?? null,
        JSON.stringify(event.attributes),
        new Date(record.receivedAt),
        new Date(record.retentionUntil),
      ],
    );

    if (result.affectedRows === 1) return "stored";

    const persisted = await this.findRow(event.eventId);
    if (!persisted || !sameEvent(persisted, event)) {
      throw new Error("ANALYTICS_EVENT_ID_CONFLICT");
    }
    return "replayed";
  }

  async purgeExpired(before: string): Promise<number> {
    const cutoff = new Date(before);
    if (!Number.isFinite(cutoff.getTime())) {
      throw new Error("ANALYTICS_INVALID_RETENTION_CUTOFF");
    }
    const [result] = await this.pool.execute<ResultSetHeader>(
      "DELETE FROM analytics_events WHERE retention_until <= ?",
      [cutoff],
    );
    return result.affectedRows;
  }
}
