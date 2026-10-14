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

type FinancialProcessorStage =
  | "cursor_load"
  | "feed_list_after"
  | "fulfillment_handle"
  | "refund_handle"
  | "cursor_save";

const safeFailureCodes = new Set([
  "ER_NO_SUCH_TABLE",
  "ER_BAD_FIELD_ERROR",
  "ER_TABLEACCESS_DENIED_ERROR",
  "ER_DBACCESS_DENIED_ERROR",
  "ER_ACCESS_DENIED_ERROR",
  "ER_BAD_DB_ERROR",
  "ER_PARSE_ERROR",
  "ER_WRONG_ARGUMENTS",
  "ER_LOCK_DEADLOCK",
  "ER_LOCK_WAIT_TIMEOUT",
  "ER_DUP_ENTRY",
  "ER_BAD_NULL_ERROR",
  "ER_DATA_TOO_LONG",
  "ER_TRUNCATED_WRONG_VALUE",
  "ER_NO_DEFAULT_FOR_FIELD",
  "PROTOCOL_CONNECTION_LOST",
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "TICKETING_FINANCIAL_CURSOR_INVALID",
  "FINANCIAL_INVALID_DB_TIMESTAMP",
  "FINANCIAL_INVALID_PERSISTED_PAYMENT_RESULT",
  "UNKNOWN_FAILURE",
]);

function safeFinancialProcessorCode(error: unknown): string {
  try {
    const reportedCode =
      error && typeof error === "object" && "code" in error
        ? (error as { readonly code?: unknown }).code
        : undefined;
    if (
      typeof reportedCode === "string" &&
      safeFailureCodes.has(reportedCode)
    ) {
      return reportedCode;
    }
    const message = error instanceof Error ? error.message : undefined;
    if (typeof message === "string" && safeFailureCodes.has(message)) {
      return message;
    }
  } catch {
    return "UNKNOWN_FAILURE";
  }
  return "UNKNOWN_FAILURE";
}

class TicketingFinancialStageFailure extends Error {
  readonly stage: FinancialProcessorStage;
  readonly diagnosticCode: string;

  constructor(stage: FinancialProcessorStage, error: unknown) {
    super("TICKETING_FINANCIAL_PROCESSOR_STAGE_FAILURE");
    this.name = "TicketingFinancialStageFailure";
    this.stage = stage;
    this.diagnosticCode = safeFinancialProcessorCode(error);
    // Never attach the original error as cause, message, or enumerable metadata:
    // MySQL and domain errors can contain SQL, URLs, tokens, or personal data.
  }
}

async function atStage<T>(
  stage: FinancialProcessorStage,
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw new TicketingFinancialStageFailure(stage, error);
  }
}

export function createVerifiedFinancialResultProcessor(dependencies: {
  readonly feed: VerifiedFinancialResultFeedPort;
  readonly cursor: FinancialResultCursorRepositoryPort;
  readonly fulfillment: VerifiedPaymentTicketFulfillmentHandler;
  readonly refunds: VerifiedRefundTicketCancellationHandler;
}): VerifiedFinancialResultProcessor {
  const processor: VerifiedFinancialResultProcessor = {
    async drain(limit = 100) {
      const current = await atStage("cursor_load", () =>
        dependencies.cursor.load(),
      );
      const results = await atStage("feed_list_after", () =>
        dependencies.feed.listAfter(current, limit),
      );
      let processed = 0;
      for (const result of results) {
        if (
          result.kind === "approved" &&
          result.paymentStatus === "confirmed"
        ) {
          await atStage("fulfillment_handle", () =>
            dependencies.fulfillment.handle(result),
          );
        } else if (
          result.kind === "refunded" &&
          result.paymentStatus === "refunded"
        ) {
          await atStage("refund_handle", () =>
            dependencies.refunds.handle(result),
          );
        }
        await atStage("cursor_save", () =>
          dependencies.cursor.save({
            recordedAt: result.recordedAt,
            resultId: result.resultId,
          }),
        );
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

export class MySqlFinancialResultCursorRepository implements FinancialResultCursorRepositoryPort {
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
