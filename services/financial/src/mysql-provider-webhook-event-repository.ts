import type { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";

import {
  normalizeFinancialTimestamp,
  normalizePaymentId,
  normalizeVerifiedProviderPaymentEvent,
  type PaymentId,
  type VerifiedProviderPaymentEvent,
} from "@touristic/financial";

export interface ProviderWebhookReceipt {
  readonly event: VerifiedProviderPaymentEvent;
  readonly payloadSha256: string;
  readonly receivedAt: string;
  readonly matchedPaymentId: PaymentId | null;
}

export interface ProviderWebhookEventClaim {
  readonly claimed: boolean;
  readonly receipt: ProviderWebhookReceipt;
}

export interface ProviderWebhookEventRepositoryPort {
  claim(receipt: ProviderWebhookReceipt): Promise<ProviderWebhookEventClaim>;
}

interface ProviderEventRow extends RowDataPacket {
  provider_event_id: string;
  external_reference: string;
  provider_payment_reference: string | null;
  payment_status: string;
  occurred_at: Date | string;
  received_at: Date | string;
  payload_sha256: string;
  matched_payment_id: string | null;
}

const payloadHashPattern = /^[a-f0-9]{64}$/u;

function timestamp(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("FINANCIAL_INVALID_DB_TIMESTAMP");
  }
  return date.toISOString();
}

function normalizeReceipt(input: ProviderWebhookReceipt): ProviderWebhookReceipt {
  const event = normalizeVerifiedProviderPaymentEvent(input.event);
  const payloadSha256 =
    typeof input.payloadSha256 === "string"
      ? input.payloadSha256.trim().toLowerCase()
      : "";
  const receivedAt = normalizeFinancialTimestamp(input.receivedAt);
  const matchedPaymentId =
    input.matchedPaymentId === null
      ? null
      : normalizePaymentId(input.matchedPaymentId);
  if (
    !event ||
    !payloadHashPattern.test(payloadSha256) ||
    !receivedAt ||
    (input.matchedPaymentId !== null && !matchedPaymentId) ||
    (matchedPaymentId !== null &&
      matchedPaymentId !== event.externalReference)
  ) {
    throw new Error("FINANCIAL_INVALID_PROVIDER_EVENT_RECEIPT");
  }
  return Object.freeze({
    event,
    payloadSha256,
    receivedAt: new Date(receivedAt).toISOString(),
    matchedPaymentId,
  });
}

function fromRow(row: ProviderEventRow): ProviderWebhookReceipt {
  const event = normalizeVerifiedProviderPaymentEvent({
    providerEventId: row.provider_event_id,
    externalReference: row.external_reference,
    providerPaymentReference: row.provider_payment_reference,
    status: row.payment_status,
    occurredAt: timestamp(row.occurred_at),
  });
  const matchedPaymentId =
    row.matched_payment_id === null
      ? null
      : normalizePaymentId(row.matched_payment_id);
  const receivedAt = normalizeFinancialTimestamp(timestamp(row.received_at));
  const payloadSha256 = String(row.payload_sha256).toLowerCase();
  if (
    !event ||
    (row.matched_payment_id !== null && !matchedPaymentId) ||
    !receivedAt ||
    !payloadHashPattern.test(payloadSha256)
  ) {
    throw new Error("FINANCIAL_INVALID_PERSISTED_PROVIDER_EVENT");
  }
  return Object.freeze({
    event,
    payloadSha256,
    receivedAt,
    matchedPaymentId,
  });
}

function sameProviderEvent(
  left: ProviderWebhookReceipt,
  right: ProviderWebhookReceipt,
): boolean {
  return (
    left.event.providerEventId === right.event.providerEventId &&
    left.event.externalReference === right.event.externalReference &&
    left.event.providerPaymentReference ===
      right.event.providerPaymentReference &&
    left.event.status === right.event.status &&
    left.event.occurredAt === right.event.occurredAt &&
    left.payloadSha256 === right.payloadSha256
  );
}

export class MySqlProviderWebhookEventRepository
  implements ProviderWebhookEventRepositoryPort
{
  constructor(private readonly pool: Pool) {}

  private async findById(
    providerEventId: VerifiedProviderPaymentEvent["providerEventId"],
  ): Promise<ProviderWebhookReceipt | null> {
    const [rows] = await this.pool.execute<ProviderEventRow[]>(
      `SELECT
         provider_event_id,
         external_reference,
         provider_payment_reference,
         payment_status,
         occurred_at,
         received_at,
         LOWER(HEX(payload_sha256)) AS payload_sha256,
         matched_payment_id
       FROM financial_provider_events
       WHERE provider_event_id = ?
       LIMIT 1`,
      [providerEventId],
    );
    return rows[0] ? fromRow(rows[0]) : null;
  }

  async claim(
    receiptInput: ProviderWebhookReceipt,
  ): Promise<ProviderWebhookEventClaim> {
    const receipt = normalizeReceipt(receiptInput);
    const [result] = await this.pool.execute<ResultSetHeader>(
      `INSERT IGNORE INTO financial_provider_events (
         provider_event_id,
         external_reference,
         provider_payment_reference,
         payment_status,
         occurred_at,
         received_at,
         payload_sha256,
         matched_payment_id
       ) VALUES (?, ?, ?, ?, ?, ?, UNHEX(?), ?)`,
      [
        receipt.event.providerEventId,
        receipt.event.externalReference,
        receipt.event.providerPaymentReference,
        receipt.event.status,
        new Date(receipt.event.occurredAt),
        new Date(receipt.receivedAt),
        receipt.payloadSha256,
        receipt.matchedPaymentId,
      ],
    );
    const persisted = await this.findById(receipt.event.providerEventId);
    if (!persisted) {
      throw new Error("FINANCIAL_PROVIDER_EVENT_NOT_PERSISTED");
    }
    if (!sameProviderEvent(persisted, receipt)) {
      throw new Error("FINANCIAL_PROVIDER_EVENT_COLLISION");
    }
    return Object.freeze({
      claimed: result.affectedRows === 1,
      receipt: persisted,
    });
  }
}
