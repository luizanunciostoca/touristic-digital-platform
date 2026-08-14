import {
  createMoney,
  createPaymentIdempotencyKey,
  normalizeFinancialReference,
  normalizeFinancialTimestamp,
  normalizePaymentId,
  paymentStatuses,
  type Payment,
  type PaymentStatus,
} from "@touristic/financial";

function boundedOptionalReference(value: unknown, maxLength: number): string | null {
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new Error("FINANCIAL_INVALID_PROVIDER_REFERENCE");
  }
  const normalized = value.trim();
  if (
    !normalized ||
    normalized.length > maxLength ||
    /[^\u0020-\u007e]/u.test(normalized)
  ) {
    throw new Error("FINANCIAL_INVALID_PROVIDER_REFERENCE");
  }
  return normalized;
}

function canonicalTimestamp(value: unknown): string {
  const normalized = normalizeFinancialTimestamp(value);
  return normalized ? new Date(normalized).toISOString() : "";
}

function isPaymentStatus(value: unknown): value is PaymentStatus {
  return (
    typeof value === "string" &&
    paymentStatuses.includes(value as PaymentStatus)
  );
}

function optionalTimestamp(value: unknown): string | null {
  if (value === null) return null;
  const normalized = canonicalTimestamp(value);
  if (!normalized) throw new Error("FINANCIAL_INVALID_PAYMENT_TIMESTAMP");
  return normalized;
}

export function normalizePaymentForPersistence(payment: Payment): Payment {
  const id = normalizePaymentId(payment.id);
  const orderReference = normalizeFinancialReference(
    payment.subject.reference,
    120,
  );
  const expectedIdempotencyKey = createPaymentIdempotencyKey(orderReference);
  const amount = createMoney(
    payment.amount.minorUnits,
    payment.amount.currency,
  );
  const createdAt = canonicalTimestamp(payment.createdAt);
  const updatedAt = canonicalTimestamp(payment.updatedAt);
  const confirmedAt = optionalTimestamp(payment.confirmedAt);
  const refundedAt = optionalTimestamp(payment.refundedAt);
  const providerReference = boundedOptionalReference(
    payment.providerReference,
    180,
  );

  if (
    !id ||
    payment.subject.kind !== "order" ||
    !orderReference ||
    !expectedIdempotencyKey ||
    payment.idempotencyKey !== expectedIdempotencyKey ||
    !amount ||
    !isPaymentStatus(payment.status) ||
    !createdAt ||
    !updatedAt
  ) {
    throw new Error("FINANCIAL_INVALID_PAYMENT");
  }

  const createdMs = Date.parse(createdAt);
  const updatedMs = Date.parse(updatedAt);
  if (updatedMs < createdMs) throw new Error("FINANCIAL_INVALID_PAYMENT_TIME_ORDER");

  if (payment.status === "confirmed" || payment.status === "refunded") {
    if (!confirmedAt) throw new Error("FINANCIAL_CONFIRMED_PAYMENT_REQUIRES_TIMESTAMP");
  } else if (confirmedAt) {
    throw new Error("FINANCIAL_UNCONFIRMED_PAYMENT_HAS_CONFIRMATION_TIMESTAMP");
  }

  if (payment.status === "refunded") {
    if (!refundedAt) throw new Error("FINANCIAL_REFUNDED_PAYMENT_REQUIRES_TIMESTAMP");
  } else if (refundedAt) {
    throw new Error("FINANCIAL_NON_REFUNDED_PAYMENT_HAS_REFUND_TIMESTAMP");
  }

  if (
    confirmedAt &&
    (Date.parse(confirmedAt) < createdMs || Date.parse(confirmedAt) > updatedMs)
  ) {
    throw new Error("FINANCIAL_INVALID_CONFIRMATION_TIME_ORDER");
  }
  if (
    refundedAt &&
    confirmedAt &&
    (Date.parse(refundedAt) < Date.parse(confirmedAt) ||
      Date.parse(refundedAt) > updatedMs)
  ) {
    throw new Error("FINANCIAL_INVALID_REFUND_TIME_ORDER");
  }

  return Object.freeze({
    id,
    idempotencyKey: expectedIdempotencyKey,
    subject: Object.freeze({ kind: "order" as const, reference: orderReference }),
    amount,
    status: payment.status,
    providerReference,
    createdAt,
    updatedAt,
    confirmedAt,
    refundedAt,
  });
}
