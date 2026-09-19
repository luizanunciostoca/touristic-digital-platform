import { createHash } from "node:crypto";

import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";

const ID = /^[A-Za-z0-9_:-]{3,120}$/u;
const PRODUCT_KIND = /^[a-z][a-z0-9_]{1,39}$/u;
const CURRENCY = /^[A-Z]{3}$/u;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const NAME = /^[\p{L}][\p{L}\p{M}' .-]{1,159}$/u;

export interface CrmCommercePurchaseInput {
  readonly eventId: string;
  readonly reservationId: string;
  readonly holderReference: string;
  readonly holderName: string;
  readonly email: string;
  readonly phone: string | null;
  readonly inventoryId: string;
  readonly orderId: string;
  readonly paymentId: string;
  readonly destinationId: string;
  readonly productKind: string;
  readonly productReference: string;
  readonly quantity: number;
  readonly amountMinor: number;
  readonly currency: string;
  readonly purchasedAt: string;
}

export interface CrmCommerceCustomerRepositoryPort {
  recordConfirmedPurchase(input: CrmCommercePurchaseInput): Promise<{
    readonly customerId: string;
    readonly replayed: boolean;
  }>;
}

interface PurchaseRow extends RowDataPacket {
  event_id: string;
}

function text(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  if (!normalized || normalized.length > max) return "";
  const invalid = [...normalized].some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code <= 31 || code === 127 || character === "<" || character === ">";
  });
  return invalid ? "" : normalized;
}

function timestamp(value: string): Date {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("CRM_COMMERCE_TIMESTAMP_INVALID");
  }
  return date;
}

function customerId(email: string): string {
  return `ccu_${createHash("sha256")
    .update(`crm:commerce-customer:v1:${email}`)
    .digest("hex")
    .slice(0, 40)}`;
}

function validate(input: CrmCommercePurchaseInput): {
  readonly value: CrmCommercePurchaseInput;
  readonly purchasedAt: Date;
  readonly customerId: string;
} {
  const email = text(input.email, 200).toLowerCase();
  const holderName = text(input.holderName, 160);
  const phone =
    input.phone === null || input.phone === ""
      ? null
      : text(input.phone, 40) || null;
  const identifiers = [
    input.eventId,
    input.reservationId,
    input.holderReference,
    input.inventoryId,
    input.orderId,
    input.paymentId,
    input.destinationId,
    input.productReference,
  ].map((value) => text(value, 120));
  if (
    identifiers.some((value) => !ID.test(value)) ||
    !NAME.test(holderName) ||
    !EMAIL.test(email) ||
    (input.phone !== null && input.phone !== "" && !phone) ||
    !PRODUCT_KIND.test(input.productKind) ||
    !Number.isSafeInteger(input.quantity) ||
    input.quantity < 1 ||
    input.quantity > 20 ||
    !Number.isSafeInteger(input.amountMinor) ||
    input.amountMinor <= 0 ||
    !CURRENCY.test(input.currency)
  ) {
    throw new Error("CRM_COMMERCE_PURCHASE_INVALID");
  }
  const purchasedAt = timestamp(input.purchasedAt);
  return Object.freeze({
    value: Object.freeze({
      ...input,
      holderName,
      email,
      phone,
      eventId: identifiers[0] ?? "",
      reservationId: identifiers[1] ?? "",
      holderReference: identifiers[2] ?? "",
      inventoryId: identifiers[3] ?? "",
      orderId: identifiers[4] ?? "",
      paymentId: identifiers[5] ?? "",
      destinationId: identifiers[6] ?? "",
      productReference: identifiers[7] ?? "",
    }),
    purchasedAt,
    customerId: customerId(email),
  });
}

async function existingPurchase(
  connection: PoolConnection,
  eventId: string,
): Promise<boolean> {
  const [rows] = await connection.execute<PurchaseRow[]>(
    "SELECT event_id FROM crm_commerce_purchases WHERE event_id = ? LIMIT 1 FOR UPDATE",
    [eventId],
  );
  return rows.length > 0;
}

export class MySqlCrmCommerceCustomerRepository implements CrmCommerceCustomerRepositoryPort {
  constructor(private readonly pool: Pool) {}

  async recordConfirmedPurchase(
    input: CrmCommercePurchaseInput,
  ): Promise<{ readonly customerId: string; readonly replayed: boolean }> {
    const normalized = validate(input);
    const value = normalized.value;
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(
        `INSERT INTO crm_commerce_customers (
          customer_id, holder_reference, full_name, email, phone,
          marketing_opt_in, first_purchase_at, last_purchase_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, FALSE, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          holder_reference = VALUES(holder_reference),
          full_name = VALUES(full_name),
          phone = VALUES(phone),
          first_purchase_at = LEAST(first_purchase_at, VALUES(first_purchase_at)),
          last_purchase_at = GREATEST(last_purchase_at, VALUES(last_purchase_at)),
          updated_at = GREATEST(updated_at, VALUES(updated_at))`,
        [
          normalized.customerId,
          value.holderReference,
          value.holderName,
          value.email,
          value.phone,
          normalized.purchasedAt,
          normalized.purchasedAt,
          normalized.purchasedAt,
          normalized.purchasedAt,
        ],
      );

      const replayed = await existingPurchase(connection, value.eventId);
      if (!replayed) {
        await connection.execute(
          `INSERT INTO crm_commerce_purchases (
            event_id, customer_id, reservation_id, inventory_id, order_id,
            payment_id, destination_id, product_kind, product_reference,
            quantity, amount_minor, currency, purchased_at, source, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'morro_digital_ticketing', ?)`,
          [
            value.eventId,
            normalized.customerId,
            value.reservationId,
            value.inventoryId,
            value.orderId,
            value.paymentId,
            value.destinationId,
            value.productKind,
            value.productReference,
            value.quantity,
            value.amountMinor,
            value.currency,
            normalized.purchasedAt,
            normalized.purchasedAt,
          ],
        );
      }

      await connection.commit();
      return Object.freeze({
        customerId: normalized.customerId,
        replayed,
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}
