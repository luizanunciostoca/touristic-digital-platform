import { createMoney, type Money } from "./index.js";

const SAFE_REFERENCE = /^[A-Za-z0-9._:-]{4,180}$/u;
const SAFE_ID = /^[A-Za-z0-9_-]{8,120}$/u;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

const providerSubscriptionIdempotencyKeyBrand: unique symbol = Symbol(
  "ProviderSubscriptionIdempotencyKey",
);

export type ProviderSubscriptionIdempotencyKey = string & {
  readonly [providerSubscriptionIdempotencyKeyBrand]: true;
};

export const providerSubscriptionStatuses = Object.freeze([
  "pending",
  "authorized",
  "paused",
  "cancelled",
] as const);
export type ProviderSubscriptionStatus =
  (typeof providerSubscriptionStatuses)[number];

export interface ProviderSubscriptionRequest {
  readonly subscriptionId: string;
  readonly idempotencyKey: ProviderSubscriptionIdempotencyKey;
  readonly amount: Money;
  readonly frequency: number;
  readonly frequencyType: "months";
  readonly reason: string;
  readonly payerEmail: string;
  readonly cardToken: string;
  readonly backUrl: string;
  readonly metadata: Readonly<Record<string, string>>;
}

export interface ProviderSubscriptionSnapshot {
  readonly providerSubscriptionReference: string;
  readonly externalReference: string;
  readonly status: ProviderSubscriptionStatus;
  readonly amount: Money;
  readonly frequency: number;
  readonly frequencyType: "months";
  readonly payerEmail: string;
}

export interface FinancialSubscriptionProviderPort {
  createSubscription(
    input: ProviderSubscriptionRequest,
  ): Promise<ProviderSubscriptionSnapshot>;
  readSubscription(
    providerSubscriptionReference: string,
  ): Promise<ProviderSubscriptionSnapshot>;
  pauseSubscription(
    providerSubscriptionReference: string,
  ): Promise<ProviderSubscriptionSnapshot>;
  resumeSubscription(
    providerSubscriptionReference: string,
  ): Promise<ProviderSubscriptionSnapshot>;
  cancelSubscription(
    providerSubscriptionReference: string,
  ): Promise<ProviderSubscriptionSnapshot>;
}

function text(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) return "";
  const forbidden = Array.from(normalized).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return (
      codePoint <= 31 ||
      codePoint === 127 ||
      character === "<" ||
      character === ">"
    );
  });
  return forbidden ? "" : normalized;
}

function httpsUrl(value: unknown): string {
  const normalized = text(value, 2_048);
  if (!normalized) return "";
  try {
    const url = new URL(normalized);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.hash
    ) {
      return "";
    }
    return url.toString();
  } catch {
    return "";
  }
}

function metadata(
  value: Readonly<Record<string, unknown>>,
): Readonly<Record<string, string>> | null {
  const output: Record<string, string> = {};
  const entries = Object.entries(value);
  if (entries.length > 16) return null;
  for (const [rawKey, rawValue] of entries) {
    const key = text(rawKey, 80);
    const item = text(rawValue, 180);
    if (!key || !SAFE_REFERENCE.test(key) || !item) return null;
    output[key] = item;
  }
  return Object.freeze(output);
}

export function createSubscriptionProviderIdempotencyKey(
  subscriptionIdInput: unknown,
): ProviderSubscriptionIdempotencyKey | null {
  const subscriptionId = text(subscriptionIdInput, 120);
  if (!subscriptionId.startsWith("sub_")) return null;
  const body = subscriptionId.slice("sub_".length);
  return SAFE_ID.test(body)
    ? (`subscription:v1:${subscriptionId}` as ProviderSubscriptionIdempotencyKey)
    : null;
}

export function normalizeProviderSubscriptionRequest(
  input: Readonly<{
    subscriptionId?: unknown;
    idempotencyKey?: unknown;
    amount?: Partial<Money> | null;
    frequency?: unknown;
    frequencyType?: unknown;
    reason?: unknown;
    payerEmail?: unknown;
    cardToken?: unknown;
    backUrl?: unknown;
    metadata?: Readonly<Record<string, unknown>> | null;
  }>,
): ProviderSubscriptionRequest | null {
  const subscriptionId = text(input.subscriptionId, 120);
  const expectedIdempotencyKey =
    createSubscriptionProviderIdempotencyKey(subscriptionId);
  const idempotencyKey = text(input.idempotencyKey, 180);
  const amount = createMoney(
    input.amount?.minorUnits,
    input.amount?.currency,
  );
  const reason = text(input.reason, 160);
  const payerEmail = text(input.payerEmail, 200).toLowerCase();
  const cardToken = text(input.cardToken, 512);
  const backUrl = httpsUrl(input.backUrl);
  const normalizedMetadata = metadata(input.metadata ?? {});

  if (
    !expectedIdempotencyKey ||
    idempotencyKey !== expectedIdempotencyKey ||
    !amount ||
    amount.minorUnits <= 0 ||
    input.frequency !== 1 ||
    input.frequencyType !== "months" ||
    !reason ||
    !EMAIL.test(payerEmail) ||
    !cardToken ||
    !SAFE_REFERENCE.test(cardToken) ||
    !backUrl ||
    !normalizedMetadata
  ) {
    return null;
  }

  return Object.freeze({
    subscriptionId,
    idempotencyKey: expectedIdempotencyKey,
    amount,
    frequency: 1,
    frequencyType: "months" as const,
    reason,
    payerEmail,
    cardToken,
    backUrl,
    metadata: normalizedMetadata,
  });
}

export function normalizeProviderSubscriptionSnapshot(
  input: Readonly<{
    providerSubscriptionReference?: unknown;
    externalReference?: unknown;
    status?: unknown;
    amount?: Partial<Money> | null;
    frequency?: unknown;
    frequencyType?: unknown;
    payerEmail?: unknown;
  }>,
): ProviderSubscriptionSnapshot | null {
  const providerSubscriptionReference = text(
    input.providerSubscriptionReference,
    180,
  );
  const externalReference = text(input.externalReference, 120);
  const amount = createMoney(
    input.amount?.minorUnits,
    input.amount?.currency,
  );
  const payerEmail = text(input.payerEmail, 200).toLowerCase();
  const status =
    typeof input.status === "string" &&
    providerSubscriptionStatuses.includes(
      input.status as ProviderSubscriptionStatus,
    )
      ? (input.status as ProviderSubscriptionStatus)
      : null;

  if (
    !SAFE_REFERENCE.test(providerSubscriptionReference) ||
    !externalReference.startsWith("sub_") ||
    !createSubscriptionProviderIdempotencyKey(externalReference) ||
    !status ||
    !amount ||
    amount.minorUnits <= 0 ||
    input.frequency !== 1 ||
    input.frequencyType !== "months" ||
    !EMAIL.test(payerEmail)
  ) {
    return null;
  }

  return Object.freeze({
    providerSubscriptionReference,
    externalReference,
    status,
    amount,
    frequency: 1,
    frequencyType: "months" as const,
    payerEmail,
  });
}
