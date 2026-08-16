import type { Pool, RowDataPacket } from "mysql2/promise";

import {
  createTicketInventoryOffer,
  createTicketReservation,
  type TicketInventoryOffer,
  type TicketReservation,
} from "@touristic/ticketing/reservations";

const HOLDER_REFERENCE = /^[A-Za-z0-9@._:-]{2,120}$/u;

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

function iso(value: Date | string | null): string | null {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime()))
    throw new Error("TICKETING_INVALID_DB_TIMESTAMP");
  return date.toISOString();
}

function inventoryFromRow(row: InventoryRow): TicketInventoryOffer {
  const value = createTicketInventoryOffer({
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
  if (!value) throw new Error("TICKETING_INVALID_PERSISTED_INVENTORY");
  return value;
}

function reservationFromRow(row: ReservationRow): TicketReservation {
  const value = createTicketReservation({
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
    orderId: row.order_id,
    paymentId: row.payment_id,
    createdAt: iso(row.created_at),
    confirmedAt: iso(row.confirmed_at),
    expiredAt: iso(row.expired_at),
    cancelledAt: iso(row.cancelled_at),
    updatedAt: iso(row.updated_at),
  });
  if (!value) throw new Error("TICKETING_INVALID_PERSISTED_RESERVATION");
  return value;
}

export class MySqlTicketingPublicReadRepository {
  constructor(private readonly pool: Pool) {}

  async listInventory(): Promise<readonly TicketInventoryOffer[]> {
    const [rows] = await this.pool.execute<InventoryRow[]>(
      `SELECT * FROM ticketing_inventory
       WHERE enabled = TRUE
       ORDER BY starts_at ASC, inventory_id ASC`,
    );
    return Object.freeze(rows.map(inventoryFromRow));
  }

  async listReservationsByHolderReference(
    holderReferenceInput: unknown,
  ): Promise<readonly TicketReservation[]> {
    const holderReference =
      typeof holderReferenceInput === "string"
        ? holderReferenceInput.trim()
        : "";
    if (!HOLDER_REFERENCE.test(holderReference)) {
      throw new Error("TICKETING_HOLDER_REFERENCE_INVALID");
    }
    const [rows] = await this.pool.execute<ReservationRow[]>(
      `SELECT * FROM ticketing_reservations
       WHERE holder_reference = ?
       ORDER BY created_at DESC, reservation_id DESC`,
      [holderReference],
    );
    return Object.freeze(rows.map(reservationFromRow));
  }
}
