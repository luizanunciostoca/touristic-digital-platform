import type { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";

import {
  createTicketCheckIn,
  createTicketOfflineEnvelope,
  normalizeTicketCheckInId,
  normalizeTicketId,
  normalizeTicketOfflineEnvelopeId,
  type TicketCheckIn,
  type TicketCheckInRepositoryPort,
  type TicketOfflineEnvelope,
} from "@touristic/ticketing";

interface CheckInRow extends RowDataPacket {
  checkin_id: string;
  ticket_id: string;
  result: string;
  channel: string;
  operator_reference: string;
  occurred_at: Date | string;
  recorded_at: Date | string;
}

interface OfflineEnvelopeRow extends RowDataPacket {
  envelope_id: string;
  ticket_id: string;
  operation: string;
  payload: string;
  signature: string;
  queued_at: Date | string;
  synced_at: Date | string | null;
  checkin_id: string | null;
}

function timestamp(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("TICKETING_INVALID_DB_TIMESTAMP");
  }
  return date.toISOString();
}

function fromCheckInRow(row: CheckInRow): TicketCheckIn {
  const value = createTicketCheckIn({
    id: row.checkin_id,
    ticketId: row.ticket_id,
    result: row.result,
    channel: row.channel,
    operatorReference: row.operator_reference,
    occurredAt: timestamp(row.occurred_at),
    recordedAt: timestamp(row.recorded_at),
  });
  if (!value) throw new Error("TICKETING_INVALID_PERSISTED_CHECKIN");
  return value;
}

function fromOfflineEnvelopeRow(
  row: OfflineEnvelopeRow,
): TicketOfflineEnvelope {
  const value = createTicketOfflineEnvelope({
    id: row.envelope_id,
    ticketId: row.ticket_id,
    operation: row.operation,
    payload: row.payload,
    signature: row.signature,
    queuedAt: timestamp(row.queued_at),
  });
  if (!value) throw new Error("TICKETING_INVALID_PERSISTED_OFFLINE_ENVELOPE");
  return value;
}

export class MySqlTicketCheckInRepository implements TicketCheckInRepositoryPort {
  constructor(private readonly pool: Pool) {}

  async append(checkIn: TicketCheckIn): Promise<void> {
    const normalized = createTicketCheckIn(checkIn);
    if (!normalized) throw new Error("TICKETING_INVALID_CHECKIN");
    await this.pool.execute(
      `INSERT IGNORE INTO ticketing_checkins (
        checkin_id, ticket_id, result, channel, operator_reference,
        occurred_at, recorded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        normalized.id,
        normalized.ticketId,
        normalized.result,
        normalized.channel,
        normalized.operatorReference,
        new Date(normalized.occurredAt),
        new Date(normalized.recordedAt),
      ],
    );
  }

  async listByTicketId(ticketId: string): Promise<readonly TicketCheckIn[]> {
    const normalizedTicketId = normalizeTicketId(ticketId);
    if (!normalizedTicketId) throw new Error("TICKETING_INVALID_TICKET_ID");
    const [rows] = await this.pool.execute<CheckInRow[]>(
      `SELECT checkin_id, ticket_id, result, channel, operator_reference,
              occurred_at, recorded_at
       FROM ticketing_checkins
       WHERE ticket_id = ?
       ORDER BY occurred_at ASC, checkin_id ASC`,
      [normalizedTicketId],
    );
    return rows.map(fromCheckInRow);
  }
}

export class MySqlTicketOfflineEnvelopeRepository {
  constructor(private readonly pool: Pool) {}

  async enqueue(envelope: TicketOfflineEnvelope): Promise<void> {
    const normalized = createTicketOfflineEnvelope(envelope);
    if (!normalized) throw new Error("TICKETING_INVALID_OFFLINE_ENVELOPE");
    await this.pool.execute(
      `INSERT IGNORE INTO ticketing_offline_envelopes (
        envelope_id, ticket_id, operation, payload, signature, queued_at
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        normalized.id,
        normalized.ticketId,
        normalized.operation,
        normalized.payload,
        normalized.signature,
        new Date(normalized.queuedAt),
      ],
    );
  }

  async findById(envelopeId: string): Promise<TicketOfflineEnvelope | null> {
    const normalizedId = normalizeTicketOfflineEnvelopeId(envelopeId);
    if (!normalizedId) throw new Error("TICKETING_INVALID_OFFLINE_ENVELOPE_ID");
    const [rows] = await this.pool.execute<OfflineEnvelopeRow[]>(
      `SELECT envelope_id, ticket_id, operation, payload, signature,
              queued_at, synced_at, checkin_id
       FROM ticketing_offline_envelopes
       WHERE envelope_id = ?
       LIMIT 1`,
      [normalizedId],
    );
    return rows[0] ? fromOfflineEnvelopeRow(rows[0]) : null;
  }

  async markSynced(
    envelopeId: string,
    checkInId: string,
    syncedAt: string,
  ): Promise<void> {
    const normalizedEnvelopeId = normalizeTicketOfflineEnvelopeId(envelopeId);
    const normalizedCheckInId = normalizeTicketCheckInId(checkInId);
    if (!normalizedEnvelopeId || !normalizedCheckInId) {
      throw new Error("TICKETING_INVALID_OFFLINE_SYNC_REFERENCE");
    }
    const [result] = await this.pool.execute<ResultSetHeader>(
      `UPDATE ticketing_offline_envelopes
       SET synced_at = ?, checkin_id = ?
       WHERE envelope_id = ? AND synced_at IS NULL`,
      [new Date(syncedAt), normalizedCheckInId, normalizedEnvelopeId],
    );
    if (result.affectedRows > 1) {
      throw new Error("TICKETING_OFFLINE_SYNC_CONFLICT");
    }
  }
}
