import type { Pool, RowDataPacket } from "mysql2/promise";

import type { VerifiedPaymentResult } from "@touristic/financial";

import type { VerifiedRefundTicketCancellationHandler } from "./refund-cancellation.js";
import type { VerifiedPaymentTicketFulfillmentHandler } from "./verified-payment-fulfillment-handler.js";

export interface FinancialResultCursor {
  readonly recordedAt: string;
  readonly resultId: string;
}

export interface VerifiedFinancialResultFeedPort {
  listAfter(
    cursor: FinancialResultCursor | null,
    limit: number,
  ): Promise<readonly VerifiedPaymentResult[]>;
}

export interface FinancialResultCursorRepositoryPort {
  load(): Promise<FinancialResultCursor | null>;
  save(cursor: FinancialResultCursor): Promise<void>;
}

export interface VerifiedFinancialResultProcessor {
  drain(limit?: number): Promise<{ readonly processed: number }>;
}

export function createVerifiedFinancialResultProcessor(dependencies: {
  readonly feed: VerifiedFinancialResultFeedPort;
  readonly cursor: FinancialResultCursorRepositoryPort;
  readonly fulfillment: VerifiedPaymentTicketFulfillmentHandler;
  readonly refunds: VerifiedRefundTicketCancellationHandler;
}): VerifiedFinancialResultProcessor {
  const processor: VerifiedFinancialResultProcessor = {
    async drain(limit = 100) {
      const current = await dependencies.cursor.load();
      const results = await dependencies.feed.listAfter(current, limit);
      let processed = 0;
      for (const result of results) {
        if (result.kind === "approved" && result.paymentStatus === "confirmed") {
          await dependencies.fulfillment.handle(result);
        } else if (
          result.kind === "refunded" &&
          result.paymentStatus === "refunded"
        ) {
          await dependencies.refunds.handle(result);
        }
        await dependencies.cursor.save({
          recordedAt: result.recordedAt,
          resultId: result.resultId,
        });
        processed += 1;
      }
      return Object.freeze({ processed });
    },
  };
  return Object.freeze(processor);
}

interface CursorRow extends RowDataPacket {
  recorded_at: Date | string;
  result_id: string;
}

export class MySqlFinancialResultCursorRepository
  implements FinancialResultCursorRepositoryPort
{
  private readonly consumerName = "ticketing_verified_results_v1";

  constructor(private readonly pool: Pool) {}

  async load(): Promise<FinancialResultCursor | null> {
    const [rows] = await this.pool.execute<CursorRow[]>(
      `SELECT recorded_at, result_id
       FROM ticketing_financial_result_cursor
       WHERE consumer_name = ?
       LIMIT 1`,
      [this.consumerName],
    );
    const row = rows[0];
    if (!row) return null;
    const date =
      row.recorded_at instanceof Date
        ? row.recorded_at
        : new Date(row.recorded_at);
    if (!Number.isFinite(date.getTime()) || !row.result_id) {
      throw new Error("TICKETING_FINANCIAL_CURSOR_INVALID");
    }
    return Object.freeze({
      recordedAt: date.toISOString(),
      resultId: row.result_id,
    });
  }

  async save(cursor: FinancialResultCursor): Promise<void> {
    const date = new Date(cursor.recordedAt);
    if (!Number.isFinite(date.getTime()) || !cursor.resultId) {
      throw new Error("TICKETING_FINANCIAL_CURSOR_INVALID");
    }
    await this.pool.execute(
      `INSERT INTO ticketing_financial_result_cursor (
         consumer_name, recorded_at, result_id, updated_at
       ) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         result_id = IF(
           VALUES(recorded_at) > recorded_at OR
           (VALUES(recorded_at) = recorded_at AND VALUES(result_id) > result_id),
           VALUES(result_id),
           result_id
         ),
         recorded_at = GREATEST(recorded_at, VALUES(recorded_at)),
         updated_at = VALUES(updated_at)`,
      [this.consumerName, date, cursor.resultId, new Date()],
    );
  }
}
