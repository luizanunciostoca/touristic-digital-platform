import type { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";

import { createMoney } from "@touristic/financial";
import { normalizeOrderId } from "@touristic/ordering";
import {
  assertTicketTransition,
  createTicket,
  normalizeTicketCode,
  normalizeTicketId,
  type Ticket,
  type TicketRepositoryPort,
} from "@touristic/ticketing";

interface TicketRow extends RowDataPacket {
  ticket_id: string;
  order_id: string;
  payment_id: string;
  destination_id: string;
  product_kind: string;
  product_reference: string;
  holder_name: string;
  quantity: number;
  amount_minor: number | string;
  currency: string;
  code: string;
  status: string;
  issued_at: Date | string;
  validated_at: Date | string | null;
  used_at: Date | string | null;
  cancelled_at: Date | string | null;
  updated_at: Date | string;
}

function timestamp(value: Date | string | null): string | null {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("TICKETING_INVALID_DB_TIMESTAMP");
  }
  return date.toISOString();
}

function fromRow(row: TicketRow): Ticket {
  const amount = createMoney(Number(row.amount_minor), row.currency);
  const ticket = createTicket({
    id: row.ticket_id,
    orderId: row.order_id,
    paymentId: row.payment_id,
    destinationId: row.destination_id,
    product: {
      kind: row.product_kind,
      reference: row.product_reference,
    },
    holderName: row.holder_name,
    quantity: row.quantity,
    amount,
    code: row.code,
    status: row.status,
    issuedAt: timestamp(row.issued_at),
    validatedAt: timestamp(row.validated_at),
    usedAt: timestamp(row.used_at),
    cancelledAt: timestamp(row.cancelled_at),
    updatedAt: timestamp(row.updated_at),
  });
  if (!ticket) throw new Error("TICKETING_INVALID_PERSISTED_TICKET");
  return ticket;
}

function sameImmutableTicket(left: Ticket, right: Ticket): boolean {
  return (
    left.id === right.id &&
    left.orderId === right.orderId &&
    left.paymentId === right.paymentId &&
    left.destinationId === right.destinationId &&
    left.product.kind === right.product.kind &&
    left.product.reference === right.product.reference &&
    left.holderName === right.holderName &&
    left.quantity === right.quantity &&
    left.amount.minorUnits === right.amount.minorUnits &&
    left.amount.currency === right.amount.currency &&
    left.code === right.code &&
    left.issuedAt === right.issuedAt
  );
}

function sameMutableTicket(left: Ticket, right: Ticket): boolean {
  return (
    left.status === right.status &&
    left.validatedAt === right.validatedAt &&
    left.usedAt === right.usedAt &&
    left.cancelledAt === right.cancelledAt &&
    left.updatedAt === right.updatedAt
  );
}

export class MySqlTicketRepository implements TicketRepositoryPort {
  constructor(private readonly pool: Pool) {}

  async findById(ticketId: string): Promise<Ticket | null> {
    const normalizedId = normalizeTicketId(ticketId);
    if (!normalizedId) throw new Error("TICKETING_INVALID_TICKET_ID");
    const [rows] = await this.pool.execute<TicketRow[]>(
      `SELECT ticket_id, order_id, payment_id, destination_id,
              product_kind, product_reference, holder_name, quantity,
              amount_minor, currency, code, status,
              issued_at, validated_at, used_at, cancelled_at, updated_at
       FROM ticketing_tickets
       WHERE ticket_id = ?
       LIMIT 1`,
      [normalizedId],
    );
    return rows[0] ? fromRow(rows[0]) : null;
  }

  async findByCode(code: string): Promise<Ticket | null> {
    const normalizedCode = normalizeTicketCode(code);
    if (!normalizedCode) throw new Error("TICKETING_INVALID_TICKET_CODE");
    const [rows] = await this.pool.execute<TicketRow[]>(
      `SELECT ticket_id, order_id, payment_id, destination_id,
              product_kind, product_reference, holder_name, quantity,
              amount_minor, currency, code, status,
              issued_at, validated_at, used_at, cancelled_at, updated_at
       FROM ticketing_tickets
       WHERE code = ?
       LIMIT 1`,
      [normalizedCode],
    );
    return rows[0] ? fromRow(rows[0]) : null;
  }

