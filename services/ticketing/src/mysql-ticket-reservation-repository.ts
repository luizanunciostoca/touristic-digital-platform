import { createHash } from "node:crypto";

import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";

import {
  cancelTicketReservation,
  confirmTicketReservation,
  createTicketInventoryAvailability,
  createTicketInventoryOffer,
  createTicketReservation,
  expireTicketReservation,
  isTicketInventorySellable,
  normalizeTicketInventoryId,
  normalizeTicketReservationId,
  normalizeTicketReservationRequestKey,
  reservationRequestKeyMatchesInventory,
  type TicketInventoryAvailability,
  type TicketInventoryId,
  type TicketInventoryOffer,
  type TicketReservation,
  type TicketReservationId,
  type TicketReservationRequestKey,
} from "@touristic/ticketing/reservations";

const ACTOR_REFERENCE = /^[A-Za-z0-9_-]{2,120}$/u;
const EVENT_ID_BODY_LENGTH = 32;

interface InventoryRow extends RowDataPacket {
  inventory_id: string;
  destination_id: string;
  product_kind: string;
  product_reference: string;
  label: string;
  unit_amount_minor: string | number;
  currency: string;
  pricing_version: string;
  capacity: number;
  max_per_reservation: number;
  sales_start_at: Date | string;
  sales_end_at: Date | string;
  starts_at: Date | string;
  ends_at: Date | string;
  enabled: number | boolean;
  created_at: Date | string;
  updated_at: Date | string;
}

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

interface SumRow extends RowDataPacket {
  committed_quantity: string | number | null;
}

interface EventRow extends RowDataPacket {
  event_id: string;
  reservation_id: string;
  inventory_id: string;
  event_type: string;
  request_key: string;
  actor_reference: string;
  occurred_at: Date | string;
  recorded_at: Date | string;
}

export interface TicketReservationAuditEvent {
  readonly eventId: string;
  readonly reservationId: TicketReservationId;
  readonly inventoryId: TicketInventoryId;
  readonly eventType: "held" | "confirmed" | "expired" | "cancelled";
  readonly requestKey: TicketReservationRequestKey;
  readonly actorReference: string;
  readonly occurredAt: string;
  readonly recordedAt: string;
}

export interface TicketReservationHoldResult {
  readonly reservation: TicketReservation;
  readonly availability: TicketInventoryAvailability;
  readonly replayed: boolean;
}

export interface TicketReservationMutationResult {
  readonly reservation: TicketReservation;
  readonly replayed: boolean;
}

function time(value: Date | string | null): string | null {
  if (value === null) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error("TICKETING_RESERVATION_INVALID_DB_TIMESTAMP");
  }
  return parsed.toISOString();
}

function minor(value: string | number): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error("TICKETING_RESERVATION_INVALID_DB_AMOUNT");
  }
  return parsed;
}

function integer(value: string | number | null): number {
  const parsed = Number(value ?? 0);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error("TICKETING_RESERVATION_INVALID_DB_QUANTITY");
  }
  return parsed;
}

function actor(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("TICKETING_RESERVATION_ACTOR_INVALID");
  }
  const normalized = value.trim();
  if (!ACTOR_REFERENCE.test(normalized)) {
    throw new Error("TICKETING_RESERVATION_ACTOR_INVALID");
  }
  return normalized;
}

function instant(value: unknown, code: string): string {
  if (typeof value !== "string") throw new Error(code);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(code);
  return new Date(parsed).toISOString();
}

function inventoryFromRow(row: InventoryRow): TicketInventoryOffer {
  const value = createTicketInventoryOffer({
    id: row.inventory_id,
    destinationId: row.destination_id,
    product: {
      kind: row.product_kind,
      reference: row.product_reference,
    },
    label: row.label,
    unitAmount: {
      minorUnits: minor(row.unit_amount_minor),
      currency: row.currency,
    },
    pricingVersion: row.pricing_version,
    capacity: row.capacity,
    maxPerReservation: row.max_per_reservation,
    salesStartAt: time(row.sales_start_at),
    salesEndAt: time(row.sales_end_at),
    startsAt: time(row.starts_at),
    endsAt: time(row.ends_at),
    enabled: Boolean(row.enabled),
    createdAt: time(row.created_at),
    updatedAt: time(row.updated_at),
  });
  if (!value) throw new Error("TICKETING_INVALID_PERSISTED_INVENTORY");
  return value;
}

