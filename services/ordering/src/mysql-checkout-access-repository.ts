import type { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";

import { normalizeOrderId, type OrderId } from "@touristic/ordering";

import {
  createCheckoutAccessRecord,
  sameCheckoutAccessAuthority,
  type CheckoutAccessRecord,
  type CheckoutAccessRepositoryPort,
} from "./checkout-access.js";

interface CheckoutAccessRow extends RowDataPacket {
  order_id: string;
  payment_id: string;
  request_fingerprint: Buffer;
  token_hash: Buffer;
  requester_kind: string;
  actor_subject: string;
  destination_id: string;
  tenant_id: string | null;
  correlation_id: string;
  created_at: Date | string;
  expires_at: Date | string;
}

const ACCESS_COLUMNS = `
  order_id,
  payment_id,
  request_fingerprint,
  token_hash,
  requester_kind,
  actor_subject,
  destination_id,
  tenant_id,
  correlation_id,
  created_at,
  expires_at
`;

function timestamp(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("ORDERING_INVALID_DB_TIMESTAMP");
  }
  return date.toISOString();
}

function fromRow(row: CheckoutAccessRow): CheckoutAccessRecord {
  const record = createCheckoutAccessRecord({
    orderId: row.order_id,
    paymentId: row.payment_id,
    requestFingerprint: row.request_fingerprint.toString("hex"),
    tokenHash: row.token_hash.toString("hex"),
    context: {
      requesterKind: row.requester_kind as "authenticated" | "guest_capability",
      actorSubject: row.actor_subject,
      destinationId: row.destination_id,
      tenantId: row.tenant_id,
    },
    correlationId: row.correlation_id,
    createdAt: timestamp(row.created_at),
    expiresAt: timestamp(row.expires_at),
  });
  if (!record) {
    throw new Error("ORDERING_INVALID_PERSISTED_CHECKOUT_ACCESS");
  }
  return record;
}

export class MySqlCheckoutAccessRepository implements CheckoutAccessRepositoryPort {
  constructor(private readonly pool: Pool) {}

  async findByOrderId(
    orderIdInput: OrderId,
  ): Promise<CheckoutAccessRecord | null> {
    const orderId = normalizeOrderId(orderIdInput);
    if (!orderId) throw new Error("ORDERING_INVALID_ORDER_ID");
    const [rows] = await this.pool.execute<CheckoutAccessRow[]>(
      `SELECT ${ACCESS_COLUMNS}
       FROM ordering_checkout_access
       WHERE order_id = ?
       LIMIT 1`,
      [orderId],
    );
    return rows[0] ? fromRow(rows[0]) : null;
  }

  async claim(
    recordInput: CheckoutAccessRecord,
  ): Promise<CheckoutAccessRecord> {
    const record = createCheckoutAccessRecord({
      orderId: recordInput.orderId,
      paymentId: recordInput.paymentId,
      requestFingerprint: recordInput.requestFingerprint,
      tokenHash: recordInput.tokenHash,
      context: recordInput,
      correlationId: recordInput.correlationId,
      createdAt: recordInput.createdAt,
      expiresAt: recordInput.expiresAt,
    });
    if (!record) throw new Error("ORDERING_INVALID_CHECKOUT_ACCESS");

    const [result] = await this.pool.execute<ResultSetHeader>(
      `INSERT IGNORE INTO ordering_checkout_access (
        order_id, payment_id, request_fingerprint, token_hash,
        requester_kind, actor_subject, destination_id, tenant_id,
        correlation_id, created_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.orderId,
        record.paymentId,
        Buffer.from(record.requestFingerprint, "hex"),
        Buffer.from(record.tokenHash, "hex"),
        record.requesterKind,
        record.actorSubject,
        record.destinationId,
        record.tenantId,
        record.correlationId,
        new Date(record.createdAt),
        new Date(record.expiresAt),
      ],
    );
    if (result.affectedRows !== 0 && result.affectedRows !== 1) {
      throw new Error("ORDERING_CHECKOUT_ACCESS_WRITE_FAILED");
    }

    const persisted = await this.findByOrderId(record.orderId);
    if (!persisted) {
      throw new Error("ORDERING_CHECKOUT_ACCESS_COLLISION");
    }
    if (!sameCheckoutAccessAuthority(persisted, record)) {
      throw new Error("ORDERING_CHECKOUT_ACCESS_CONFLICT");
    }
    return persisted;
  }
}
