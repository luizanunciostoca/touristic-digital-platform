import { createHash } from "node:crypto";

import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";

import {
  createRestaurantReservationSlot,
  createRestaurantSlotAvailability,
  isRestaurantSlotBookable,
  type RestaurantReservationSlot,
  type RestaurantSlotAvailability,
} from "@touristic/commerce/restaurant-availability";
import {
  createRestaurantReservation,
  isRestaurantReservationTransitionAllowed,
  normalizeRestaurantReservationRequestKey,
  type RestaurantDepositPolicy,
  type RestaurantReservation,
  type RestaurantReservationStatus,
} from "@touristic/commerce/restaurant-reservations";

const RESERVATION_ID = /^rrv_[A-Za-z0-9_-]{8,116}$/u;
const SLOT_ID = /^rsl_[A-Za-z0-9_-]{8,116}$/u;
const BUSINESS_ID = /^[A-Za-z0-9][A-Za-z0-9:_-]{1,119}$/u;
const ACTOR = /^[A-Za-z0-9][A-Za-z0-9@._:-]{1,119}$/u;

interface SlotRow extends RowDataPacket {
  slot_id: string;
  business_id: string;
  place_id: string;
  destination_id: string;
  service_date: Date | string;
  starts_at: Date | string;
  ends_at: Date | string;
  seating_area: string | null;
  capacity: number;
  min_party_size: number;
  max_party_size: number;
  minimum_lead_minutes: number;
  maximum_advance_days: number;
  hold_duration_seconds: number;
  deposit_kind: "none" | "required";
  deposit_amount_minor: string | number | null;
  deposit_currency: string | null;
  enabled: number | boolean;
  created_at: Date | string;
  updated_at: Date | string;
}

interface ReservationRow extends RowDataPacket {
  reservation_id: string;
  request_key: string;
  slot_id: string;
  business_id: string;
  place_id: string;
  destination_id: string;
  service_date: Date | string;
  starts_at: Date | string;
  ends_at: Date | string;
  party_size: number;
  seating_area: string | null;
  notes: string | null;
  holder_reference: string;
  status: RestaurantReservationStatus;
  deposit_kind: "none" | "required";
  deposit_amount_minor: string | number | null;
  deposit_currency: string | null;
  hold_expires_at: Date | string | null;
  order_id: string | null;
  payment_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface SumRow extends RowDataPacket {
  committed_guests: string | number | null;
}

interface AvailabilityRow extends SlotRow {
  committed_guests: string | number | null;
}

export interface RestaurantReservationHoldResult {
  readonly reservation: RestaurantReservation;
  readonly availability: RestaurantSlotAvailability;
  readonly replayed: boolean;
}

export interface RestaurantReservationMutationResult {
  readonly reservation: RestaurantReservation;
  readonly replayed: boolean;
}

function iso(value: Date | string): string {
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error("COMMERCE_RESTAURANT_DB_TIMESTAMP_INVALID");
  }
  return parsed.toISOString();
}

function nullableIso(value: Date | string | null): string | null {
  return value === null ? null : iso(value);
}

function dateOnly(value: Date | string): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const normalized = value.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(normalized)) {
    throw new Error("COMMERCE_RESTAURANT_DB_DATE_INVALID");
  }
  return normalized;
}

function positiveMinor(value: string | number | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error("COMMERCE_RESTAURANT_DB_AMOUNT_INVALID");
  }
  return parsed;
}

function depositPolicyFromRow(
  kind: "none" | "required",
  amount: string | number | null,
  currency: string | null,
): RestaurantDepositPolicy {
  if (kind === "none") return Object.freeze({ kind: "none" as const });
  const minorUnits = positiveMinor(amount);
  if (
    minorUnits === null ||
    currency === null ||
    !/^[A-Z]{3}$/u.test(currency)
  ) {
    throw new Error("COMMERCE_RESTAURANT_DB_DEPOSIT_INVALID");
  }
  return Object.freeze({
    kind: "required" as const,
    amount: Object.freeze({ minorUnits, currency }),
  });
}

function integer(value: string | number | null): number {
  const parsed = Number(value ?? 0);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error("COMMERCE_RESTAURANT_DB_INTEGER_INVALID");
  }
  return parsed;
}

