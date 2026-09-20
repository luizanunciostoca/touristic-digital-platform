import { createHash } from "node:crypto";

import type { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";

import type { TicketReservationFulfillmentResult } from "./reservation-fulfillment-service.js";

const EVENT_ID = /^tce_[a-f0-9]{40}$/u;
const ERROR_CODE = /^[A-Za-z0-9_.:-]{1,160}$/u;

export interface TicketingCommerceCrmEvent {
  readonly id: string;
  readonly type: "purchase_confirmed";
  readonly reservationId: string;
  readonly holderReference: string;
  readonly inventoryId: string;
  readonly orderId: string;
  readonly paymentId: string;
  readonly destinationId: string;
  readonly productKind: string;
  readonly productReference: string;
  readonly quantity: number;
  readonly amountMinor: number;
  readonly currency: string;
  readonly occurredAt: string;
  readonly publishedAt: string | null;
  readonly attemptCount: number;
  readonly lastErrorCode: string | null;
}

export interface TicketingCommerceCrmOutboxPort {
  enqueueConfirmedPurchase(
    result: TicketReservationFulfillmentResult,
  ): Promise<TicketingCommerceCrmEvent>;
  reconcileMissingConfirmedPurchases(limit?: number): Promise<number>;
  listPending(limit?: number): Promise<readonly TicketingCommerceCrmEvent[]>;
  markPublished(eventId: string, publishedAt: string): Promise<void>;
  markAttempt(eventId: string, errorCode: string): Promise<void>;
}

interface ReconciliationRow extends RowDataPacket {
  reservation_id: string;
  holder_reference: string;
  inventory_id: string;
  order_id: string;
  payment_id: string;
  destination_id: string;
  product_kind: string;
  product_reference: string;
  unit_amount_minor: string | number;
  currency: string;
  quantity: number;
  confirmed_at: Date | string;
}

interface EventRow extends RowDataPacket {
  event_id: string;
  event_type: "purchase_confirmed";
  reservation_id: string;
  holder_reference: string;
  inventory_id: string;
  order_id: string;
  payment_id: string;
  destination_id: string;
  product_kind: string;
  product_reference: string;
  quantity: number;
  amount_minor: string | number;
  currency: string;
  occurred_at: Date | string;
  published_at: Date | string | null;
  attempt_count: number;
  last_error_code: string | null;
}

function iso(value: Date | string | null): string | null {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("TICKETING_COMMERCE_CRM_TIMESTAMP_INVALID");
  }
  return date.toISOString();
}

function fromRow(row: EventRow): TicketingCommerceCrmEvent {
  const occurredAt = iso(row.occurred_at);
  if (!occurredAt || !EVENT_ID.test(row.event_id)) {
    throw new Error("TICKETING_COMMERCE_CRM_EVENT_INVALID");
  }
  const amountMinor = Number(row.amount_minor);
  if (
    !Number.isSafeInteger(amountMinor) ||
    amountMinor <= 0 ||
    !Number.isSafeInteger(row.quantity) ||
    row.quantity <= 0
  ) {
    throw new Error("TICKETING_COMMERCE_CRM_EVENT_INVALID");
  }
  return Object.freeze({
    id: row.event_id,
    type: row.event_type,
    reservationId: row.reservation_id,
    holderReference: row.holder_reference,
    inventoryId: row.inventory_id,
    orderId: row.order_id,
    paymentId: row.payment_id,
    destinationId: row.destination_id,
    productKind: row.product_kind,
    productReference: row.product_reference,
    quantity: row.quantity,
    amountMinor,
    currency: row.currency,
    occurredAt,
    publishedAt: iso(row.published_at),
    attemptCount: row.attempt_count,
    lastErrorCode: row.last_error_code,
  });
}

function eventId(reservationId: string): string {
  return `tce_${createHash("sha256")
    .update(`ticketing:commerce-crm:purchase-confirmed:v1:${reservationId}`)
    .digest("hex")
    .slice(0, 40)}`;
}

function boundedLimit(value: number): number {
  return Number.isSafeInteger(value) && value > 0 && value <= 500 ? value : 100;
}

function normalizeErrorCode(value: string): string {
  const normalized = value.trim().slice(0, 160);
  return ERROR_CODE.test(normalized) ? normalized : "CRM_SYNC_FAILED";
}

