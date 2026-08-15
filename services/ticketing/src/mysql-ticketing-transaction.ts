import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";

import {
  createTicket,
  createTicketCheckIn,
  createTicketOfflineEnvelope,
  normalizeTicketId,
  type Ticket,
  type TicketCheckIn,
  type TicketOfflineEnvelope,
} from "@touristic/ticketing";

export interface TicketingTransactionalCommandResult {
  readonly ticket: Ticket;
  readonly checkIn: TicketCheckIn;
  readonly replayed: boolean;
}

export interface TicketingOfflineTransactionalCommandResult
  extends TicketingTransactionalCommandResult {
  readonly envelope: TicketOfflineEnvelope;
}

export interface TicketingTransactionalCommandPort {
  commitCheckIn(input: {
    readonly before: Ticket;
    readonly after: Ticket;
    readonly checkIn: TicketCheckIn;
  }): Promise<TicketingTransactionalCommandResult>;
  commitOfflineSync(input: {
    readonly before: Ticket;
    readonly after: Ticket;
    readonly checkIn: TicketCheckIn;
    readonly envelope: TicketOfflineEnvelope;
    readonly syncedAt: string;
  }): Promise<TicketingOfflineTransactionalCommandResult>;
}

interface TicketRow extends RowDataPacket {
  ticket_id: string;
  order_id: string;
  payment_id: string;
  destination_id: string;
  product_kind: string;
  product_reference: string;
  holder_name: string;
  quantity: number;
  amount_minor: string | number;
  currency: string;
  code: string;
  status: string;
  issued_at: Date | string;
  validated_at: Date | string | null;
  used_at: Date | string | null;
  cancelled_at: Date | string | null;
  updated_at: Date | string;
}

interface CheckInRow extends RowDataPacket {
  checkin_id: string;
  ticket_id: string;
  result: string;
  channel: string;
  operator_reference: string;
  occurred_at: Date | string;
  recorded_at: Date | string;
}

interface EnvelopeRow extends RowDataPacket {
  envelope_id: string;
  ticket_id: string;
  operation: string;
  payload: string;
  signature: string;
  queued_at: Date | string;
  synced_at: Date | string | null;
  checkin_id: string | null;
}

function time(value: Date | string | null): string | null {
  if (value === null) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error("TICKETING_INVALID_DB_TIMESTAMP");
  return parsed.toISOString();
}

function minor(value: string | number): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error("TICKETING_INVALID_DB_AMOUNT");
  }
  return parsed;
}

function ticketFromRow(row: TicketRow): Ticket {
  const value = createTicket({
    id: row.ticket_id,
    orderId: row.order_id,
    paymentId: row.payment_id,
    destinationId: row.destination_id,
    product: { kind: row.product_kind, reference: row.product_reference },
    holderName: row.holder_name,
    quantity: row.quantity,
    amount: { minorUnits: minor(row.amount_minor), currency: row.currency },
    code: row.code,
    status: row.status,
    issuedAt: time(row.issued_at),
    validatedAt: time(row.validated_at),
    usedAt: time(row.used_at),
    cancelledAt: time(row.cancelled_at),
    updatedAt: time(row.updated_at),
  });
  if (!value) throw new Error("TICKETING_INVALID_PERSISTED_TICKET");
  return value;
}

function checkInFromRow(row: CheckInRow): TicketCheckIn {
  const value = createTicketCheckIn({
    id: row.checkin_id,
    ticketId: row.ticket_id,
    result: row.result,
    channel: row.channel,
    operatorReference: row.operator_reference,
    occurredAt: time(row.occurred_at),
    recordedAt: time(row.recorded_at),
  });
  if (!value) throw new Error("TICKETING_INVALID_PERSISTED_CHECKIN");
  return value;
}

function envelopeFromRow(row: EnvelopeRow): TicketOfflineEnvelope {
  const value = createTicketOfflineEnvelope({
    id: row.envelope_id,
    ticketId: row.ticket_id,
    operation: row.operation,
    payload: row.payload,
    signature: row.signature,
    queuedAt: time(row.queued_at),
  });
  if (!value) throw new Error("TICKETING_INVALID_PERSISTED_OFFLINE_ENVELOPE");
  return value;
}

async function lockTicket(
  connection: PoolConnection,
  ticketIdInput: string,
): Promise<Ticket> {
  const ticketId = normalizeTicketId(ticketIdInput);
  if (!ticketId) throw new Error("TICKETING_INVALID_TICKET_ID");
  const [rows] = await connection.execute<TicketRow[]>(
    `SELECT * FROM ticketing_tickets WHERE ticket_id = ? FOR UPDATE`,
    [ticketId],
  );
  if (!rows[0]) throw new Error("TICKETING_TICKET_NOT_FOUND");
  return ticketFromRow(rows[0]);
}

function assertExpectedCurrent(current: Ticket, before: Ticket): void {
  if (
    current.id !== before.id ||
    current.status !== before.status ||
    current.updatedAt !== before.updatedAt
  ) {
    throw new Error("TICKETING_CONCURRENT_TRANSITION");
  }
}

