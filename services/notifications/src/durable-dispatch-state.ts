import type { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";

import type {
  NotificationChannel,
  NotificationIdempotencyPort,
  NotificationPreferencePort,
  NotificationPreferenceQuery,
  NotificationTopic,
} from "@touristic/notifications";

export interface NotificationPreferenceRecord extends NotificationPreferenceQuery {
  readonly allowed: boolean;
  readonly updatedAt: string;
}

interface PreferenceRow extends RowDataPacket {
  destination_id: string;
  recipient_reference: string;
  topic: string;
  channel: string;
  allowed: number;
  updated_at: Date | string;
}

function iso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("NOTIFICATION_INVALID_DB_TIMESTAMP");
  }
  return date.toISOString();
}

export class MySqlNotificationPreferenceStore implements NotificationPreferencePort {
  constructor(private readonly pool: Pool) {}

  async isAllowed(query: NotificationPreferenceQuery): Promise<boolean> {
    const [rows] = await this.pool.execute<PreferenceRow[]>(
      `SELECT allowed
       FROM notification_preferences
       WHERE destination_id = ?
         AND recipient_reference = ?
         AND topic = ?
         AND channel = ?
       LIMIT 1`,
      [
        query.destinationId,
        query.recipientReference,
        query.topic,
        query.channel,
      ],
    );
    return rows[0]?.allowed === 1;
  }

  async set(input: NotificationPreferenceRecord): Promise<void> {
    await this.pool.execute<ResultSetHeader>(
      `INSERT INTO notification_preferences (
        destination_id, recipient_reference, topic, channel, allowed, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE allowed = VALUES(allowed), updated_at = VALUES(updated_at)`,
      [
        input.destinationId,
        input.recipientReference,
        input.topic,
        input.channel,
        input.allowed ? 1 : 0,
        new Date(input.updatedAt),
      ],
    );
  }

  async list(input: {
    readonly destinationId: string;
    readonly recipientReference: string;
  }): Promise<readonly NotificationPreferenceRecord[]> {
    const [rows] = await this.pool.execute<PreferenceRow[]>(
      `SELECT destination_id, recipient_reference, topic, channel, allowed, updated_at
       FROM notification_preferences
       WHERE destination_id = ? AND recipient_reference = ?
       ORDER BY topic ASC, channel ASC`,
      [input.destinationId, input.recipientReference],
    );
    return Object.freeze(
      rows.map((row) =>
        Object.freeze({
          destinationId: row.destination_id,
          recipientReference: row.recipient_reference,
          topic: row.topic as NotificationTopic,
          channel: row.channel as NotificationChannel,
          allowed: row.allowed === 1,
          updatedAt: iso(row.updated_at),
        }),
      ),
    );
  }
}

export class MySqlNotificationIdempotencyStore implements NotificationIdempotencyPort {
  constructor(private readonly pool: Pool) {}

  async claim(idempotencyKey: string): Promise<boolean> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      `INSERT IGNORE INTO notification_dispatch_claims (
        idempotency_key, claimed_at
      ) VALUES (?, ?)`,
      [idempotencyKey, new Date()],
    );
    return result.affectedRows === 1;
  }

  async release(idempotencyKey: string): Promise<void> {
    await this.pool.execute<ResultSetHeader>(
      "DELETE FROM notification_dispatch_claims WHERE idempotency_key = ?",
      [idempotencyKey],
    );
  }
}