export class MySqlTicketingCommerceCrmOutbox implements TicketingCommerceCrmOutboxPort {
  constructor(private readonly pool: Pool) {}

  async enqueueConfirmedPurchase(
    result: TicketReservationFulfillmentResult,
  ): Promise<TicketingCommerceCrmEvent> {
    const { reservation, ticket } = result;
    if (
      reservation.status !== "confirmed" ||
      !reservation.orderId ||
      !reservation.paymentId ||
      !reservation.confirmedAt ||
      ticket.orderId !== reservation.orderId ||
      ticket.paymentId !== reservation.paymentId
    ) {
      throw new Error("TICKETING_COMMERCE_CRM_CONFIRMATION_INVALID");
    }

    const id = eventId(reservation.id);
    const amountMinor = ticket.amount.minorUnits;
    await this.pool.execute(
      `INSERT INTO ticketing_commerce_crm_outbox (
        event_id, event_type, reservation_id, holder_reference, inventory_id,
        order_id, payment_id, destination_id, product_kind, product_reference,
        quantity, amount_minor, currency, occurred_at, published_at,
        attempt_count, last_error_code, created_at, updated_at
      ) VALUES (?, 'purchase_confirmed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, NULL, ?, ?)
      ON DUPLICATE KEY UPDATE
        event_id = VALUES(event_id),
        updated_at = GREATEST(updated_at, VALUES(updated_at))`,
      [
        id,
        reservation.id,
        reservation.holderReference,
        reservation.inventoryId,
        reservation.orderId,
        reservation.paymentId,
        reservation.destinationId,
        reservation.product.kind,
        reservation.product.reference,
        reservation.quantity,
        amountMinor,
        reservation.unitAmount.currency,
        new Date(reservation.confirmedAt),
        new Date(reservation.confirmedAt),
        new Date(reservation.confirmedAt),
      ],
    );

    const event = await this.findById(id);
    if (!event) throw new Error("TICKETING_COMMERCE_CRM_OUTBOX_WRITE_FAILED");
    return event;
  }

  async reconcileMissingConfirmedPurchases(limit = 100): Promise<number> {
    const [rows] = await this.pool.execute<ReconciliationRow[]>(
      `SELECT
         r.reservation_id, r.holder_reference, r.inventory_id,
         r.order_id, r.payment_id, r.destination_id, r.product_kind,
         r.product_reference, r.unit_amount_minor, r.currency,
         r.quantity, r.confirmed_at
       FROM ticketing_reservations AS r
       WHERE r.status = 'confirmed'
         AND r.order_id IS NOT NULL
         AND r.payment_id IS NOT NULL
         AND r.confirmed_at IS NOT NULL
         AND EXISTS (
           SELECT 1
           FROM ticketing_tickets AS t
           WHERE t.order_id = r.order_id
             AND t.payment_id = r.payment_id
             AND t.destination_id = r.destination_id
             AND t.product_kind = r.product_kind
             AND t.product_reference = r.product_reference
             AND t.quantity = r.quantity
             AND t.currency = r.currency
             AND t.amount_minor = CAST(r.unit_amount_minor AS DECIMAL(20, 0)) * r.quantity
         )
         AND NOT EXISTS (
           SELECT 1
           FROM ticketing_commerce_crm_outbox AS o
           WHERE o.reservation_id = r.reservation_id
             AND o.event_type = 'purchase_confirmed'
         )
       ORDER BY r.confirmed_at ASC, r.reservation_id ASC
       LIMIT ${boundedLimit(limit)}`,
    );

    let reconciled = 0;
    for (const row of rows) {
      const unitAmountMinor = Number(row.unit_amount_minor);
      const amountMinor = unitAmountMinor * row.quantity;
      const occurredAt = iso(row.confirmed_at);
      if (
        !occurredAt ||
        !Number.isSafeInteger(unitAmountMinor) ||
        unitAmountMinor <= 0 ||
        !Number.isSafeInteger(row.quantity) ||
        row.quantity <= 0 ||
        !Number.isSafeInteger(amountMinor) ||
        amountMinor <= 0
      ) {
        throw new Error("TICKETING_COMMERCE_CRM_RECONCILIATION_INVALID");
      }

      const id = eventId(row.reservation_id);
      const occurredAtDate = new Date(occurredAt);
      await this.pool.execute(
        `INSERT INTO ticketing_commerce_crm_outbox (
          event_id, event_type, reservation_id, holder_reference, inventory_id,
          order_id, payment_id, destination_id, product_kind, product_reference,
          quantity, amount_minor, currency, occurred_at, published_at,
          attempt_count, last_error_code, created_at, updated_at
        ) VALUES (?, 'purchase_confirmed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, NULL, ?, ?)
        ON DUPLICATE KEY UPDATE
          event_id = VALUES(event_id),
          updated_at = GREATEST(updated_at, VALUES(updated_at))`,
        [
          id,
          row.reservation_id,
          row.holder_reference,
          row.inventory_id,
          row.order_id,
          row.payment_id,
          row.destination_id,
          row.product_kind,
          row.product_reference,
          row.quantity,
          amountMinor,
          row.currency,
          occurredAtDate,
          occurredAtDate,
          occurredAtDate,
        ],
      );
      const persisted = await this.findById(id);
      if (!persisted) {
        throw new Error("TICKETING_COMMERCE_CRM_OUTBOX_WRITE_FAILED");
      }
      reconciled += 1;
    }
    return reconciled;
  }

