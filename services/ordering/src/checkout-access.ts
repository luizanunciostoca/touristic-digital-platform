import {
  normalizeFinancialTimestamp,
  normalizePaymentId,
  type PaymentId,
} from "@touristic/financial";
import {
  normalizeOrderId,
  type OrderId,
} from "@touristic/ordering";

import {
  isCheckoutSha256Hex,
  normalizeCheckoutCorrelationId,
  normalizeCheckoutRequestContext,
  type CheckoutRequestContext,
  type CheckoutRequesterKind,
} from "./checkout-security.js";

export interface CheckoutAccessRecord {
  readonly orderId: OrderId;
  readonly paymentId: PaymentId;
  readonly requestFingerprint: string;
  readonly tokenHash: string;
  readonly requesterKind: CheckoutRequesterKind;
  readonly actorSubject: string;
  readonly destinationId: string;
  readonly tenantId: string | null;
  readonly correlationId: string;
  readonly createdAt: string;
  readonly expiresAt: string;
}

export interface CheckoutAccessRepositoryPort {
  findByOrderId(orderId: OrderId): Promise<CheckoutAccessRecord | null>;
  claim(record: CheckoutAccessRecord): Promise<CheckoutAccessRecord>;
}

function canonicalTimestamp(value: unknown): string {
  const normalized = normalizeFinancialTimestamp(value);
  return normalized ? new Date(normalized).toISOString() : "";
}

export function createCheckoutAccessRecord(input: {
  readonly orderId: unknown;
  readonly paymentId: unknown;
  readonly requestFingerprint: unknown;
  readonly tokenHash: unknown;
  readonly context: Readonly<Partial<CheckoutRequestContext>>;
  readonly correlationId: unknown;
  readonly createdAt: unknown;
  readonly expiresAt: unknown;
}): CheckoutAccessRecord | null {
  const orderId = normalizeOrderId(input.orderId);
  const paymentId = normalizePaymentId(input.paymentId);
  const context = normalizeCheckoutRequestContext(input.context);
  const correlationId = normalizeCheckoutCorrelationId(
    input.correlationId,
  );
  const createdAt = canonicalTimestamp(input.createdAt);
  const expiresAt = canonicalTimestamp(input.expiresAt);
  if (
    !orderId ||
    !paymentId ||
    !isCheckoutSha256Hex(input.requestFingerprint) ||
    !isCheckoutSha256Hex(input.tokenHash) ||
    !context ||
    !correlationId ||
    !createdAt ||
    !expiresAt ||
    Date.parse(expiresAt) <= Date.parse(createdAt)
  ) {
    return null;
  }
  return Object.freeze({
    orderId,
    paymentId,
    requestFingerprint: input.requestFingerprint,
    tokenHash: input.tokenHash,
    requesterKind: context.requesterKind,
    actorSubject: context.actorSubject,
    destinationId: context.destinationId,
    tenantId: context.tenantId,
    correlationId,
    createdAt,
    expiresAt,
  });
}

export function sameCheckoutAccessAuthority(
  left: CheckoutAccessRecord,
  right: CheckoutAccessRecord,
): boolean {
  return (
    left.orderId === right.orderId &&
    left.paymentId === right.paymentId &&
    left.requestFingerprint === right.requestFingerprint &&
    left.tokenHash === right.tokenHash &&
    left.requesterKind === right.requesterKind &&
    left.actorSubject === right.actorSubject &&
    left.destinationId === right.destinationId &&
    left.tenantId === right.tenantId
  );
}
