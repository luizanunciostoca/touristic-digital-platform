import { createHash } from "node:crypto";

import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";

import {
  normalizeTicketAdmissionProfile,
  type TicketAdmissionProfile,
} from "@touristic/ticketing/reservations";

const BUSINESS_ID = /^[a-z0-9][a-z0-9_-]{0,119}$/u;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{8,120}$/u;
const CURRENCY = /^[A-Z]{3}$/u;
const PRODUCT_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/u;
export type MorroProAdmissionProfile = TicketAdmissionProfile;

export interface MorroProInventoryOffer {
  readonly id: string;
  readonly businessId: string;
  readonly destinationId: string;
  readonly productKind: "tour" | "business_experience" | "transport";
  readonly productReference: string;
  readonly label: string;
  readonly unitAmountMinor: number;
  readonly currency: string;
  readonly pricingVersion: string;
  readonly capacity: number;
  readonly maxPerReservation: number;
  readonly salesStartAt: string;
  readonly salesEndAt: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly enabled: boolean;
  readonly admission?: MorroProAdmissionProfile;
}

export interface TicketingBusinessInventoryRepositoryPort {
  listByBusiness(
    businessId: string,
  ): Promise<readonly MorroProInventoryOffer[]>;
  createForBusiness(input: {
    readonly businessId: string;
    readonly destinationId: string;
    readonly requestKey: string;
    readonly actorSubject: string;
    readonly offer: unknown;
    readonly recordedAt: string;
  }): Promise<{
    readonly offer: MorroProInventoryOffer;
    readonly replayed: boolean;
  }>;
  disableForBusiness(input: {
    readonly businessId: string;
    readonly inventoryId: string;
    readonly actorSubject: string;
    readonly recordedAt: string;
  }): Promise<MorroProInventoryOffer | null>;
}

interface BusinessInventoryRow extends RowDataPacket {
  inventory_id: string;
  business_id: string;
  destination_id: string;
  product_kind: "tour" | "business_experience" | "transport";
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
  admission_offering_id: string | null;
  admission_place_id: string | null;
  admission_subtype: "sunset" | "event" | "party" | null;
  admission_ticket_type: string | null;
  admission_tier_label: string | null;
  admission_display_order: number | null;
}

function iso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime()))
    throw new Error("MORRO_PRO_TIMESTAMP_INVALID");
  return date.toISOString();
}

function asSafeInteger(
  value: unknown,
  minimum: number,
  maximum: number,
): number | null {
  const number = typeof value === "number" ? value : Number.NaN;
  return Number.isSafeInteger(number) && number >= minimum && number <= maximum
    ? number
    : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeAdmissionProfile(
  value: unknown,
  productKind: "tour" | "business_experience" | "transport",
): MorroProAdmissionProfile | null {
  if (value === undefined || value === null) return null;
  if (productKind !== "business_experience") {
    throw new Error("MORRO_PRO_ADMISSION_PRODUCT_KIND_INVALID");
  }
  const admission = normalizeTicketAdmissionProfile(value);
  if (!admission) throw new Error("MORRO_PRO_ADMISSION_INVALID");
  return admission;
}

function canonicalBusinessId(value: unknown): string {
  const candidate = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!BUSINESS_ID.test(candidate))
    throw new Error("MORRO_PRO_BUSINESS_ID_INVALID");
  return candidate;
}

function canonicalTimestamp(value: unknown, code: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(code);
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) throw new Error(code);
  return timestamp.toISOString();
}