function reservationFromRow(row: ReservationRow): TicketReservation {
  const value = createTicketReservation({
    id: row.reservation_id,
    requestKey: row.request_key,
    inventoryId: row.inventory_id,
    destinationId: row.destination_id,
    product: {
      kind: row.product_kind,
      reference: row.product_reference,
    },
    unitAmount: {
      minorUnits: minor(row.unit_amount_minor),
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
  if (!value) throw new Error("TICKETING_INVALID_PERSISTED_RESERVATION");
  return value;
}

function eventId(
  reservationId: TicketReservationId,
  eventType: string,
  occurredAt: string,
): string {
  const digest = createHash("sha256")
    .update(
      `ticketing-reservation-event:v1:${reservationId}:${eventType}:${occurredAt}`,
    )
    .digest("hex")
    .slice(0, EVENT_ID_BODY_LENGTH);
  return `rve_${digest}`;
}

async function appendEvent(
  connection: PoolConnection,
  reservation: TicketReservation,
  eventType: "held" | "confirmed" | "expired" | "cancelled",
  actorReference: string,
  occurredAt: string,
): Promise<void> {
  const id = eventId(reservation.id, eventType, occurredAt);
  await connection.execute(
    `INSERT INTO ticketing_reservation_events (
      event_id, reservation_id, inventory_id, event_type, request_key,
      actor_reference, occurred_at, recorded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE event_id = event_id`,
    [
      id,
      reservation.id,
      reservation.inventoryId,
      eventType,
      reservation.requestKey,
      actorReference,
      new Date(occurredAt),
      new Date(occurredAt),
    ],
  );
}

async function selectInventory(
  connection: PoolConnection,
  inventoryId: TicketInventoryId,
  lock: boolean,
): Promise<TicketInventoryOffer | null> {
  const [rows] = await connection.execute<InventoryRow[]>(
    `SELECT * FROM ticketing_inventory WHERE inventory_id = ?${lock ? " FOR UPDATE" : ""}`,
    [inventoryId],
  );
  return rows[0] ? inventoryFromRow(rows[0]) : null;
}

async function selectReservationById(
  connection: PoolConnection,
  reservationId: TicketReservationId,
  lock: boolean,
): Promise<TicketReservation | null> {
  const [rows] = await connection.execute<ReservationRow[]>(
    `SELECT * FROM ticketing_reservations WHERE reservation_id = ?${lock ? " FOR UPDATE" : ""}`,
    [reservationId],
  );
  return rows[0] ? reservationFromRow(rows[0]) : null;
}

async function selectReservationByRequestKey(
  connection: PoolConnection,
  requestKey: TicketReservationRequestKey,
): Promise<TicketReservation | null> {
  const [rows] = await connection.execute<ReservationRow[]>(
    `SELECT * FROM ticketing_reservations WHERE request_key = ? FOR UPDATE`,
    [requestKey],
  );
  return rows[0] ? reservationFromRow(rows[0]) : null;
}

async function updateReservation(
  connection: PoolConnection,
  reservation: TicketReservation,
): Promise<void> {
  await connection.execute(
    `UPDATE ticketing_reservations
     SET status = ?, order_id = ?, payment_id = ?, confirmed_at = ?,
         expired_at = ?, cancelled_at = ?, updated_at = ?
     WHERE reservation_id = ?`,
    [
      reservation.status,
      reservation.orderId,
      reservation.paymentId,
      reservation.confirmedAt ? new Date(reservation.confirmedAt) : null,
      reservation.expiredAt ? new Date(reservation.expiredAt) : null,
      reservation.cancelledAt ? new Date(reservation.cancelledAt) : null,
      new Date(reservation.updatedAt),
      reservation.id,
    ],
  );
}

async function expireStaleHolds(
  connection: PoolConnection,
  inventoryId: TicketInventoryId,
  observedAt: string,
): Promise<void> {
  const [rows] = await connection.execute<ReservationRow[]>(
    `SELECT * FROM ticketing_reservations
     WHERE inventory_id = ? AND status = 'held' AND expires_at <= ?
     FOR UPDATE`,
    [inventoryId, new Date(observedAt)],
  );
  for (const row of rows) {
    const current = reservationFromRow(row);
    const expired = expireTicketReservation(current, observedAt);
    await updateReservation(connection, expired);
    await appendEvent(
      connection,
      expired,
      "expired",
      "system_expiry",
      observedAt,
    );
  }
}

async function committedQuantity(
  connection: PoolConnection,
  inventoryId: TicketInventoryId,
): Promise<number> {
  const [rows] = await connection.execute<SumRow[]>(
    `SELECT COALESCE(SUM(quantity), 0) AS committed_quantity
     FROM ticketing_reservations
     WHERE inventory_id = ? AND status IN ('held','confirmed')`,
    [inventoryId],
  );
  return integer(rows[0]?.committed_quantity ?? 0);
}

function assertReplayIdentity(
  existing: TicketReservation,
  input: {
    readonly reservationId: TicketReservationId;
    readonly inventoryId: TicketInventoryId;
    readonly holderReference: string;
    readonly quantity: number;
  },
): void {
  if (
    existing.id !== input.reservationId ||
    existing.inventoryId !== input.inventoryId ||
    existing.holderReference !== input.holderReference ||
    existing.quantity !== input.quantity
  ) {
    throw new Error("TICKETING_RESERVATION_REPLAY_CONFLICT");
  }
}

export class MySqlTicketReservationRepository {
  constructor(private readonly pool: Pool) {}

  async saveInventory(
    offer: TicketInventoryOffer,
  ): Promise<TicketInventoryOffer> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const existing = await selectInventory(connection, offer.id, true);
      if (existing) {
        if (
          existing.destinationId !== offer.destinationId ||
          existing.product.kind !== offer.product.kind ||
          existing.product.reference !== offer.product.reference ||
          existing.createdAt !== offer.createdAt
        ) {
          throw new Error("TICKETING_INVENTORY_IDENTITY_CONFLICT");
        }
        const committed = await committedQuantity(connection, offer.id);
        if (offer.capacity < committed) {
          throw new Error("TICKETING_INVENTORY_CAPACITY_BELOW_COMMITTED");
        }
        await connection.execute(
          `UPDATE ticketing_inventory
           SET label = ?, unit_amount_minor = ?, currency = ?, pricing_version = ?,
               capacity = ?, max_per_reservation = ?, sales_start_at = ?,
               sales_end_at = ?, starts_at = ?, ends_at = ?, enabled = ?, updated_at = ?
           WHERE inventory_id = ?`,
          [
            offer.label,
            offer.unitAmount.minorUnits,
            offer.unitAmount.currency,
            offer.pricingVersion,
            offer.capacity,
            offer.maxPerReservation,
            new Date(offer.salesStartAt),
            new Date(offer.salesEndAt),
            new Date(offer.startsAt),
            new Date(offer.endsAt),
            offer.enabled,
            new Date(offer.updatedAt),
            offer.id,
          ],
        );
      } else {
        await connection.execute(
          `INSERT INTO ticketing_inventory (
            inventory_id, destination_id, product_kind, product_reference, label,
            unit_amount_minor, currency, pricing_version, capacity,
            max_per_reservation, sales_start_at, sales_end_at, starts_at, ends_at,
            enabled, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            offer.id,
            offer.destinationId,
            offer.product.kind,
            offer.product.reference,
            offer.label,
            offer.unitAmount.minorUnits,
            offer.unitAmount.currency,
            offer.pricingVersion,
            offer.capacity,
            offer.maxPerReservation,
            new Date(offer.salesStartAt),
            new Date(offer.salesEndAt),
            new Date(offer.startsAt),
            new Date(offer.endsAt),
            offer.enabled,
            new Date(offer.createdAt),
            new Date(offer.updatedAt),
          ],
        );
      }
      await connection.commit();
      return offer;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async findInventoryById(
    inventoryIdInput: unknown,
  ): Promise<TicketInventoryOffer | null> {
    const inventoryId = normalizeTicketInventoryId(inventoryIdInput);
    if (!inventoryId) throw new Error("TICKETING_INVENTORY_ID_INVALID");
    const connection = await this.pool.getConnection();
    try {
      return await selectInventory(connection, inventoryId, false);
    } finally {
      connection.release();
    }
  }

  async findReservationById(
    reservationIdInput: unknown,
  ): Promise<TicketReservation | null> {
    const reservationId = normalizeTicketReservationId(reservationIdInput);
    if (!reservationId) throw new Error("TICKETING_RESERVATION_ID_INVALID");
    const connection = await this.pool.getConnection();
    try {
      return await selectReservationById(connection, reservationId, false);
    } finally {
      connection.release();
    }
  }

  async availability(
    inventoryIdInput: unknown,
    observedAtInput: unknown,
  ): Promise<TicketInventoryAvailability> {
    const inventoryId = normalizeTicketInventoryId(inventoryIdInput);
    const observedAt = instant(
      observedAtInput,
      "TICKETING_RESERVATION_OBSERVED_AT_INVALID",
    );
    if (!inventoryId) throw new Error("TICKETING_INVENTORY_ID_INVALID");
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const inventory = await selectInventory(connection, inventoryId, true);
      if (!inventory) throw new Error("TICKETING_INVENTORY_NOT_FOUND");
      await expireStaleHolds(connection, inventoryId, observedAt);
      const committed = await committedQuantity(connection, inventoryId);
      const result = createTicketInventoryAvailability({
        inventory,
        committedQuantity: committed,
        observedAt,
      });
      if (!result) throw new Error("TICKETING_AVAILABILITY_INVALID");
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async hold(input: {
    readonly reservationId: unknown;
    readonly requestKey: unknown;
    readonly inventoryId: unknown;
    readonly holderReference: unknown;
    readonly quantity: unknown;
    readonly heldAt: unknown;
    readonly expiresAt: unknown;
    readonly actorReference: unknown;
  }): Promise<TicketReservationHoldResult> {
    const reservationId = normalizeTicketReservationId(input.reservationId);
    const requestKey = normalizeTicketReservationRequestKey(input.requestKey);
    const inventoryId = normalizeTicketInventoryId(input.inventoryId);
    const holderReference = actor(input.holderReference);
    const quantity =
      typeof input.quantity === "number" &&
      Number.isSafeInteger(input.quantity) &&
      input.quantity > 0 &&
      input.quantity <= 20
        ? input.quantity
        : null;
    const heldAt = instant(
      input.heldAt,
      "TICKETING_RESERVATION_HELD_AT_INVALID",
    );
    const expiresAt = instant(
      input.expiresAt,
      "TICKETING_RESERVATION_EXPIRES_AT_INVALID",
    );
    const actorReference = actor(input.actorReference);
    if (!reservationId || !requestKey || !inventoryId || !quantity) {
      throw new Error("TICKETING_RESERVATION_HOLD_INVALID");
    }
    if (!reservationRequestKeyMatchesInventory(requestKey, inventoryId)) {
      throw new Error("TICKETING_RESERVATION_REQUEST_KEY_INVALID");
    }
    if (Date.parse(expiresAt) <= Date.parse(heldAt)) {
      throw new Error("TICKETING_RESERVATION_HOLD_WINDOW_INVALID");
    }

    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const inventory = await selectInventory(connection, inventoryId, true);
      if (!inventory) throw new Error("TICKETING_INVENTORY_NOT_FOUND");
      await expireStaleHolds(connection, inventoryId, heldAt);

      const replay = await selectReservationByRequestKey(
        connection,
        requestKey,
      );
      if (replay) {
        assertReplayIdentity(replay, {
          reservationId,
          inventoryId,
          holderReference,
          quantity,
        });
        const committed = await committedQuantity(connection, inventoryId);
        const availability = createTicketInventoryAvailability({
          inventory,
          committedQuantity: committed,
          observedAt: heldAt,
        });
        if (!availability) throw new Error("TICKETING_AVAILABILITY_INVALID");
        await connection.commit();
        return Object.freeze({
          reservation: replay,
          availability,
          replayed: true,
        });
      }

      if (!isTicketInventorySellable(inventory, heldAt)) {
        throw new Error("TICKETING_INVENTORY_NOT_SELLABLE");
      }
      if (quantity > inventory.maxPerReservation) {
        throw new Error("TICKETING_RESERVATION_QUANTITY_LIMIT");
      }
      if (Date.parse(expiresAt) > Date.parse(inventory.startsAt)) {
        throw new Error("TICKETING_RESERVATION_HOLD_WINDOW_INVALID");
      }

      const committedBefore = await committedQuantity(connection, inventoryId);
      if (committedBefore + quantity > inventory.capacity) {
        throw new Error("TICKETING_INVENTORY_EXHAUSTED");
      }
      const reservation = createTicketReservation({
        id: reservationId,
        requestKey,
        inventoryId,
        destinationId: inventory.destinationId,
        product: inventory.product,
        unitAmount: inventory.unitAmount,
        pricingVersion: inventory.pricingVersion,
        holderReference,
        quantity,
        status: "held",
        expiresAt,
        createdAt: heldAt,
        updatedAt: heldAt,
      });
      if (!reservation) throw new Error("TICKETING_RESERVATION_HOLD_INVALID");
      await connection.execute(
        `INSERT INTO ticketing_reservations (
          reservation_id, request_key, inventory_id, destination_id, product_kind,
          product_reference, unit_amount_minor, currency, pricing_version,
          holder_reference, quantity, status, expires_at, order_id, payment_id,
          created_at, confirmed_at, expired_at, cancelled_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, NULL, NULL, NULL, ?)`,
        [
          reservation.id,
          reservation.requestKey,
          reservation.inventoryId,
          reservation.destinationId,
          reservation.product.kind,
          reservation.product.reference,
          reservation.unitAmount.minorUnits,
          reservation.unitAmount.currency,
          reservation.pricingVersion,
          reservation.holderReference,
          reservation.quantity,
          reservation.status,
          new Date(reservation.expiresAt),
          new Date(reservation.createdAt),
          new Date(reservation.updatedAt),
        ],
      );
      await appendEvent(
        connection,
        reservation,
        "held",
        actorReference,
        heldAt,
      );
      const committedAfter = committedBefore + quantity;
      const availability = createTicketInventoryAvailability({
        inventory,
        committedQuantity: committedAfter,
        observedAt: heldAt,
      });
      if (!availability) throw new Error("TICKETING_AVAILABILITY_INVALID");
      await connection.commit();
      return Object.freeze({ reservation, availability, replayed: false });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async confirmAuthoritative(input: {
    readonly reservationId: unknown;
    readonly orderId: unknown;
    readonly paymentId: unknown;
    readonly confirmedAt: unknown;
    readonly actorReference: unknown;
  }): Promise<TicketReservationMutationResult> {
    const reservationId = normalizeTicketReservationId(input.reservationId);
    const confirmedAt = instant(
      input.confirmedAt,
      "TICKETING_RESERVATION_CONFIRMED_AT_INVALID",
    );
    const actorReference = actor(input.actorReference);
    if (!reservationId) throw new Error("TICKETING_RESERVATION_ID_INVALID");

    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const seed = await selectReservationById(
        connection,
        reservationId,
        false,
      );
      if (!seed) throw new Error("TICKETING_RESERVATION_NOT_FOUND");
      const inventory = await selectInventory(
        connection,
        seed.inventoryId,
        true,
      );
      if (!inventory) throw new Error("TICKETING_INVENTORY_NOT_FOUND");
      await expireStaleHolds(connection, seed.inventoryId, confirmedAt);
      const current = await selectReservationById(
        connection,
        reservationId,
        true,
      );
      if (!current) throw new Error("TICKETING_RESERVATION_NOT_FOUND");
      if (current.status === "confirmed") {
        if (
          current.orderId !== input.orderId ||
          current.paymentId !== input.paymentId
        ) {
          throw new Error("TICKETING_RESERVATION_CONFIRMATION_REPLAY_CONFLICT");
        }
        await connection.commit();
        return Object.freeze({ reservation: current, replayed: true });
      }
      if (current.status !== "held") {
        throw new Error(`TICKETING_RESERVATION_NOT_HELD:${current.status}`);
      }
      if (Date.parse(confirmedAt) >= Date.parse(current.expiresAt)) {
        throw new Error("TICKETING_RESERVATION_HOLD_EXPIRED");
      }
      const confirmed = confirmTicketReservation(current, {
        orderId: input.orderId,
        paymentId: input.paymentId,
        confirmedAt,
      });
      await updateReservation(connection, confirmed);
      await appendEvent(
        connection,
        confirmed,
        "confirmed",
        actorReference,
        confirmedAt,
      );
      await connection.commit();
      return Object.freeze({ reservation: confirmed, replayed: false });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async cancelHold(input: {
    readonly reservationId: unknown;
    readonly cancelledAt: unknown;
    readonly actorReference: unknown;
  }): Promise<TicketReservationMutationResult> {
    const reservationId = normalizeTicketReservationId(input.reservationId);
    const cancelledAt = instant(
      input.cancelledAt,
      "TICKETING_RESERVATION_CANCELLED_AT_INVALID",
    );
    const actorReference = actor(input.actorReference);
    if (!reservationId) throw new Error("TICKETING_RESERVATION_ID_INVALID");

    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const seed = await selectReservationById(
        connection,
        reservationId,
        false,
      );
      if (!seed) throw new Error("TICKETING_RESERVATION_NOT_FOUND");
      const inventory = await selectInventory(
        connection,
        seed.inventoryId,
        true,
      );
      if (!inventory) throw new Error("TICKETING_INVENTORY_NOT_FOUND");
      await expireStaleHolds(connection, seed.inventoryId, cancelledAt);
      const current = await selectReservationById(
        connection,
        reservationId,
        true,
      );
      if (!current) throw new Error("TICKETING_RESERVATION_NOT_FOUND");
      if (current.status === "cancelled") {
        await connection.commit();
        return Object.freeze({ reservation: current, replayed: true });
      }
      if (current.status !== "held") {
        throw new Error(`TICKETING_RESERVATION_NOT_HELD:${current.status}`);
      }
      const cancelled = cancelTicketReservation(current, cancelledAt);
      await updateReservation(connection, cancelled);
      await appendEvent(
        connection,
        cancelled,
        "cancelled",
        actorReference,
        cancelledAt,
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

  async listEvents(
    reservationIdInput: unknown,
  ): Promise<readonly TicketReservationAuditEvent[]> {
    const reservationId = normalizeTicketReservationId(reservationIdInput);
    if (!reservationId) throw new Error("TICKETING_RESERVATION_ID_INVALID");
    const [rows] = await this.pool.execute<EventRow[]>(
      `SELECT * FROM ticketing_reservation_events
       WHERE reservation_id = ? ORDER BY occurred_at ASC, event_id ASC`,
      [reservationId],
    );
    return Object.freeze(
      rows.map((row) => {
        const id = normalizeTicketReservationId(row.reservation_id);
        const inventoryId = normalizeTicketInventoryId(row.inventory_id);
        const requestKey = normalizeTicketReservationRequestKey(
          row.request_key,
        );
        const occurredAt = time(row.occurred_at);
        const recordedAt = time(row.recorded_at);
        if (
          !id ||
          !inventoryId ||
          !requestKey ||
          !occurredAt ||
          !recordedAt ||
          (row.event_type !== "held" &&
            row.event_type !== "confirmed" &&
            row.event_type !== "expired" &&
            row.event_type !== "cancelled") ||
          !ACTOR_REFERENCE.test(row.actor_reference)
        ) {
          throw new Error("TICKETING_INVALID_PERSISTED_RESERVATION_EVENT");
        }
        return Object.freeze({
          eventId: row.event_id,
          reservationId: id,
          inventoryId,
          eventType: row.event_type,
          requestKey,
          actorReference: row.actor_reference,
          occurredAt,
          recordedAt,
        });
      }),
    );
  }
}