  async listPending(
    limit = 100,
  ): Promise<readonly TicketingCommerceCrmEvent[]> {
    const [rows] = await this.pool.execute<EventRow[]>(
      `SELECT
        event_id, event_type, reservation_id, holder_reference, inventory_id,
        order_id, payment_id, destination_id, product_kind, product_reference,
        quantity, amount_minor, currency, occurred_at, published_at,
        attempt_count, last_error_code
       FROM ticketing_commerce_crm_outbox
       WHERE published_at IS NULL
       ORDER BY occurred_at ASC, event_id ASC
       LIMIT ${boundedLimit(limit)}`,
    );
    return Object.freeze(rows.map(fromRow));
  }

  async markPublished(
    eventIdInput: string,
    publishedAtInput: string,
  ): Promise<void> {
    const publishedAt = new Date(publishedAtInput);
    if (
      !EVENT_ID.test(eventIdInput) ||
      !Number.isFinite(publishedAt.getTime())
    ) {
      throw new Error("TICKETING_COMMERCE_CRM_PUBLISH_INVALID");
    }
    const [result] = await this.pool.execute<ResultSetHeader>(
      `UPDATE ticketing_commerce_crm_outbox
       SET published_at = ?, last_error_code = NULL, updated_at = ?
       WHERE event_id = ? AND published_at IS NULL`,
      [publishedAt, publishedAt, eventIdInput],
    );
    if (result.affectedRows > 1) {
      throw new Error("TICKETING_COMMERCE_CRM_PUBLISH_CONFLICT");
    }
  }

  async markAttempt(
    eventIdInput: string,
    errorCodeInput: string,
  ): Promise<void> {
    if (!EVENT_ID.test(eventIdInput)) {
      throw new Error("TICKETING_COMMERCE_CRM_EVENT_ID_INVALID");
    }
    await this.pool.execute(
      `UPDATE ticketing_commerce_crm_outbox
       SET attempt_count = attempt_count + 1,
           last_error_code = ?,
           updated_at = ?
       WHERE event_id = ? AND published_at IS NULL`,
      [normalizeErrorCode(errorCodeInput), new Date(), eventIdInput],
    );
  }

  private async findById(
    eventIdInput: string,
  ): Promise<TicketingCommerceCrmEvent | null> {
    if (!EVENT_ID.test(eventIdInput)) return null;
    const [rows] = await this.pool.execute<EventRow[]>(
      `SELECT
        event_id, event_type, reservation_id, holder_reference, inventory_id,
        order_id, payment_id, destination_id, product_kind, product_reference,
        quantity, amount_minor, currency, occurred_at, published_at,
        attempt_count, last_error_code
       FROM ticketing_commerce_crm_outbox
       WHERE event_id = ?
       LIMIT 1`,
      [eventIdInput],
    );
    return rows[0] ? fromRow(rows[0]) : null;
  }
}