function normalizeOffer(
  input: unknown,
  destinationId: string,
): Omit<MorroProInventoryOffer, "id" | "businessId" | "enabled"> {
  const value = record(input);
  if (!value) throw new Error("MORRO_PRO_OFFER_INVALID");
  const productKind =
    value.productKind === "tour" ||
    value.productKind === "business_experience" ||
    value.productKind === "transport"
      ? value.productKind
      : null;
  const label = typeof value.label === "string" ? value.label.trim() : "";
  const productReference =
    typeof value.productReference === "string"
      ? value.productReference.trim()
      : "";
  const currency =
    typeof value.currency === "string"
      ? value.currency.trim().toUpperCase()
      : "";
  const pricingVersion =
    typeof value.pricingVersion === "string" && value.pricingVersion.trim()
      ? value.pricingVersion.trim().slice(0, 80)
      : "morro-pro-v1";
  const admission = productKind
    ? normalizeAdmissionProfile(value.admission, productKind)
    : null;
  const unitAmountMinor = asSafeInteger(
    value.unitAmountMinor,
    1,
    Number.MAX_SAFE_INTEGER,
  );
  const capacity = asSafeInteger(value.capacity, 1, 100_000);
  const maxPerReservation = asSafeInteger(value.maxPerReservation, 1, 20);
  const salesStartAt = canonicalTimestamp(
    value.salesStartAt,
    "MORRO_PRO_SALES_START_INVALID",
  );
  const salesEndAt = canonicalTimestamp(
    value.salesEndAt,
    "MORRO_PRO_SALES_END_INVALID",
  );
  const startsAt = canonicalTimestamp(
    value.startsAt,
    "MORRO_PRO_START_INVALID",
  );
  const endsAt = canonicalTimestamp(value.endsAt, "MORRO_PRO_END_INVALID");

  if (
    !productKind ||
    label.length < 2 ||
    label.length > 160 ||
    !PRODUCT_REFERENCE.test(productReference) ||
    !CURRENCY.test(currency) ||
    unitAmountMinor === null ||
    capacity === null ||
    maxPerReservation === null ||
    maxPerReservation > capacity ||
    Date.parse(salesStartAt) >= Date.parse(salesEndAt) ||
    Date.parse(salesEndAt) > Date.parse(startsAt) ||
    Date.parse(startsAt) >= Date.parse(endsAt)
  ) {
    throw new Error("MORRO_PRO_OFFER_INVALID");
  }

  return Object.freeze({
    destinationId,
    productKind,
    productReference,
    label,
    unitAmountMinor,
    currency,
    pricingVersion,
    capacity,
    maxPerReservation,
    salesStartAt,
    salesEndAt,
    startsAt,
    endsAt,
    ...(admission ? { admission } : {}),
  });
}

function fromRow(row: BusinessInventoryRow): MorroProInventoryOffer {
  const admission =
    row.admission_offering_id &&
    row.admission_place_id &&
    row.admission_subtype &&
    row.admission_ticket_type &&
    row.admission_display_order !== null
      ? Object.freeze({
          offeringId: row.admission_offering_id,
          placeId: row.admission_place_id,
          subtype: row.admission_subtype,
          ticketType: row.admission_ticket_type,
          tierLabel: row.admission_tier_label,
          displayOrder: row.admission_display_order,
        })
      : null;
  return Object.freeze({
    id: row.inventory_id,
    businessId: row.business_id,
    destinationId: row.destination_id,
    productKind: row.product_kind,
    productReference: row.product_reference,
    label: row.label,
    unitAmountMinor: Number(row.unit_amount_minor),
    currency: row.currency,
    pricingVersion: row.pricing_version,
    capacity: row.capacity,
    maxPerReservation: row.max_per_reservation,
    salesStartAt: iso(row.sales_start_at),
    salesEndAt: iso(row.sales_end_at),
    startsAt: iso(row.starts_at),
    endsAt: iso(row.ends_at),
    enabled: Boolean(row.enabled),
    ...(admission ? { admission } : {}),
  });
}

const SELECT_OWNED = `SELECT
    i.*,
    o.business_id,
    p.offering_id AS admission_offering_id,
    p.place_id AS admission_place_id,
    p.admission_subtype AS admission_subtype,
    p.ticket_type AS admission_ticket_type,
    p.tier_label AS admission_tier_label,
    p.display_order AS admission_display_order
  FROM ticketing_inventory AS i
  INNER JOIN ticketing_inventory_ownership AS o
    ON o.inventory_id = i.inventory_id
  LEFT JOIN ticketing_admission_profiles AS p
    ON p.inventory_id = i.inventory_id`;

async function ownedById(
  connection: PoolConnection,
  inventoryId: string,
): Promise<MorroProInventoryOffer | null> {
  const [rows] = await connection.execute<BusinessInventoryRow[]>(
    `${SELECT_OWNED} WHERE i.inventory_id = ? FOR UPDATE`,
    [inventoryId],
  );
  return rows[0] ? fromRow(rows[0]) : null;
}

export class MySqlTicketingBusinessInventoryRepository implements TicketingBusinessInventoryRepositoryPort {
  constructor(private readonly pool: Pool) {}

  async listByBusiness(
    businessIdInput: string,
  ): Promise<readonly MorroProInventoryOffer[]> {
    const businessId = canonicalBusinessId(businessIdInput);
    const [rows] = await this.pool.execute<BusinessInventoryRow[]>(
      `${SELECT_OWNED} WHERE o.business_id = ? ORDER BY i.starts_at ASC, i.inventory_id ASC`,
      [businessId],
    );
    return Object.freeze(rows.map(fromRow));
  }

