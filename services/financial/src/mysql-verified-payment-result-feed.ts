import type { Pool, RowDataPacket } from "mysql2/promise";

import {
  normalizeVerifiedPaymentResult,
  type VerifiedPaymentResult,
} from "@touristic/financial";

export interface VerifiedPaymentResultCursor {
  readonly recordedAt: string;
  readonly resultId: string;
}

export interface VerifiedPaymentResultFeedPort {
  listAfter(
    cursor: VerifiedPaymentResultCursor | null,
    limit: number,
  ): Promise<readonly VerifiedPaymentResult[]>;
}

interface ResultRow extends RowDataPacket {
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

function timestamp(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("FINANCIAL_INVALID_DB_TIMESTAMP");
  }
  return date.toISOString();
}

function fromRow(row: ResultRow): VerifiedPaymentResult {
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

export class MySqlVerifiedPaymentResultFeed
  implements VerifiedPaymentResultFeedPort
{
  constructor(private readonly pool: Pool) {}

  async listAfter(
    cursor: VerifiedPaymentResultCursor | null,
    limit: number,
  ): Promise<readonly VerifiedPaymentResult[]> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
      throw new Error("FINANCIAL_PAYMENT_RESULT_FEED_LIMIT_INVALID");
    }
    const [rows] = cursor
      ? await this.pool.execute<ResultRow[]>(
          `SELECT result_id, provider_event_id, payment_id, order_reference,
                  result_kind, payment_status, payment_reference,
                  occurred_at, recorded_at
           FROM financial_payment_results
           WHERE recorded_at > ? OR (recorded_at = ? AND result_id > ?)
           ORDER BY recorded_at ASC, result_id ASC
           LIMIT ?`,
          [new Date(cursor.recordedAt), new Date(cursor.recordedAt), cursor.resultId, limit],
        )
      : await this.pool.execute<ResultRow[]>(
          `SELECT result_id, provider_event_id, payment_id, order_reference,
                  result_kind, payment_status, payment_reference,
                  occurred_at, recorded_at
           FROM financial_payment_results
           ORDER BY recorded_at ASC, result_id ASC
           LIMIT ?`,
          [limit],
        );
    return Object.freeze(rows.map(fromRow));
  }
}