function actor(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("COMMERCE_RESTAURANT_ACTOR_INVALID");
  }
  const normalized = value.trim();
  if (!ACTOR.test(normalized)) {
    throw new Error("COMMERCE_RESTAURANT_ACTOR_INVALID");
  }
  return normalized;
}

function instant(value: unknown, code: string): string {
  if (typeof value !== "string") throw new Error(code);
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch)) throw new Error(code);
  return new Date(epoch).toISOString();
}

function reservationId(value: unknown): string {
  if (typeof value !== "string" || !RESERVATION_ID.test(value)) {
    throw new Error("COMMERCE_RESTAURANT_RESERVATION_ID_INVALID");
  }
  return value;
}

function slotFromRow(row: SlotRow): RestaurantReservationSlot {
  const depositPolicy = depositPolicyFromRow(
    row.deposit_kind,
    row.deposit_amount_minor,
    row.deposit_currency,
  );
  const slot = createRestaurantReservationSlot({
    id: row.slot_id,
    businessId: row.business_id,
    placeId: row.place_id,
    destinationId: row.destination_id,
    serviceDate: dateOnly(row.service_date),
    startsAt: iso(row.starts_at),
    endsAt: iso(row.ends_at),
    seatingArea: row.seating_area,
    capacity: row.capacity,
    minPartySize: row.min_party_size,
    maxPartySize: row.max_party_size,
    minimumLeadMinutes: row.minimum_lead_minutes,
    maximumAdvanceDays: row.maximum_advance_days,
    holdDurationSeconds: row.hold_duration_seconds,
    depositPolicy,
    enabled: Boolean(row.enabled),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  });
  if (!slot) throw new Error("COMMERCE_RESTAURANT_PERSISTED_SLOT_INVALID");
  return slot;
}

function reservationFromRow(row: ReservationRow): RestaurantReservation {
  const depositPolicy = depositPolicyFromRow(
    row.deposit_kind,
    row.deposit_amount_minor,
    row.deposit_currency,
  );
  const reservation = createRestaurantReservation({
    id: row.reservation_id,
    requestKey: row.request_key,
    slotId: row.slot_id,
    businessId: row.business_id,
    placeId: row.place_id,
    destinationId: row.destination_id,
    serviceDate: dateOnly(row.service_date),
    startsAt: iso(row.starts_at),
    endsAt: iso(row.ends_at),
    partySize: row.party_size,
    seatingArea: row.seating_area,
    notes: row.notes,
    holderReference: row.holder_reference,
    status: row.status,
    depositPolicy,
    holdExpiresAt: nullableIso(row.hold_expires_at),
    orderId: row.order_id,
    paymentId: row.payment_id,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  });
  if (!reservation) {
    throw new Error("COMMERCE_RESTAURANT_PERSISTED_RESERVATION_INVALID");
  }
  return reservation;
}

async function selectSlot(
  connection: PoolConnection,
  slotId: string,
  lock: boolean,
): Promise<RestaurantReservationSlot | null> {
  const [rows] = await connection.execute<SlotRow[]>(
    `SELECT * FROM commerce_restaurant_slots
     WHERE slot_id = ?${lock ? " FOR UPDATE" : ""}`,
    [slotId],
  );
  return rows[0] ? slotFromRow(rows[0]) : null;
}

async function selectReservationByRequestKey(
  connection: PoolConnection,
  requestKey: string,
): Promise<RestaurantReservation | null> {
  const [rows] = await connection.execute<ReservationRow[]>(
    `SELECT * FROM commerce_restaurant_reservations
     WHERE request_key = ? FOR UPDATE`,
    [requestKey],
  );
  return rows[0] ? reservationFromRow(rows[0]) : null;
}

async function selectReservationById(
  connection: PoolConnection,
  id: string,
  lock: boolean,
  businessId?: string,
): Promise<RestaurantReservation | null> {
  const businessPredicate = businessId ? " AND business_id = ?" : "";
  const [rows] = await connection.execute<ReservationRow[]>(
    `SELECT * FROM commerce_restaurant_reservations
     WHERE reservation_id = ?${businessPredicate}${lock ? " FOR UPDATE" : ""}`,
    businessId ? [id, businessId] : [id],
  );
  return rows[0] ? reservationFromRow(rows[0]) : null;
}