async function existingCheckIn(
  connection: PoolConnection,
  id: string,
): Promise<TicketCheckIn | null> {
  const [rows] = await connection.execute<CheckInRow[]>(
    `SELECT * FROM ticketing_checkins WHERE checkin_id = ? LIMIT 1`,
    [id],
  );
  return rows[0] ? checkInFromRow(rows[0]) : null;
}

function assertReplayIdentity(
  existing: TicketCheckIn,
  requested: TicketCheckIn,
): void {
  if (
    existing.ticketId !== requested.ticketId ||
    existing.channel !== requested.channel ||
    existing.operatorReference !== requested.operatorReference ||
    existing.occurredAt !== requested.occurredAt
  ) {
    throw new Error("TICKETING_CHECKIN_REPLAY_CONFLICT");
  }
}

async function updateTicket(
  connection: PoolConnection,
  ticket: Ticket,
): Promise<void> {
  await connection.execute(
    `UPDATE ticketing_tickets
     SET status = ?, validated_at = ?, used_at = ?, cancelled_at = ?, updated_at = ?
     WHERE ticket_id = ?`,
    [
      ticket.status,
      ticket.validatedAt ? new Date(ticket.validatedAt) : null,
      ticket.usedAt ? new Date(ticket.usedAt) : null,
      ticket.cancelledAt ? new Date(ticket.cancelledAt) : null,
      new Date(ticket.updatedAt),
      ticket.id,
    ],
  );
}

async function insertCheckIn(
  connection: PoolConnection,
  checkIn: TicketCheckIn,
): Promise<void> {
  await connection.execute(
    `INSERT INTO ticketing_checkins (
      checkin_id, ticket_id, result, channel, operator_reference,
      occurred_at, recorded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      checkIn.id,
      checkIn.ticketId,
      checkIn.result,
      checkIn.channel,
      checkIn.operatorReference,
      new Date(checkIn.occurredAt),
      new Date(checkIn.recordedAt),
    ],
  );
}

export class MySqlTicketingTransactionalCommand
  implements TicketingTransactionalCommandPort
{
  constructor(private readonly pool: Pool) {}

  async commitCheckIn(input: {
    readonly before: Ticket;
    readonly after: Ticket;
    readonly checkIn: TicketCheckIn;
  }): Promise<TicketingTransactionalCommandResult> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const current = await lockTicket(connection, input.before.id);
      const replay = await existingCheckIn(connection, input.checkIn.id);
      if (replay) {
        assertReplayIdentity(replay, input.checkIn);
        await connection.commit();
        return Object.freeze({ ticket: current, checkIn: replay, replayed: true });
      }
      assertExpectedCurrent(current, input.before);
      await updateTicket(connection, input.after);
      await insertCheckIn(connection, input.checkIn);
      await connection.commit();
      return Object.freeze({
        ticket: input.after,
        checkIn: input.checkIn,
        replayed: false,
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async commitOfflineSync(input: {
    readonly before: Ticket;
    readonly after: Ticket;
    readonly checkIn: TicketCheckIn;
    readonly envelope: TicketOfflineEnvelope;
    readonly syncedAt: string;
  }): Promise<TicketingOfflineTransactionalCommandResult> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const current = await lockTicket(connection, input.before.id);
      const [envelopeRows] = await connection.execute<EnvelopeRow[]>(
        `SELECT * FROM ticketing_offline_envelopes WHERE envelope_id = ? FOR UPDATE`,
        [input.envelope.id],
      );
      if (envelopeRows[0]) {
        const envelope = envelopeFromRow(envelopeRows[0]);
        if (
          envelope.ticketId !== input.envelope.ticketId ||
          envelope.operation !== input.envelope.operation ||
          envelope.payload !== input.envelope.payload ||
          envelope.signature !== input.envelope.signature ||
          envelope.queuedAt !== input.envelope.queuedAt ||
          !envelopeRows[0].synced_at ||
          !envelopeRows[0].checkin_id
        ) {
          throw new Error("TICKETING_OFFLINE_REPLAY_CONFLICT");
        }
        const replay = await existingCheckIn(
          connection,
          envelopeRows[0].checkin_id,
        );
        if (!replay) throw new Error("TICKETING_OFFLINE_REPLAY_INCOMPLETE");
        assertReplayIdentity(replay, input.checkIn);
        await connection.commit();
        return Object.freeze({
          envelope,
          ticket: current,
          checkIn: replay,
          replayed: true,
        });
      }

      assertExpectedCurrent(current, input.before);
      await connection.execute(
        `INSERT INTO ticketing_offline_envelopes (
          envelope_id, ticket_id, operation, payload, signature, queued_at
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          input.envelope.id,
          input.envelope.ticketId,
          input.envelope.operation,
          input.envelope.payload,
          input.envelope.signature,
          new Date(input.envelope.queuedAt),
        ],
      );
      await updateTicket(connection, input.after);
      await insertCheckIn(connection, input.checkIn);
      await connection.execute(
        `UPDATE ticketing_offline_envelopes
         SET synced_at = ?, checkin_id = ?
         WHERE envelope_id = ?`,
        [new Date(input.syncedAt), input.checkIn.id, input.envelope.id],
      );
      await connection.commit();
      return Object.freeze({
        envelope: input.envelope,
        ticket: input.after,
        checkIn: input.checkIn,
        replayed: false,
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}
