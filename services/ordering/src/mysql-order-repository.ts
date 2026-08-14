import type { Pool, RowDataPacket } from "mysql2/promise";

import {
  createOrder,
  normalizeOrderId,
  normalizeOrderRequestKey,
  type Order,
  type OrderId,
  type OrderRepositoryPort,
  type OrderRequestKey,
} from "@touristic/ordering";

interface OrderRow extends RowDataPacket {
  order_id: string;
  request_key: string;
  source_kind: string;
  source_reference: string;
  status: string;
  plan_id: string;
  plan_name: string;
  amount_minor: number | string;
  currency: string;
  pricing_version: string;
  pricing_captured_at: Date | string;
  created_at: Date | string;
  updated_at: Date | string;
}

const ORDER_COLUMNS = `
  order_id,
  request_key,
  source_kind,
  source_reference,
  status,
  plan_id,
  plan_name,
  amount_minor,
  currency,
  pricing_version,
  pricing_captured_at,
  created_at,
  updated_at
`;

function timestamp(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("ORDERING_INVALID_DB_TIMESTAMP");
  }
  return date.toISOString();
}

function fromRow(row: OrderRow): Order {
  const id = normalizeOrderId(row.order_id);
  const requestKey = normalizeOrderRequestKey(row.request_key);
  if (!id || !requestKey || row.source_kind !== "business_onboarding") {
    throw new Error("ORDERING_INVALID_PERSISTED_ORDER");
  }

  const order = createOrder({
    id,
    requestKey,
    source: {
      kind: "business_onboarding",
      reference: row.source_reference,
    },
    status: row.status as Order["status"],
    pricing: {
      planId: row.plan_id,
      planName: row.plan_name,
      amount: {
        minorUnits: Number(row.amount_minor),
        currency: row.currency as Order["pricing"]["amount"]["currency"],
      },
      pricingVersion: row.pricing_version,
      capturedAt: timestamp(row.pricing_captured_at),
    },
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
  });
  if (!order) throw new Error("ORDERING_INVALID_PERSISTED_ORDER");
  return order;
}

function normalizeOrder(order: Order): Order {
  const normalized = createOrder({
    id: order.id,
    requestKey: order.requestKey,
    source: order.source,
    status: order.status,
    pricing: {
      ...order.pricing,
      capturedAt: timestamp(order.pricing.capturedAt),
    },
    createdAt: timestamp(order.createdAt),
    updatedAt: timestamp(order.updatedAt),
  });
  if (!normalized) throw new Error("ORDERING_INVALID_ORDER");
  return normalized;
}

function sameImmutableOrder(left: Order, right: Order): boolean {
  return (
    left.id === right.id &&
    left.requestKey === right.requestKey &&
    left.source.kind === right.source.kind &&
    left.source.reference === right.source.reference &&
    left.pricing.planId === right.pricing.planId &&
    left.pricing.planName === right.pricing.planName &&
    left.pricing.amount.minorUnits === right.pricing.amount.minorUnits &&
    left.pricing.amount.currency === right.pricing.amount.currency &&
    left.pricing.pricingVersion === right.pricing.pricingVersion &&
    left.pricing.capturedAt === right.pricing.capturedAt &&
    left.createdAt === right.createdAt
  );
}

export class MySqlOrderRepository implements OrderRepositoryPort {
  constructor(private readonly pool: Pool) {}

  async findById(orderId: OrderId): Promise<Order | null> {
    const normalizedId = normalizeOrderId(orderId);
    if (!normalizedId) throw new Error("ORDERING_INVALID_ORDER_ID");
    const [rows] = await this.pool.execute<OrderRow[]>(
      `SELECT ${ORDER_COLUMNS} FROM ordering_orders WHERE order_id = ? LIMIT 1`,
      [normalizedId],
    );
    return rows[0] ? fromRow(rows[0]) : null;
  }

  async findByRequestKey(requestKey: OrderRequestKey): Promise<Order | null> {
    const normalizedKey = normalizeOrderRequestKey(requestKey);
    if (!normalizedKey) throw new Error("ORDERING_INVALID_REQUEST_KEY");
    const [rows] = await this.pool.execute<OrderRow[]>(
      `SELECT ${ORDER_COLUMNS} FROM ordering_orders WHERE request_key = ? LIMIT 1`,
      [normalizedKey],
    );
    return rows[0] ? fromRow(rows[0]) : null;
  }

  async save(order: Order): Promise<Order> {
    const normalized = normalizeOrder(order);
    await this.pool.execute(
      `INSERT IGNORE INTO ordering_orders (
        order_id, request_key, source_kind, source_reference, status,
        plan_id, plan_name, amount_minor, currency, pricing_version,
        pricing_captured_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        normalized.id,
        normalized.requestKey,
        normalized.source.kind,
        normalized.source.reference,
        normalized.status,
        normalized.pricing.planId,
        normalized.pricing.planName,
        normalized.pricing.amount.minorUnits,
        normalized.pricing.amount.currency,
        normalized.pricing.pricingVersion,
        new Date(normalized.pricing.capturedAt),
        new Date(normalized.createdAt),
        new Date(normalized.updatedAt),
      ],
    );

    let persisted = await this.findById(normalized.id);
    if (!persisted) {
      const conflicting = await this.findByRequestKey(normalized.requestKey);
      if (conflicting) throw new Error("ORDERING_REQUEST_KEY_CONFLICT");
      throw new Error("ORDERING_ORDER_NOT_PERSISTED");
    }
    if (!sameImmutableOrder(persisted, normalized)) {
      throw new Error("ORDERING_IMMUTABLE_ORDER_CONFLICT");
    }

    if (
      persisted.status !== normalized.status ||
      persisted.updatedAt !== normalized.updatedAt
    ) {
      await this.pool.execute(
        `UPDATE ordering_orders
         SET status = ?, updated_at = ?
         WHERE order_id = ? AND request_key = ?`,
        [
          normalized.status,
          new Date(normalized.updatedAt),
          normalized.id,
          normalized.requestKey,
        ],
      );
      persisted = await this.findById(normalized.id);
      if (!persisted) throw new Error("ORDERING_ORDER_NOT_PERSISTED");
    }

    return persisted;
  }
}
