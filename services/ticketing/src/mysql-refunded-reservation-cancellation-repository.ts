import { createHash } from "node:crypto";

import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";

import {
  cancelConfirmedTicketReservationAfterRefund,
  createTicketReservation,
  normalizeTicketReservationId,
  type TicketReservation,
  type TicketReservationId,
} from "@touristic/ticketing/reservations";

import type { RefundedReservationCancellationRepositoryPort } from "./refund-cancellation.js";

interface ReservationRow extends RowDataPacket {
  reservation_id: string;
  request_key: string;
  inventory_id: string;
  destination_id: string;
  product_kind: string;
  product_reference: string;
  unit_amount_minor: string | number;
  currency: string;
  pricing_version: string;
  holder_reference: string;
  quantity: number;
  status: string;
  expires_at: Date | string;
  order_id: string | null;
  payment_id: string | null;
  created_at: Date | string;
  confirmed_at: Date | string | null;
  expired_at: Date | string | null;
  cancelled_at: Date | string | null;
  updated_at: Date | string;
}

function time(value: Date | string | null): string | null {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("TICKETING_RESERVATION_INVALID_DB_TIMESTAMP");
  }
  return date.toISOString();
}

function fromRow(row: ReservationRow): TicketReservation {
  const reservation = createTicketReservation({
    id: row.reservation_id,
    requestKey: row.request_key,
    inventoryId: row.inventory_id,
    destinationId: row.destination_id,
    product: { kind: row.product_kind, reference: row.product_reference },
    unitAmount: {
      minorUnits: Number(row.unit_amount_minor),
      currency: row.currency,
    },
    pricingVersion: row.pricing_version,
    holderReference: row.holder_reference,
    quantity: row.quantity,
    status: row.status,
    expiresAt: time(row.expires_at),
    orderId: row.order_id,
    paymentId: row.payment_id,
    createdAt: time(row.created_at),
    confirmedAt: time(row.confirmed_at),
    expiredAt: time(row.expired_at),
    cancelledAt: time(row.cancelled_at),
    updatedAt: time(row.updated_at),
  });
  if (!reservation) {
    throw new Error("TICKETING_INVALID_PERSISTED_RESERVATION");
  }
  return reservation;
}

async function selectReservation(
  connection: PoolConnection,
  reservationId: TicketReservationId,
  lock: boolean,
): Promise<TicketReservation | null> {
  const [rows] = await connection.execute<ReservationRow[]>(
    `SELECT * FROM ticketing_reservations
     WHERE reservation_id = ?${lock ? " FOR UPDATE" : ""}`,
    [reservationId],
  );
  return rows[0] ? fromRow(rows[0]) : null;
}

function eventId(reservationId: TicketReservationId, occurredAt: string): string {
  return `rve_${createHash("sha256")
    .update(`ticketing-reservation-event:v1:${reservationId}:cancelled:${occurredAt}`)
    .digest("hex")
    .slice(0, 32)}`;
}

export class MySqlRefundedReservationCancellationRepository
  implements RefundedReservationCancellationRepositoryPort
{
  constructor(private readonly pool: Pool) {}

  async findReservationById(
    reservationIdInput: TicketReservationId,
  ): Promise<TicketReservation | null> {
    const reservationId = normalizeTicketReservationId(reservationIdInput);
    if (!reservationId) throw new Error("TICKETING_RESERVATION_ID_INVALID");
    const connection = await this.pool.getConnection();
    try {
      return await selectReservation(connection, reservationId, false);
    } finally {
      connection.release();
    }
  }

  async cancelConfirmedAfterRefund(input: {
    readonly reservationId: TicketReservationId;
    readonly orderId: string;
    readonly paymentId: string;
    readonly cancelledAt: string;
    readonly actorReference: string;
  }): Promise<{ readonly reservation: TicketReservation; readonly replayed: boolean }> {
    const reservationId = normalizeTicketReservationId(input.reservationId);
    const cancelledAt = new Date(input.cancelledAt);
    if (!reservationId || !Number.isFinite(cancelledAt.getTime())) {
      throw new Error("TICKETING_REFUND_CANCELLATION_INVALID");
    }

    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const seed = await selectReservation(connection, reservationId, false);
      if (!seed) throw new Error("TICKETING_RESERVATION_NOT_FOUND");
      await connection.execute(
        "SELECT inventory_id FROM ticketing_inventory WHERE inventory_id = ? FOR UPDATE",
        [seed.inventoryId],
      );
      const current = await selectReservation(connection, reservationId, true);
      if (!current) throw new Error("TICKETING_RESERVATION_NOT_FOUND");
      if (
        current.orderId !== input.orderId ||
        current.paymentId !== input.paymentId
      ) {
        throw new Error("TICKETING_REFUND_AUTHORITY_MISMATCH");
      }
      if (current.status === "cancelled") {
        await connection.commit();
        return Object.freeze({ reservation: current, replayed: true });
      }

      const cancelled = cancelConfirmedTicketReservationAfterRefund(
        current,
        cancelledAt.toISOString(),
      );
      await connection.execute(
        `UPDATE ticketing_reservations
         SET status = 'cancelled', cancelled_at = ?, updated_at = ?
         WHERE reservation_id = ? AND status = 'confirmed'
           AND order_id = ? AND payment_id = ?`,
        [
          cancelledAt,
          cancelledAt,
          reservationId,
          input.orderId,
          input.paymentId,
        ],
      );
      await connection.execute(
        `INSERT INTO ticketing_reservation_events (
          event_id, reservation_id, inventory_id, event_type, request_key,
          actor_reference, occurred_at, recorded_at
        ) VALUES (?, ?, ?, 'cancelled', ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE event_id = event_id`,
        [
          eventId(reservationId, cancelledAt.toISOString()),
          reservationId,
          cancelled.inventoryId,
          cancelled.requestKey,
          input.actorReference,
          cancelledAt,
          cancelledAt,
        ],
      );
      await connection.commit();
      return Object.freeze({ reservation: cancelled, replayed: false });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}
