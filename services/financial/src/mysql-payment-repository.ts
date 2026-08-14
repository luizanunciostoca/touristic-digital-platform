import type { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";

import {
  assertPaymentTransition,
  createMoney,
  createPaymentIdempotencyKey,
  normalizeFinancialReference,
  normalizeFinancialTimestamp,
  normalizePaymentId,
  type Payment,
  type PaymentId,
  type PaymentRepositoryPort,
} from "@touristic/financial";

import { normalizePaymentForPersistence } from "./payment-validation.js";

interface PaymentRow extends RowDataPacket {
  payment_id: string;
  idempotency_key: string;
  subject_kind: string;
  subject_reference: string;
  amount_minor: number | string;
  currency: string;
  status: string;
  provider_reference: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  confirmed_at: Date | string | null;
  refunded_at: Date | string | null;
}

const PAYMENT_COLUMNS = `
  payment_id,
  idempotency_key,
  subject_kind,
  subject_reference,
  amount_minor,
  currency,
  status,
  provider_reference,
  created_at,
  updated_at,
  confirmed_at,
  refunded_at
`;

function timestamp(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("FINANCIAL_INVALID_DB_TIMESTAMP");
  }
  return date.toISOString();
}

function optionalTimestamp(value: Date | string | null): string | null {
  return value === null ? null : timestamp(value);
}

function fromRow(row: PaymentRow): Payment {
  const id = normalizePaymentId(row.payment_id);
  const subjectReference = normalizeFinancialReference(
    row.subject_reference,
    120,
  );
  const idempotencyKey = createPaymentIdempotencyKey(subjectReference);
  const amount = createMoney(Number(row.amount_minor), row.currency);
  const createdAt = normalizeFinancialTimestamp(timestamp(row.created_at));
  const updatedAt = normalizeFinancialTimestamp(timestamp(row.updated_at));
  const confirmedAt = optionalTimestamp(row.confirmed_at);
  const refundedAt = optionalTimestamp(row.refunded_at);

  if (
    !id ||
    row.subject_kind !== "order" ||
    !subjectReference ||
    !idempotencyKey ||
    row.idempotency_key !== idempotencyKey ||
    !amount ||
    !createdAt ||
    !updatedAt
  ) {
    throw new Error("FINANCIAL_INVALID_PERSISTED_PAYMENT");
  }

  return normalizePaymentForPersistence({
    id,
    idempotencyKey,
    subject: { kind: "order", reference: subjectReference },
    amount,
    status: row.status as Payment["status"],
    providerReference: row.provider_reference,
    createdAt,
    updatedAt,
    confirmedAt,
    refundedAt,
  });
}

function sameImmutablePayment(left: Payment, right: Payment): boolean {
  return (
    left.id === right.id &&
    left.idempotencyKey === right.idempotencyKey &&
    left.subject.kind === right.subject.kind &&
    left.subject.reference === right.subject.reference &&
    left.amount.minorUnits === right.amount.minorUnits &&
    left.amount.currency === right.amount.currency &&
    left.createdAt === right.createdAt
  );
}

function sameMutablePayment(left: Payment, right: Payment): boolean {
  return (
    left.status === right.status &&
    left.providerReference === right.providerReference &&
    left.updatedAt === right.updatedAt &&
    left.confirmedAt === right.confirmedAt &&
    left.refundedAt === right.refundedAt
  );
}

export class MySqlPaymentRepository implements PaymentRepositoryPort {
  constructor(private readonly pool: Pool) {}

  async findById(paymentId: PaymentId): Promise<Payment | null> {
    const normalizedId = normalizePaymentId(paymentId);
    if (!normalizedId) throw new Error("FINANCIAL_INVALID_PAYMENT_ID");
    const [rows] = await this.pool.execute<PaymentRow[]>(
      `SELECT ${PAYMENT_COLUMNS} FROM financial_payments WHERE payment_id = ? LIMIT 1`,
      [normalizedId],
    );
    return rows[0] ? fromRow(rows[0]) : null;
  }