async function committedGuests(
  connection: PoolConnection,
  slotId: string,
): Promise<number> {
  const [rows] = await connection.execute<SumRow[]>(
    `SELECT COALESCE(SUM(party_size), 0) AS committed_guests
     FROM commerce_restaurant_reservations
     WHERE slot_id = ?
       AND status IN ('held','pending_confirmation','confirmed')`,
    [slotId],
  );
  return integer(rows[0]?.committed_guests ?? 0);
}

function eventId(
  reservation: RestaurantReservation,
  eventType: RestaurantReservationStatus,
  occurredAt: string,
): string {
  return `rre_${createHash("sha256")
    .update(
      `commerce-restaurant-event:v1:${reservation.id}:${eventType}:${occurredAt}`,
    )
    .digest("hex")
    .slice(0, 32)}`;
}

async function appendEvent(
  connection: PoolConnection,
  reservation: RestaurantReservation,
  eventType: RestaurantReservationStatus,
  actorReference: string,
  occurredAt: string,
): Promise<void> {
  await connection.execute(
    `INSERT INTO commerce_restaurant_reservation_events (
      event_id, reservation_id, slot_id, business_id, event_type,
      actor_reference, occurred_at, recorded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE event_id = event_id`,
    [
      eventId(reservation, eventType, occurredAt),
      reservation.id,
      reservation.slotId,
      reservation.businessId,
      eventType,
      actorReference,
      new Date(occurredAt),
      new Date(occurredAt),
    ],
  );
}

async function updateReservationStatus(
  connection: PoolConnection,
  reservation: RestaurantReservation,
): Promise<void> {
  await connection.execute(
    `UPDATE commerce_restaurant_reservations
     SET status = ?, hold_expires_at = ?, order_id = ?, payment_id = ?,
         updated_at = ?
     WHERE reservation_id = ?`,
    [
      reservation.status,
      reservation.holdExpiresAt ? new Date(reservation.holdExpiresAt) : null,
      reservation.orderId,
      reservation.paymentId,
      new Date(reservation.updatedAt),
      reservation.id,
    ],
  );
}

async function expireStaleHolds(
  connection: PoolConnection,
  slot: RestaurantReservationSlot,
  observedAt: string,
): Promise<void> {
  const [rows] = await connection.execute<ReservationRow[]>(
    `SELECT * FROM commerce_restaurant_reservations
     WHERE slot_id = ?
       AND status IN ('held','pending_confirmation')
       AND hold_expires_at <= ?
     FOR UPDATE`,
    [slot.id, new Date(observedAt)],
  );
  for (const row of rows) {
    const current = reservationFromRow(row);
    if (!isRestaurantReservationTransitionAllowed(current.status, "expired")) {
      throw new Error("COMMERCE_RESTAURANT_EXPIRY_TRANSITION_INVALID");
    }
    const expired = createRestaurantReservation({
      ...current,
      status: "expired",
      updatedAt: observedAt,
    });
    if (!expired) throw new Error("COMMERCE_RESTAURANT_EXPIRY_INVALID");
    await updateReservationStatus(connection, expired);
    await appendEvent(
      connection,
      expired,
      "expired",
      "system_expiry",
      observedAt,
    );
  }
}

function assertReplay(
  reservation: RestaurantReservation,
  input: {
    readonly reservationId: string;
    readonly holderReference: string;
    readonly partySize: number;
    readonly businessId: string;
    readonly slot: RestaurantReservationSlot;
  },
): void {
  if (
    reservation.id !== input.reservationId ||
    reservation.holderReference !== input.holderReference ||
    reservation.partySize !== input.partySize ||
    reservation.businessId !== input.businessId ||
    reservation.placeId !== input.slot.placeId ||
    reservation.startsAt !== input.slot.startsAt
  ) {
    throw new Error("COMMERCE_RESTAURANT_REPLAY_CONFLICT");
  }
}

function depositColumns(
  slot: RestaurantReservationSlot,
): readonly [string, number | null, string | null] {
  return slot.depositPolicy.kind === "none"
    ? ["none", null, null]
    : [
        "required",
        slot.depositPolicy.amount.minorUnits,
        slot.depositPolicy.amount.currency,
      ];
}

export class MySqlRestaurantReservationRepository {
  constructor(private readonly pool: Pool) {}