  async createForBusiness(input: {
    readonly businessId: string;
    readonly destinationId: string;
    readonly requestKey: string;
    readonly actorSubject: string;
    readonly offer: unknown;
    readonly recordedAt: string;
  }): Promise<{
    readonly offer: MorroProInventoryOffer;
    readonly replayed: boolean;
  }> {
    const businessId = canonicalBusinessId(input.businessId);
    const destinationId = canonicalBusinessId(input.destinationId);
    if (!IDEMPOTENCY_KEY.test(input.requestKey))
      throw new Error("MORRO_PRO_IDEMPOTENCY_INVALID");
    if (!input.actorSubject.trim()) throw new Error("MORRO_PRO_ACTOR_INVALID");
    const recordedAt = canonicalTimestamp(
      input.recordedAt,
      "MORRO_PRO_RECORDED_AT_INVALID",
    );
    const offer = normalizeOffer(input.offer, destinationId);
    const inventoryId = `mpi_${createHash("sha256")
      .update(`morro-pro:v1:${businessId}:${input.requestKey}`)
      .digest("hex")
      .slice(0, 32)}`;
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const existing = await ownedById(connection, inventoryId);
      if (existing) {
        if (existing.businessId !== businessId)
          throw new Error("MORRO_PRO_OWNERSHIP_CONFLICT");
        await connection.commit();
        return Object.freeze({ offer: existing, replayed: true });
      }
      const [unowned] = await connection.execute<RowDataPacket[]>(
        "SELECT inventory_id FROM ticketing_inventory WHERE inventory_id = ? FOR UPDATE",
        [inventoryId],
      );
      if (unowned.length > 0) throw new Error("MORRO_PRO_OWNERSHIP_CONFLICT");

      await connection.execute(
        `INSERT INTO ticketing_inventory (
          inventory_id, destination_id, product_kind, product_reference, label,
          unit_amount_minor, currency, pricing_version, capacity, max_per_reservation,
          sales_start_at, sales_end_at, starts_at, ends_at, enabled, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, ?, ?)`,
        [
          inventoryId,
          offer.destinationId,
          offer.productKind,
          offer.productReference,
          offer.label,
          offer.unitAmountMinor,
          offer.currency,
          offer.pricingVersion,
          offer.capacity,
          offer.maxPerReservation,
          offer.salesStartAt,
          offer.salesEndAt,
          offer.startsAt,
          offer.endsAt,
          recordedAt,
          recordedAt,
        ],
      );
      await connection.execute(
        `INSERT INTO ticketing_inventory_ownership (
          inventory_id, business_id, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?)`,
        [inventoryId, businessId, input.actorSubject, recordedAt, recordedAt],
      );
      if (offer.admission) {
        await connection.execute(
          `INSERT INTO ticketing_admission_profiles (
            inventory_id, offering_id, place_id, admission_subtype,
            ticket_type, tier_label, display_order, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            inventoryId,
            offer.admission.offeringId,
            offer.admission.placeId,
            offer.admission.subtype,
            offer.admission.ticketType,
            offer.admission.tierLabel,
            offer.admission.displayOrder,
            recordedAt,
            recordedAt,
          ],
        );
      }
      const created = await ownedById(connection, inventoryId);
      if (!created) throw new Error("MORRO_PRO_CREATE_FAILED");
      await connection.commit();
      return Object.freeze({ offer: created, replayed: false });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async disableForBusiness(input: {
    readonly businessId: string;
    readonly inventoryId: string;
    readonly actorSubject: string;
    readonly recordedAt: string;
  }): Promise<MorroProInventoryOffer | null> {
    const businessId = canonicalBusinessId(input.businessId);
    if (!/^mpi_[a-f0-9]{32}$/u.test(input.inventoryId)) return null;
    const recordedAt = canonicalTimestamp(
      input.recordedAt,
      "MORRO_PRO_RECORDED_AT_INVALID",
    );
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const existing = await ownedById(connection, input.inventoryId);
      if (!existing || existing.businessId !== businessId) {
        await connection.rollback();
        return null;
      }
      await connection.execute(
        "UPDATE ticketing_inventory SET enabled = FALSE, updated_at = ? WHERE inventory_id = ?",
        [recordedAt, input.inventoryId],
      );
      const disabled = await ownedById(connection, input.inventoryId);
      await connection.commit();
      return disabled;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}
