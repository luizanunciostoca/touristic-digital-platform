import type { Pool, RowDataPacket } from "mysql2/promise";

import {
  createTicketInventoryOffer,
  createTicketReservation,
  normalizeTicketInventoryId,
  normalizeTicketReservationId,
  type TicketInventoryOffer,
  type TicketReservation,
} from "@touristic/ticketing/reservations";

import {
  MySqlTicketReservationRepository,
  type TicketReservationAuditEvent,
} from "./mysql-ticket-reservation-repository.js";

interface InventoryAdminRow extends RowDataPacket {
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
  business_id: string | null;
  committed_quantity: string | number | null;
  reservation_count: string | number | null;
}

interface ReservationAdminRow extends RowDataPacket {
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
  valid_until: Date | string | null;
  order_id: string | null;
  payment_id: string | null;
  created_at: Date | string;
  confirmed_at: Date | string | null;
  expired_at: Date | string | null;
  cancelled_at: Date | string | null;
  updated_at: Date | string;
  business_id: string | null;
  inventory_label: string;
}

export interface TicketingAdminInventoryProjection {
  readonly offer: TicketInventoryOffer;
  readonly businessId: string | null;
  readonly committedQuantity: number;
  readonly availableQuantity: number;
  readonly reservationCount: number;
}

export interface TicketingAdminReservationProjection {
  readonly reservation: TicketReservation;
  readonly businessId: string | null;
  readonly inventoryLabel: string;
}

export interface TicketingAdminReservationDetail
  extends TicketingAdminReservationProjection {
  readonly events: readonly TicketReservationAuditEvent[];
}

export interface TicketingAdminListInput {
  readonly query?: string;
  readonly destinationId?: string;
  readonly businessId?: string;
  readonly limit?: number;
}

export interface TicketingAdminReservationListInput
  extends TicketingAdminListInput {
  readonly status?: "held" | "confirmed" | "expired" | "cancelled";
}

function iso(value: Date | string | null): string | null {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("TICKETING_ADMIN_INVALID_TIMESTAMP");
  }
  return date.toISOString();
}

function safeInteger(value: string | number | null, code: string): number {
  const parsed = Number(value ?? 0);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(code);
  return parsed;
}

function boundedLimit(value: number | undefined): number {
  if (value === undefined) return 100;
  if (!Number.isSafeInteger(value) || value < 1 || value > 250) {
    throw new Error("TICKETING_ADMIN_LIMIT_INVALID");
  }
  return value;
}

function text(value: unknown, maxLength = 160): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function inventoryFromRow(row: InventoryAdminRow): TicketInventoryOffer {
  const offer = createTicketInventoryOffer({
    id: row.inventory_id,
    destinationId: row.destination_id,
    product: { kind: row.product_kind, reference: row.product_reference },
    label: row.label,
    unitAmount: {
      minorUnits: Number(row.unit_amount_minor),
      currency: row.currency,
    },
    pricingVersion: row.pricing_version,
    capacity: row.capacity,
    maxPerReservation: row.max_per_reservation,
    salesStartAt: iso(row.sales_start_at),
    salesEndAt: iso(row.sales_end_at),
    startsAt: iso(row.starts_at),
    endsAt: iso(row.ends_at),
    enabled: Boolean(row.enabled),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  });
  if (!offer) throw new Error("TICKETING_ADMIN_INVALID_INVENTORY");
  return offer;
}

function reservationFromRow(row: ReservationAdminRow): TicketReservation {
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
    expiresAt: iso(row.expires_at),
    validUntil: iso(row.valid_until),
    orderId: row.order_id,
    paymentId: row.payment_id,
    createdAt: iso(row.created_at),
    confirmedAt: iso(row.confirmed_at),
    expiredAt: iso(row.expired_at),
    cancelledAt: iso(row.cancelled_at),
    updatedAt: iso(row.updated_at),
  });
  if (!reservation) throw new Error("TICKETING_ADMIN_INVALID_RESERVATION");
  return reservation;
}

function inventoryProjection(
  row: InventoryAdminRow,
): TicketingAdminInventoryProjection {
  const offer = inventoryFromRow(row);
  const committedQuantity = safeInteger(
    row.committed_quantity,
    "TICKETING_ADMIN_INVALID_COMMITTED_QUANTITY",
  );
  const reservationCount = safeInteger(
    row.reservation_count,
    "TICKETING_ADMIN_INVALID_RESERVATION_COUNT",
  );
  return Object.freeze({
    offer,
    businessId: row.business_id,
    committedQuantity,
    availableQuantity: Math.max(0, offer.capacity - committedQuantity),
    reservationCount,
  });
}

function reservationProjection(
  row: ReservationAdminRow,
): TicketingAdminReservationProjection {
  return Object.freeze({
    reservation: reservationFromRow(row),
    businessId: row.business_id,
    inventoryLabel: row.inventory_label,
  });
}

const inventorySelect = `
  SELECT i.*, own.business_id,
    (
      SELECT COALESCE(SUM(r.quantity), 0)
        FROM ticketing_reservations r
       WHERE r.inventory_id = i.inventory_id
         AND r.status IN ('held', 'confirmed')
    ) AS committed_quantity,
    (
      SELECT COUNT(*)
        FROM ticketing_reservations r
       WHERE r.inventory_id = i.inventory_id
    ) AS reservation_count
    FROM ticketing_inventory i
    LEFT JOIN ticketing_inventory_ownership own
      ON own.inventory_id = i.inventory_id
`;

const reservationSelect = `
  SELECT r.*, own.business_id, i.label AS inventory_label
    FROM ticketing_reservations r
    INNER JOIN ticketing_inventory i ON i.inventory_id = r.inventory_id
    LEFT JOIN ticketing_inventory_ownership own
      ON own.inventory_id = r.inventory_id
`;

