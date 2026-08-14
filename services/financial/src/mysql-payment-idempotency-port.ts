import type { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";

import {
  createPaymentIdempotencyKey,
  normalizePaymentId,
  type PaymentId,
  type PaymentIdempotencyClaim,
  type PaymentIdempotencyKey,
  type PaymentIdempotencyPort,
} from "@touristic/financial";

interface ClaimRow extends RowDataPacket {
  idempotency_key: string;
  payment_id: string;
}

function normalizeKey(key: PaymentIdempotencyKey): PaymentIdempotencyKey {
  const prefix = "payment:v1:";
  if (!key.startsWith(prefix)) throw new Error("FINANCIAL_INVALID_IDEMPOTENCY_KEY");
  const normalized = createPaymentIdempotencyKey(key.slice(prefix.length));
  if (!normalized || normalized !== key) {
    throw new Error("FINANCIAL_INVALID_IDEMPOTENCY_KEY");
  }
  return normalized;
}

export class MySqlPaymentIdempotencyPort implements PaymentIdempotencyPort {
  constructor(private readonly pool: Pool) {}

  async claim(
    key: PaymentIdempotencyKey,
    proposedPaymentId: PaymentId,
  ): Promise<PaymentIdempotencyClaim> {
    const normalizedKey = normalizeKey(key);
    const normalizedPaymentId = normalizePaymentId(proposedPaymentId);
    if (!normalizedPaymentId) throw new Error("FINANCIAL_INVALID_PAYMENT_ID");

    const [result] = await this.pool.execute<ResultSetHeader>(
      `INSERT IGNORE INTO financial_payment_idempotency (
        idempotency_key, payment_id, created_at
      ) VALUES (?, ?, UTC_TIMESTAMP(3))`,
      [normalizedKey, normalizedPaymentId],
    );

    const [rows] = await this.pool.execute<ClaimRow[]>(
      `SELECT idempotency_key, payment_id
       FROM financial_payment_idempotency
       WHERE idempotency_key = ?
       LIMIT 1`,
      [normalizedKey],
    );
    const row = rows[0];
    if (!row) {
      throw new Error("FINANCIAL_IDEMPOTENCY_PAYMENT_ID_CONFLICT");
    }
    const claimedPaymentId = normalizePaymentId(row.payment_id);
    if (
      row.idempotency_key !== normalizedKey ||
      !claimedPaymentId ||
      (result.affectedRows !== 0 && result.affectedRows !== 1) ||
      (result.affectedRows === 1 && claimedPaymentId !== normalizedPaymentId)
    ) {
      throw new Error("FINANCIAL_INVALID_PERSISTED_IDEMPOTENCY_CLAIM");
    }

    return Object.freeze({
      claimed: result.affectedRows === 1,
      paymentId: claimedPaymentId,
    });
  }

  async find(key: PaymentIdempotencyKey): Promise<PaymentId | null> {
    const normalizedKey = normalizeKey(key);
    const [rows] = await this.pool.execute<ClaimRow[]>(
      `SELECT idempotency_key, payment_id
       FROM financial_payment_idempotency
       WHERE idempotency_key = ?
       LIMIT 1`,
      [normalizedKey],
    );
    if (!rows[0]) return null;
    const paymentId = normalizePaymentId(rows[0].payment_id);
    if (rows[0].idempotency_key !== normalizedKey || !paymentId) {
      throw new Error("FINANCIAL_INVALID_PERSISTED_IDEMPOTENCY_CLAIM");
    }
    return paymentId;
  }
}