  async saveSlot(
    slot: RestaurantReservationSlot,
  ): Promise<RestaurantReservationSlot> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const existing = await selectSlot(connection, slot.id, true);
      const [depositKind, depositAmount, depositCurrency] =
        depositColumns(slot);
      if (existing) {
        if (
          existing.businessId !== slot.businessId ||
          existing.placeId !== slot.placeId ||
          existing.destinationId !== slot.destinationId ||
          existing.serviceDate !== slot.serviceDate ||
          existing.startsAt !== slot.startsAt ||
          existing.createdAt !== slot.createdAt
        ) {
          throw new Error("COMMERCE_RESTAURANT_SLOT_IDENTITY_CONFLICT");
        }
        const committed = await committedGuests(connection, slot.id);
        if (slot.capacity < committed) {
          throw new Error("COMMERCE_RESTAURANT_SLOT_CAPACITY_BELOW_COMMITTED");
        }
        await connection.execute(
          `UPDATE commerce_restaurant_slots
           SET ends_at = ?, seating_area = ?, capacity = ?,
               min_party_size = ?, max_party_size = ?,
               minimum_lead_minutes = ?, maximum_advance_days = ?,
               hold_duration_seconds = ?, deposit_kind = ?,
               deposit_amount_minor = ?, deposit_currency = ?, enabled = ?,
               updated_at = ?
           WHERE slot_id = ?`,
          [
            new Date(slot.endsAt),
            slot.seatingArea,
            slot.capacity,
            slot.minPartySize,
            slot.maxPartySize,
            slot.minimumLeadMinutes,
            slot.maximumAdvanceDays,
            slot.holdDurationSeconds,
            depositKind,
            depositAmount,
            depositCurrency,
            slot.enabled,
            new Date(slot.updatedAt),
            slot.id,
          ],
        );
      } else {
        await connection.execute(
          `INSERT INTO commerce_restaurant_slots (
            slot_id, business_id, place_id, destination_id, service_date,
            starts_at, ends_at, seating_area, capacity, min_party_size,
            max_party_size, minimum_lead_minutes, maximum_advance_days,
            hold_duration_seconds, deposit_kind, deposit_amount_minor,
            deposit_currency, enabled, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            slot.id,
            slot.businessId,
            slot.placeId,
            slot.destinationId,
            slot.serviceDate,
            new Date(slot.startsAt),
            new Date(slot.endsAt),
            slot.seatingArea,
            slot.capacity,
            slot.minPartySize,
            slot.maxPartySize,
            slot.minimumLeadMinutes,
            slot.maximumAdvanceDays,
            slot.holdDurationSeconds,
            depositKind,
            depositAmount,
            depositCurrency,
            slot.enabled,
            new Date(slot.createdAt),
            new Date(slot.updatedAt),
          ],
        );
      }
      await connection.commit();
      return slot;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async findForHolder(input: {
    readonly reservationId: unknown;
    readonly businessId: string;
    readonly holderReference: unknown;
  }): Promise<RestaurantReservation | null> {
    const id = reservationId(input.reservationId);
    if (!BUSINESS_ID.test(input.businessId)) {
      throw new Error("COMMERCE_RESTAURANT_SCOPE_INVALID");
    }
    const holderReference = actor(input.holderReference);
    const connection = await this.pool.getConnection();
    try {
      const [rows] = await connection.execute<ReservationRow[]>(
        `SELECT *
         FROM commerce_restaurant_reservations
         WHERE reservation_id = ?
           AND business_id = ?
           AND holder_reference = ?
         LIMIT 1`,
        [id, input.businessId, holderReference],
      );
      return rows[0] ? reservationFromRow(rows[0]) : null;
    } finally {
      connection.release();
    }
  }

  async listAvailabilityForDate(input: {
    readonly businessId: string;
    readonly placeId?: string | null;
    readonly serviceDate: string;
    readonly observedAt: unknown;
  }): Promise<
    readonly Readonly<{
      slot: RestaurantReservationSlot;
      availability: RestaurantSlotAvailability;
    }>[]
  > {
    if (
      !BUSINESS_ID.test(input.businessId) ||
      (input.placeId !== undefined &&
        input.placeId !== null &&
        !BUSINESS_ID.test(input.placeId))
    ) {
      throw new Error("COMMERCE_RESTAURANT_SCOPE_INVALID");
    }
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(input.serviceDate)) {
      throw new Error("COMMERCE_RESTAURANT_SERVICE_DATE_INVALID");
    }
    const dateEpoch = Date.parse(`${input.serviceDate}T00:00:00.000Z`);
    if (
      !Number.isFinite(dateEpoch) ||
      new Date(dateEpoch).toISOString().slice(0, 10) !== input.serviceDate
    ) {
      throw new Error("COMMERCE_RESTAURANT_SERVICE_DATE_INVALID");
    }
    const observedAt = instant(
      input.observedAt,
      "COMMERCE_RESTAURANT_OBSERVED_AT_INVALID",
    );
    const connection = await this.pool.getConnection();
    try {
      const placePredicate = input.placeId ? " AND s.place_id = ?" : "";
      const parameters: (Date | string)[] = [
        new Date(observedAt),
        input.businessId,
        input.serviceDate,
      ];
      if (input.placeId) parameters.push(input.placeId);
      const [rows] = await connection.execute<AvailabilityRow[]>(
        `SELECT
           s.*,
           COALESCE(
             SUM(
               CASE
                 WHEN r.status = 'confirmed' THEN r.party_size
                 WHEN r.status IN ('held','pending_confirmation')
                      AND r.hold_expires_at > ? THEN r.party_size
                 ELSE 0
               END
             ),
             0
           ) AS committed_guests
         FROM commerce_restaurant_slots s
         LEFT JOIN commerce_restaurant_reservations r
           ON r.slot_id = s.slot_id
         WHERE s.business_id = ?
           AND s.service_date = ?
           AND s.enabled = TRUE${placePredicate}
         GROUP BY s.slot_id
         ORDER BY s.starts_at ASC, s.seating_area ASC`,
        parameters,
      );
      return Object.freeze(
        rows.map((row) => {
          const slot = slotFromRow(row);
          const availability = createRestaurantSlotAvailability({
            slot,
            committedGuests: integer(row.committed_guests),
            observedAt,
          });
          if (!availability) {
            throw new Error("COMMERCE_RESTAURANT_AVAILABILITY_INVALID");
          }
          return Object.freeze({ slot, availability });
        }),
      );
    } finally {
      connection.release();
    }
  }

  async availability(
    slotId: string,
    businessId: string,
    observedAtInput: unknown,
  ): Promise<RestaurantSlotAvailability> {
    if (!SLOT_ID.test(slotId) || !BUSINESS_ID.test(businessId)) {
      throw new Error("COMMERCE_RESTAURANT_SCOPE_INVALID");
    }
    const observedAt = instant(
      observedAtInput,
      "COMMERCE_RESTAURANT_OBSERVED_AT_INVALID",
    );
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const slot = await selectSlot(connection, slotId, true);
      if (!slot || slot.businessId !== businessId) {
        throw new Error("COMMERCE_RESTAURANT_SLOT_NOT_FOUND");
      }
      await expireStaleHolds(connection, slot, observedAt);
      const committed = await committedGuests(connection, slot.id);
      const availability = createRestaurantSlotAvailability({
        slot,
        committedGuests: committed,
        observedAt,
      });
      if (!availability) {
        throw new Error("COMMERCE_RESTAURANT_AVAILABILITY_INVALID");
      }
      await connection.commit();
      return availability;
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
    readonly slotId: string;
    readonly businessId: string;
    readonly holderReference: unknown;
    readonly partySize: unknown;
    readonly notes?: unknown;
    readonly heldAt: unknown;
    readonly actorReference: unknown;
  }): Promise<RestaurantReservationHoldResult> {
    const id = reservationId(input.reservationId);
    if (!SLOT_ID.test(input.slotId) || !BUSINESS_ID.test(input.businessId)) {
      throw new Error("COMMERCE_RESTAURANT_SCOPE_INVALID");
    }
    const requestKey = normalizeRestaurantReservationRequestKey(
      input.requestKey,
    );
    const holderReference = actor(input.holderReference);
    const actorReference = actor(input.actorReference);
    const heldAt = instant(input.heldAt, "COMMERCE_RESTAURANT_HELD_AT_INVALID");
    const partySize =
      typeof input.partySize === "number" &&
      Number.isSafeInteger(input.partySize) &&
      input.partySize >= 1 &&
      input.partySize <= 30
        ? input.partySize
        : null;
    if (!requestKey || !partySize) {
      throw new Error("COMMERCE_RESTAURANT_HOLD_INVALID");
    }

    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const slot = await selectSlot(connection, input.slotId, true);
      if (!slot) throw new Error("COMMERCE_RESTAURANT_SLOT_NOT_FOUND");
      if (slot.businessId !== input.businessId) {
        throw new Error("COMMERCE_RESTAURANT_BUSINESS_SCOPE_DENIED");
      }
      await expireStaleHolds(connection, slot, heldAt);

      const replay = await selectReservationByRequestKey(
        connection,
        requestKey,
      );
      if (replay) {
        assertReplay(replay, {
          reservationId: id,
          holderReference,
          partySize,
          businessId: input.businessId,
          slot,
        });
        const committed = await committedGuests(connection, slot.id);
        const availability = createRestaurantSlotAvailability({
          slot,
          committedGuests: committed,
          observedAt: heldAt,
        });
        if (!availability) {
          throw new Error("COMMERCE_RESTAURANT_AVAILABILITY_INVALID");
        }
        await connection.commit();
        return Object.freeze({
          reservation: replay,
          availability,
          replayed: true,
        });
      }

      if (!isRestaurantSlotBookable(slot, heldAt)) {
        throw new Error("COMMERCE_RESTAURANT_SLOT_NOT_BOOKABLE");
      }
      if (partySize < slot.minPartySize || partySize > slot.maxPartySize) {
        throw new Error("COMMERCE_RESTAURANT_PARTY_SIZE_INVALID");
      }
      const committedBefore = await committedGuests(connection, slot.id);
      if (committedBefore + partySize > slot.capacity) {
        throw new Error("COMMERCE_RESTAURANT_CAPACITY_EXHAUSTED");
      }
      const holdExpiresAt = new Date(
        Math.min(
          Date.parse(heldAt) + slot.holdDurationSeconds * 1_000,
          Date.parse(slot.startsAt) - 1,
        ),
      ).toISOString();
      if (Date.parse(holdExpiresAt) <= Date.parse(heldAt)) {
        throw new Error("COMMERCE_RESTAURANT_HOLD_WINDOW_INVALID");
      }
      const reservation = createRestaurantReservation({
        id,
        requestKey,
        slotId: slot.id,
        businessId: slot.businessId,
        placeId: slot.placeId,
        destinationId: slot.destinationId,
        serviceDate: slot.serviceDate,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        partySize,
        seatingArea: slot.seatingArea,
        notes: input.notes ?? null,
        holderReference,
        status: "held",
        depositPolicy: slot.depositPolicy,
        holdExpiresAt,
        createdAt: heldAt,
      });
      if (!reservation) {
        throw new Error("COMMERCE_RESTAURANT_HOLD_INVALID");
      }
      const [depositKind, depositAmount, depositCurrency] =
        depositColumns(slot);
      await connection.execute(
        `INSERT INTO commerce_restaurant_reservations (
          reservation_id, request_key, slot_id, business_id, place_id,
          destination_id, service_date, starts_at, ends_at, party_size,
          seating_area, notes, holder_reference, status, deposit_kind,
          deposit_amount_minor, deposit_currency, hold_expires_at,
          order_id, payment_id, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
          NULL, NULL, ?, ?
        )`,
        [
          reservation.id,
          reservation.requestKey,
          slot.id,
          reservation.businessId,
          reservation.placeId,
          reservation.destinationId,
          reservation.serviceDate,
          new Date(reservation.startsAt),
          new Date(reservation.endsAt),
          reservation.partySize,
          reservation.seatingArea,
          reservation.notes,
          reservation.holderReference,
          reservation.status,
          depositKind,
          depositAmount,
          depositCurrency,
          new Date(holdExpiresAt),
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
      const availability = createRestaurantSlotAvailability({
        slot,
        committedGuests: committedBefore + partySize,
        observedAt: heldAt,
      });
      if (!availability) {
        throw new Error("COMMERCE_RESTAURANT_AVAILABILITY_INVALID");
      }
      await connection.commit();
      return Object.freeze({
        reservation,
        availability,
        replayed: false,
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async confirmFromVerifiedPayment(input: {
    readonly reservationId: unknown;
    readonly businessId: string;
    readonly orderId: string;
    readonly paymentId: string;
    readonly confirmedAt: unknown;
    readonly actorReference: unknown;
  }): Promise<RestaurantReservationMutationResult> {
    const id = reservationId(input.reservationId);
    if (!BUSINESS_ID.test(input.businessId)) {
      throw new Error("COMMERCE_RESTAURANT_SCOPE_INVALID");
    }
    const confirmedAt = instant(
      input.confirmedAt,
      "COMMERCE_RESTAURANT_CONFIRMED_AT_INVALID",
    );
    const actorReference = actor(input.actorReference);
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const current = await selectReservationById(
        connection,
        id,
        true,
        input.businessId,
      );
      if (!current) {
        throw new Error("COMMERCE_RESTAURANT_RESERVATION_NOT_FOUND");
      }
      if (current.depositPolicy.kind !== "required") {
        throw new Error("COMMERCE_RESTAURANT_DEPOSIT_NOT_REQUIRED");
      }
      if (
        current.status === "confirmed" &&
        current.orderId === input.orderId &&
        current.paymentId === input.paymentId
      ) {
        await connection.commit();
        return Object.freeze({ reservation: current, replayed: true });
      }
      if (
        current.status !== "held" ||
        !current.holdExpiresAt ||
        Date.parse(current.holdExpiresAt) <= Date.parse(confirmedAt)
      ) {
        throw new Error("COMMERCE_RESTAURANT_CONFIRMATION_INVALID");
      }
      const confirmed = createRestaurantReservation({
        ...current,
        status: "confirmed",
        orderId: input.orderId,
        paymentId: input.paymentId,
        updatedAt: confirmedAt,
      });
      if (!confirmed) {
        throw new Error("COMMERCE_RESTAURANT_CONFIRMATION_INVALID");
      }
      await updateReservationStatus(connection, confirmed);
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

  async confirmWithoutDeposit(input: {
    readonly reservationId: unknown;
    readonly businessId: string;
    readonly confirmedAt: unknown;
    readonly actorReference: unknown;
  }): Promise<RestaurantReservationMutationResult> {
    const id = reservationId(input.reservationId);
    if (!BUSINESS_ID.test(input.businessId)) {
      throw new Error("COMMERCE_RESTAURANT_SCOPE_INVALID");
    }
    const confirmedAt = instant(
      input.confirmedAt,
      "COMMERCE_RESTAURANT_CONFIRMED_AT_INVALID",
    );
    const actorReference = actor(input.actorReference);
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const snapshot = await selectReservationById(
        connection,
        id,
        false,
        input.businessId,
      );
      if (!snapshot) {
        throw new Error("COMMERCE_RESTAURANT_RESERVATION_NOT_FOUND");
      }
      const slot = await selectSlot(connection, snapshot.slotId, true);
      if (!slot) throw new Error("COMMERCE_RESTAURANT_SLOT_NOT_FOUND");
      const current = await selectReservationById(
        connection,
        id,
        true,
        input.businessId,
      );
      if (!current) {
        throw new Error("COMMERCE_RESTAURANT_RESERVATION_NOT_FOUND");
      }
      if (current.depositPolicy.kind !== "none") {
        throw new Error("COMMERCE_RESTAURANT_VERIFIED_PAYMENT_REQUIRED");
      }
      if (current.status === "confirmed") {
        await connection.commit();
        return Object.freeze({ reservation: current, replayed: true });
      }
      if (
        !isRestaurantReservationTransitionAllowed(
          current.status,
          "confirmed",
        ) ||
        (current.holdExpiresAt &&
          Date.parse(current.holdExpiresAt) <= Date.parse(confirmedAt))
      ) {
        throw new Error("COMMERCE_RESTAURANT_CONFIRMATION_INVALID");
      }
      const confirmed = createRestaurantReservation({
        ...current,
        status: "confirmed",
        updatedAt: confirmedAt,
      });
      if (!confirmed) {
        throw new Error("COMMERCE_RESTAURANT_CONFIRMATION_INVALID");
      }
      await updateReservationStatus(connection, confirmed);
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
}