export class TicketingAdminService {
  private readonly reservations: MySqlTicketReservationRepository;

  public constructor(private readonly pool: Pool) {
    this.reservations = new MySqlTicketReservationRepository(pool);
  }

  public async listInventory(
    input: TicketingAdminListInput = {},
  ): Promise<readonly TicketingAdminInventoryProjection[]> {
    const query = text(input.query);
    const destinationId = text(input.destinationId);
    const businessId = text(input.businessId);
    const limit = boundedLimit(input.limit);
    const clauses: string[] = [];
    const params: string[] = [];
    if (query) {
      const pattern = `%${query}%`;
      clauses.push(
        "(i.inventory_id LIKE ? OR i.product_reference LIKE ? OR i.label LIKE ? OR own.business_id LIKE ?)",
      );
      params.push(pattern, pattern, pattern, pattern);
    }
    if (destinationId) {
      clauses.push("i.destination_id = ?");
      params.push(destinationId);
    }
    if (businessId) {
      clauses.push("own.business_id = ?");
      params.push(businessId);
    }
    const where = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
    const [rows] = await this.pool.execute<InventoryAdminRow[]>(
      `${inventorySelect}${where}
       ORDER BY i.starts_at DESC, i.inventory_id ASC
       LIMIT ${limit}`,
      params,
    );
    return Object.freeze(rows.map(inventoryProjection));
  }

  public async readInventory(
    inventoryIdInput: unknown,
    observedAt: string = new Date().toISOString(),
  ): Promise<
    | Readonly<{
        projection: TicketingAdminInventoryProjection;
        availability: Awaited<
          ReturnType<MySqlTicketReservationRepository["availability"]>
        >;
      }>
    | null
  > {
    const inventoryId = normalizeTicketInventoryId(inventoryIdInput);
    if (!inventoryId) throw new Error("TICKETING_INVENTORY_ID_INVALID");
    const [rows] = await this.pool.execute<InventoryAdminRow[]>(
      `${inventorySelect} WHERE i.inventory_id = ? LIMIT 1`,
      [inventoryId],
    );
    const row = rows[0];
    if (!row) return null;
    const availability = await this.reservations.availability(
      inventoryId,
      observedAt,
    );
    return Object.freeze({
      projection: inventoryProjection(row),
      availability,
    });
  }

  public async listReservations(
    input: TicketingAdminReservationListInput = {},
  ): Promise<readonly TicketingAdminReservationProjection[]> {
    const query = text(input.query);
    const destinationId = text(input.destinationId);
    const businessId = text(input.businessId);
    const status = text(input.status, 20);
    const limit = boundedLimit(input.limit);
    if (
      status &&
      !["held", "confirmed", "expired", "cancelled"].includes(status)
    ) {
      throw new Error("TICKETING_ADMIN_RESERVATION_STATUS_INVALID");
    }
    const clauses: string[] = [];
    const params: string[] = [];
    if (query) {
      const pattern = `%${query}%`;
      clauses.push(
        "(r.reservation_id LIKE ? OR r.inventory_id LIKE ? OR r.holder_reference LIKE ? OR r.order_id LIKE ? OR r.payment_id LIKE ? OR r.product_reference LIKE ? OR i.label LIKE ? OR own.business_id LIKE ?)",
      );
      params.push(
        pattern,
        pattern,
        pattern,
        pattern,
        pattern,
        pattern,
        pattern,
        pattern,
      );
    }
    if (destinationId) {
      clauses.push("r.destination_id = ?");
      params.push(destinationId);
    }
    if (businessId) {
      clauses.push("own.business_id = ?");
      params.push(businessId);
    }
    if (status) {
      clauses.push("r.status = ?");
      params.push(status);
    }
    const where = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
    const [rows] = await this.pool.execute<ReservationAdminRow[]>(
      `${reservationSelect}${where}
       ORDER BY r.updated_at DESC, r.reservation_id DESC
       LIMIT ${limit}`,
      params,
    );
    return Object.freeze(rows.map(reservationProjection));
  }

  public async readReservation(
    reservationIdInput: unknown,
  ): Promise<TicketingAdminReservationDetail | null> {
    const reservationId = normalizeTicketReservationId(reservationIdInput);
    if (!reservationId) throw new Error("TICKETING_RESERVATION_ID_INVALID");
    const [rows] = await this.pool.execute<ReservationAdminRow[]>(
      `${reservationSelect} WHERE r.reservation_id = ? LIMIT 1`,
      [reservationId],
    );
    const row = rows[0];
    if (!row) return null;
    return Object.freeze({
      ...reservationProjection(row),
      events: await this.reservations.listEvents(reservationId),
    });
  }

  public async cancelHeldReservation(input: {
    readonly reservationId: unknown;
    readonly cancelledAt: unknown;
    readonly actorReference: unknown;
  }): Promise<
    Readonly<{
      previousState: TicketReservation;
      newState: TicketReservation;
      replayed: boolean;
    }>
  > {
    const reservationId = normalizeTicketReservationId(input.reservationId);
    if (!reservationId) throw new Error("TICKETING_RESERVATION_ID_INVALID");
    const previousState =
      await this.reservations.findReservationById(reservationId);
    if (!previousState) throw new Error("TICKETING_RESERVATION_NOT_FOUND");
    const result = await this.reservations.cancelHold({
      reservationId,
      cancelledAt: input.cancelledAt,
      actorReference: input.actorReference,
    });
    return Object.freeze({
      previousState,
      newState: result.reservation,
      replayed: result.replayed,
    });
  }
}
