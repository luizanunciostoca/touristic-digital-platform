import type { Pool, RowDataPacket } from "mysql2/promise";

import {
  normalizeProviderEventId,
  normalizeVerifiedPaymentResult,
  type PaymentId,
  type ProviderEventId,
  type VerifiedPaymentResult,
  type VerifiedPaymentResultRepositoryPort,
  type VerifiedPaymentTerminalStatus,
} from "@touristic/financial";

interface PaymentResultRow extends RowDataPacket {
  result_id: string;
  provider_event_id: string;
  payment_id: string;
  order_reference: string;
  result_kind: string;
  payment_status: string;
  payment_reference: string | null;
  occurred_at: Date | string;
  recorded_at: Date | string;
}

const columns = `
  result_id, provider_event_id, payment_id, order_reference,
  result_kind, payment_status, payment_reference, occurred_at, recorded_at
`;

function timestamp(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("FINANCIAL_INVALID_DB_TIMESTAMP");
  }
  return date.toISOString();
}

function fromRow(row: PaymentResultRow): VerifiedPaymentResult {
  const result = normalizeVerifiedPaymentResult({
    resultId: row.result_id,
    providerEventId: row.provider_event_id,
    paymentId: row.payment_id,
    orderReference: row.order_reference,
    kind: row.result_kind,
    paymentStatus: row.payment_status,
    paymentReference: row.payment_reference,
    occurredAt: timestamp(row.occurred_at),
    recordedAt: timestamp(row.recorded_at),
  });
  if (!result) throw new Error("FINANCIAL_INVALID_PERSISTED_PAYMENT_RESULT");
  return result;
}

function sameResult(
  left: VerifiedPaymentResult,
  right: VerifiedPaymentResult,
): boolean {
  return (
    left.resultId === right.resultId &&
    left.providerEventId === right.providerEventId &&
    left.paymentId === right.paymentId &&
    left.orderReference === right.orderReference &&
    left.kind === right.kind &&
    left.paymentStatus === right.paymentStatus &&
    left.paymentReference === right.paymentReference &&
    left.occurredAt === right.occurredAt &&
    left.recordedAt === right.recordedAt
  );
}

function compatibleTransitionResult(
  left: VerifiedPaymentResult,
  right: VerifiedPaymentResult,
): boolean {
  return (
    left.resultId === right.resultId &&
    left.paymentId === right.paymentId &&
    left.orderReference === right.orderReference &&
    left.kind === right.kind &&
    left.paymentStatus === right.paymentStatus &&
    left.paymentReference === right.paymentReference
  );
}

export class MySqlVerifiedPaymentResultRepository
  implements VerifiedPaymentResultRepositoryPort
{
  constructor(private readonly pool: Pool) {}

  async findByProviderEventId(
    providerEventIdInput: ProviderEventId,
  ): Promise<VerifiedPaymentResult | null> {
    const providerEventId = normalizeProviderEventId(providerEventIdInput);
    if (!providerEventId) {
      throw new Error("FINANCIAL_INVALID_PROVIDER_EVENT_ID");
    }
    const [rows] = await this.pool.execute<PaymentResultRow[]>(
      `SELECT ${columns}
       FROM financial_payment_results
       WHERE provider_event_id = ?
       LIMIT 1`,
      [providerEventId],
    );
    return rows[0] ? fromRow(rows[0]) : null;
  }

  async findByPaymentStatus(
    paymentId: PaymentId,
    paymentStatus: VerifiedPaymentTerminalStatus,
  ): Promise<VerifiedPaymentResult | null> {
    const [rows] = await this.pool.execute<PaymentResultRow[]>(
      `SELECT ${columns}
       FROM financial_payment_results
       WHERE payment_id = ? AND payment_status = ?
       LIMIT 1`,
      [paymentId, paymentStatus],
    );
    return rows[0] ? fromRow(rows[0]) : null;
  }

  async save(input: VerifiedPaymentResult): Promise<VerifiedPaymentResult> {
    const result = normalizeVerifiedPaymentResult(input);
    if (!result) throw new Error("FINANCIAL_INVALID_PAYMENT_RESULT");
    await this.pool.execute(
      `INSERT IGNORE INTO financial_payment_results (
         result_id, provider_event_id, payment_id, order_reference,
         result_kind, payment_status, payment_reference, occurred_at, recorded_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        result.resultId,
        result.providerEventId,
        result.paymentId,
        result.orderReference,
        result.kind,
        result.paymentStatus,
        result.paymentReference,
        new Date(result.occurredAt),
        new Date(result.recordedAt),
      ],
    );
    const byEvent = await this.findByProviderEventId(result.providerEventId);
    if (byEvent) {
      if (!sameResult(byEvent, result)) {
        throw new Error("FINANCIAL_PAYMENT_RESULT_EVENT_CONFLICT");
      }
      return byEvent;
    }
    const byStatus = await this.findByPaymentStatus(
      result.paymentId,
      result.paymentStatus,
    );
    if (byStatus && compatibleTransitionResult(byStatus, result)) {
      return byStatus;
    }
    throw new Error("FINANCIAL_PAYMENT_RESULT_NOT_PERSISTED");
  }
}
