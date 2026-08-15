import type {
  Pool,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";

import {
  normalizePaymentId,
  normalizeRefundRequest,
  normalizeRefundRequestId,
  type PaymentId,
  type RefundRequest,
  type RefundRequestClaim,
  type RefundRequestId,
  type RefundRequestRepositoryPort,
} from "@touristic/financial";

interface RefundRequestRow extends RowDataPacket {
  refund_request_id: string;
  idempotency_key: string;
  payment_id: string;
  approved_result_id: string;
  amount_minor: number | string;
  currency: string;
  provider_payment_reference: string;
  status: string;
  provider_refund_reference: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

const columns = `
  refund_request_id, idempotency_key, payment_id, approved_result_id,
  amount_minor, currency, provider_payment_reference, status,
  provider_refund_reference, created_at, updated_at
`;

function timestamp(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("FINANCIAL_INVALID_DB_TIMESTAMP");
  }
  return date.toISOString();
}

function fromRow(row: RefundRequestRow): RefundRequest {
  const request = normalizeRefundRequest({
    id: row.refund_request_id,
    idempotencyKey: row.idempotency_key,
    paymentId: row.payment_id,
    approvedResultId: row.approved_result_id,
    amount: { minorUnits: Number(row.amount_minor), currency: row.currency },
    providerPaymentReference: row.provider_payment_reference,
    status: row.status,
    providerRefundReference: row.provider_refund_reference,
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
  });
  if (!request) throw new Error("FINANCIAL_INVALID_PERSISTED_REFUND_REQUEST");
  return request;
}

function sameImmutable(left: RefundRequest, right: RefundRequest): boolean {
  return (
    left.id === right.id &&
    left.idempotencyKey === right.idempotencyKey &&
    left.paymentId === right.paymentId &&
    left.approvedResultId === right.approvedResultId &&
    left.amount.minorUnits === right.amount.minorUnits &&
    left.amount.currency === right.amount.currency &&
    left.providerPaymentReference === right.providerPaymentReference &&
    left.createdAt === right.createdAt
  );
}

export class MySqlRefundRequestRepository
  implements RefundRequestRepositoryPort
{
  constructor(private readonly pool: Pool) {}

  private async findById(
    idInput: RefundRequestId,
  ): Promise<RefundRequest | null> {
    const id = normalizeRefundRequestId(idInput);
    if (!id) throw new Error("FINANCIAL_INVALID_REFUND_REQUEST_ID");
    const [rows] = await this.pool.execute<RefundRequestRow[]>(
      `SELECT ${columns}
       FROM financial_refund_requests
       WHERE refund_request_id = ?
       LIMIT 1`,
      [id],
    );
    return rows[0] ? fromRow(rows[0]) : null;
  }

  async findByPaymentId(
    paymentIdInput: PaymentId,
  ): Promise<RefundRequest | null> {
    const paymentId = normalizePaymentId(paymentIdInput);
    if (!paymentId) throw new Error("FINANCIAL_INVALID_PAYMENT_ID");
    const [rows] = await this.pool.execute<RefundRequestRow[]>(
      `SELECT ${columns}
       FROM financial_refund_requests
       WHERE payment_id = ?
       LIMIT 1`,
      [paymentId],
    );
    return rows[0] ? fromRow(rows[0]) : null;
  }

  async claim(input: RefundRequest): Promise<RefundRequestClaim> {
    const request = normalizeRefundRequest(input);
    if (!request || request.status !== "claimed") {
      throw new Error("FINANCIAL_INVALID_REFUND_REQUEST");
    }
    const [insert] = await this.pool.execute<ResultSetHeader>(
      `INSERT IGNORE INTO financial_refund_requests (
         refund_request_id, idempotency_key, payment_id, approved_result_id,
         amount_minor, currency, provider_payment_reference, status,
         provider_refund_reference, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 'claimed', NULL, ?, ?)`,
      [
        request.id,
        request.idempotencyKey,
        request.paymentId,
        request.approvedResultId,
        request.amount.minorUnits,
        request.amount.currency,
        request.providerPaymentReference,
        new Date(request.createdAt),
        new Date(request.updatedAt),
      ],
    );
    const persisted =
      (await this.findById(request.id)) ??
      (await this.findByPaymentId(request.paymentId));
    if (!persisted || !sameImmutable(persisted, request)) {
      throw new Error("FINANCIAL_REFUND_REQUEST_CONFLICT");
    }
    return Object.freeze({
      claimed: insert.affectedRows === 1,
      request: persisted,
    });
  }

  async acceptProvider(
    refundRequestId: RefundRequestId,
    providerRefundReference: string,
    updatedAt: string,
  ): Promise<RefundRequest> {
    const existing = await this.findById(refundRequestId);
    if (!existing) throw new Error("FINANCIAL_REFUND_REQUEST_NOT_FOUND");
    const proposed = normalizeRefundRequest({
      ...existing,
      status: "provider_accepted",
      providerRefundReference,
      updatedAt,
    });
    if (!proposed) throw new Error("FINANCIAL_INVALID_REFUND_ACCEPTANCE");
    if (existing.status === "provider_accepted") {
      if (
        existing.providerRefundReference !== proposed.providerRefundReference
      ) {
        throw new Error("FINANCIAL_REFUND_PROVIDER_REFERENCE_CONFLICT");
      }
      return existing;
    }
    if (Date.parse(proposed.updatedAt) < Date.parse(existing.updatedAt)) {
      throw new Error("FINANCIAL_STALE_REFUND_ACCEPTANCE");
    }
    const [update] = await this.pool.execute<ResultSetHeader>(
      `UPDATE financial_refund_requests
       SET status = 'provider_accepted',
           provider_refund_reference = ?,
           updated_at = ?
       WHERE refund_request_id = ?
         AND status = 'claimed'
         AND updated_at = ?`,
      [
        proposed.providerRefundReference,
        new Date(proposed.updatedAt),
        proposed.id,
        new Date(existing.updatedAt),
      ],
    );
    if (update.affectedRows !== 1) {
      const raced = await this.findById(existing.id);
      if (
        raced?.status === "provider_accepted" &&
        raced.providerRefundReference === proposed.providerRefundReference
      ) return raced;
      throw new Error("FINANCIAL_CONCURRENT_REFUND_MODIFICATION");
    }
    const saved = await this.findById(existing.id);
    if (!saved || saved.status !== "provider_accepted") {
      throw new Error("FINANCIAL_REFUND_ACCEPTANCE_NOT_PERSISTED");
    }
    return saved;
  }
}