  private async findByIdempotencyKey(
    idempotencyKey: Payment["idempotencyKey"],
  ): Promise<Payment | null> {
    const [rows] = await this.pool.execute<PaymentRow[]>(
      `SELECT ${PAYMENT_COLUMNS} FROM financial_payments WHERE idempotency_key = ? LIMIT 1`,
      [idempotencyKey],
    );
    return rows[0] ? fromRow(rows[0]) : null;
  }

  async save(payment: Payment): Promise<Payment> {
    const normalized = normalizePaymentForPersistence(payment);
    await this.pool.execute(
      `INSERT IGNORE INTO financial_payments (
        payment_id, idempotency_key, subject_kind, subject_reference,
        amount_minor, currency, status, provider_reference,
        created_at, updated_at, confirmed_at, refunded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        normalized.id,
        normalized.idempotencyKey,
        normalized.subject.kind,
        normalized.subject.reference,
        normalized.amount.minorUnits,
        normalized.amount.currency,
        normalized.status,
        normalized.providerReference,
        new Date(normalized.createdAt),
        new Date(normalized.updatedAt),
        normalized.confirmedAt ? new Date(normalized.confirmedAt) : null,
        normalized.refundedAt ? new Date(normalized.refundedAt) : null,
      ],
    );

    let persisted = await this.findById(normalized.id);
    if (!persisted) {
      const conflicting = await this.findByIdempotencyKey(
        normalized.idempotencyKey,
      );
      if (conflicting)
        throw new Error("FINANCIAL_PAYMENT_IDEMPOTENCY_CONFLICT");
      throw new Error("FINANCIAL_PAYMENT_NOT_PERSISTED");
    }
    if (!sameImmutablePayment(persisted, normalized)) {
      throw new Error("FINANCIAL_IMMUTABLE_PAYMENT_CONFLICT");
    }

    if (!sameMutablePayment(persisted, normalized)) {
      assertPaymentTransition(persisted.status, normalized.status);
      if (Date.parse(normalized.updatedAt) <= Date.parse(persisted.updatedAt)) {
        throw new Error("FINANCIAL_STALE_PAYMENT_UPDATE");
      }
      if (
        (persisted.providerReference !== null &&
          normalized.providerReference !== persisted.providerReference) ||
        (persisted.confirmedAt !== null &&
          normalized.confirmedAt !== persisted.confirmedAt) ||
        (persisted.refundedAt !== null &&
          normalized.refundedAt !== persisted.refundedAt)
      ) {
        throw new Error("FINANCIAL_PAYMENT_LIFECYCLE_CONFLICT");
      }

      const [result] = await this.pool.execute<ResultSetHeader>(
        `UPDATE financial_payments
         SET status = ?, provider_reference = ?, updated_at = ?,
             confirmed_at = ?, refunded_at = ?
         WHERE payment_id = ? AND idempotency_key = ?
           AND status = ? AND updated_at = ?
           AND provider_reference <=> ?
           AND confirmed_at <=> ?
           AND refunded_at <=> ?`,
        [
          normalized.status,
          normalized.providerReference,
          new Date(normalized.updatedAt),
          normalized.confirmedAt ? new Date(normalized.confirmedAt) : null,
          normalized.refundedAt ? new Date(normalized.refundedAt) : null,
          normalized.id,
          normalized.idempotencyKey,
          persisted.status,
          new Date(persisted.updatedAt),
          persisted.providerReference,
          persisted.confirmedAt ? new Date(persisted.confirmedAt) : null,
          persisted.refundedAt ? new Date(persisted.refundedAt) : null,
        ],
      );
      if (result.affectedRows !== 1) {
        throw new Error("FINANCIAL_CONCURRENT_PAYMENT_MODIFICATION");
      }

      persisted = await this.findById(normalized.id);
      if (!persisted) throw new Error("FINANCIAL_PAYMENT_NOT_PERSISTED");
      if (
        !sameImmutablePayment(persisted, normalized) ||
        !sameMutablePayment(persisted, normalized)
      ) {
        throw new Error("FINANCIAL_CONCURRENT_PAYMENT_MODIFICATION");
      }
    }

    return persisted;
  }
}