  async findByOrderId(orderId: string): Promise<readonly Ticket[]> {
    const normalizedOrderId = normalizeOrderId(orderId);
    if (!normalizedOrderId) throw new Error("TICKETING_INVALID_ORDER_ID");
    const [rows] = await this.pool.execute<TicketRow[]>(
      `SELECT ticket_id, order_id, payment_id, destination_id,
              product_kind, product_reference, holder_name, quantity,
              amount_minor, currency, code, status,
              issued_at, validated_at, used_at, cancelled_at, updated_at
       FROM ticketing_tickets
       WHERE order_id = ?
       ORDER BY issued_at ASC, ticket_id ASC`,
      [normalizedOrderId],
    );
    return rows.map(fromRow);
  }

  async save(ticket: Ticket): Promise<Ticket> {
    const normalized = createTicket(ticket);
    if (!normalized) throw new Error("TICKETING_INVALID_TICKET");

    await this.pool.execute(
      `INSERT IGNORE INTO ticketing_tickets (
        ticket_id, order_id, payment_id, destination_id,
        product_kind, product_reference, holder_name, quantity,
        amount_minor, currency, code, status,
        issued_at, validated_at, used_at, cancelled_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        normalized.id,
        normalized.orderId,
        normalized.paymentId,
        normalized.destinationId,
        normalized.product.kind,
        normalized.product.reference,
        normalized.holderName,
        normalized.quantity,
        normalized.amount.minorUnits,
        normalized.amount.currency,
        normalized.code,
        normalized.status,
        new Date(normalized.issuedAt),
        normalized.validatedAt ? new Date(normalized.validatedAt) : null,
        normalized.usedAt ? new Date(normalized.usedAt) : null,
        normalized.cancelledAt ? new Date(normalized.cancelledAt) : null,
        new Date(normalized.updatedAt),
      ],
    );

    const persisted = await this.findById(normalized.id);
    if (!persisted) {
      const conflicting = await this.findByCode(normalized.code);
      if (conflicting) throw new Error("TICKETING_TICKET_CODE_CONFLICT");
      throw new Error("TICKETING_TICKET_NOT_PERSISTED");
    }
    if (!sameImmutableTicket(persisted, normalized)) {
      throw new Error("TICKETING_IMMUTABLE_TICKET_CONFLICT");
    }
    if (sameMutableTicket(persisted, normalized)) return persisted;

    assertTicketTransition(persisted.status, normalized.status);
    if (Date.parse(normalized.updatedAt) <= Date.parse(persisted.updatedAt)) {
      throw new Error("TICKETING_STALE_TICKET_UPDATE");
    }
    if (
      (persisted.validatedAt !== null &&
        normalized.validatedAt !== persisted.validatedAt) ||
      (persisted.usedAt !== null && normalized.usedAt !== persisted.usedAt) ||
      (persisted.cancelledAt !== null &&
        normalized.cancelledAt !== persisted.cancelledAt)
    ) {
      throw new Error("TICKETING_TICKET_LIFECYCLE_CONFLICT");
    }

    const [result] = await this.pool.execute<ResultSetHeader>(
      `UPDATE ticketing_tickets
       SET status = ?, validated_at = ?, used_at = ?, cancelled_at = ?, updated_at = ?
       WHERE ticket_id = ?
         AND status = ?
         AND updated_at = ?
         AND validated_at <=> ?
         AND used_at <=> ?
         AND cancelled_at <=> ?`,
      [
        normalized.status,
        normalized.validatedAt ? new Date(normalized.validatedAt) : null,
        normalized.usedAt ? new Date(normalized.usedAt) : null,
        normalized.cancelledAt ? new Date(normalized.cancelledAt) : null,
        new Date(normalized.updatedAt),
        normalized.id,
        persisted.status,
        new Date(persisted.updatedAt),
        persisted.validatedAt ? new Date(persisted.validatedAt) : null,
        persisted.usedAt ? new Date(persisted.usedAt) : null,
        persisted.cancelledAt ? new Date(persisted.cancelledAt) : null,
      ],
    );
    if (result.affectedRows !== 1) {
      throw new Error("TICKETING_TICKET_CONCURRENT_UPDATE");
    }
    const updated = await this.findById(normalized.id);
    if (!updated || !sameImmutableTicket(updated, normalized)) {
      throw new Error("TICKETING_TICKET_NOT_UPDATED");
    }
    return updated;
  }
}
