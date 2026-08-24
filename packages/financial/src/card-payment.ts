import {
  createMoney,
  normalizePaymentId,
  type CheckoutCustomer,
  type Money,
  type PaymentId,
} from "./index.js";

const CARD_PAYMENT_TEXT = /^[^\u0000-\u001F\u007F<>]+$/u;
const CARD_PAYMENT_METHOD = /^[A-Za-z0-9_-]{1,80}$/u;
const CARD_PAYMENT_REFERENCE = /^[A-Za-z0-9._:-]{4,160}$/u;
const CARD_PAYMENT_METADATA_KEY = /^[A-Za-z0-9_.:-]{1,80}$/u;
const CARD_PAYMENT_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

const cardPaymentIdempotencyKeyBrand: unique symbol = Symbol(
  "CardPaymentIdempotencyKey",
);

export type CardPaymentIdempotencyKey = string & {
  readonly [cardPaymentIdempotencyKeyBrand]: true;
};

export const cardPaymentProviderStatuses = Object.freeze([
  "pending",
  "paid",
  "failed",
  "cancelled",
  "expired",
  "refunded",
] as const);

export type CardPaymentProviderStatus =
  (typeof cardPaymentProviderStatuses)[number];

export interface CardPaymentProviderRequest {
  readonly paymentId: PaymentId;
  readonly idempotencyKey: CardPaymentIdempotencyKey;
  readonly amount: Money;
  readonly description: string;
  readonly token: string;
  readonly installments: number;
  readonly paymentMethodId: string;
  readonly issuerId: string | null;
  readonly webhookUrl: string;
  readonly customer: Pick<CheckoutCustomer, "email">;
  readonly metadata: Readonly<Record<string, string>>;
}

export interface CardPaymentProviderReceipt {
  readonly providerPaymentReference: string;
  readonly status: CardPaymentProviderStatus;
}

export interface FinancialCardPaymentProviderPort {
  createCardPayment(
    input: CardPaymentProviderRequest,
  ): Promise<CardPaymentProviderReceipt>;
}

function normalizeText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  return normalized &&
    normalized.length <= maxLength &&
    CARD_PAYMENT_TEXT.test(normalized)
    ? normalized
    : "";
}

function normalizeHttpsUrl(value: unknown): string {
  const normalized = normalizeText(value, 2_048);
  if (!normalized) return "";
  try {
    const url = new URL(normalized);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.toString()
      : "";
  } catch {
    return "";
  }
}

export function createCardPaymentIdempotencyKey(
  paymentIdInput: unknown,
): CardPaymentIdempotencyKey | null {
  const paymentId = normalizePaymentId(paymentIdInput);
  return paymentId
    ? (`card-payment:v1:${paymentId}` as CardPaymentIdempotencyKey)
    : null;
}

function normalizeCardPaymentIdempotencyKey(
  value: unknown,
): CardPaymentIdempotencyKey | null {
  const normalized = normalizeText(value, 220);
  const prefix = "card-payment:v1:";
  if (!normalized.startsWith(prefix)) return null;
  const expected = createCardPaymentIdempotencyKey(normalized.slice(prefix.length));
  return expected === normalized ? expected : null;
}

export function createCardPaymentProviderRequest(input: Readonly<{
  paymentId?: unknown;
  idempotencyKey?: unknown;
  amount?: unknown;
  description?: unknown;
  token?: unknown;
  installments?: unknown;
  paymentMethodId?: unknown;
  issuerId?: unknown;
  webhookUrl?: unknown;
  customer?: unknown;
  metadata?: unknown;
}>): CardPaymentProviderRequest | null {
  const paymentId = normalizePaymentId(input.paymentId);
  const idempotencyKey = normalizeCardPaymentIdempotencyKey(input.idempotencyKey);
  const amountInput = input.amount as Partial<Money> | null | undefined;
  const amount = createMoney(amountInput?.minorUnits, amountInput?.currency);
  const description = normalizeText(input.description, 240);
  const token = normalizeText(input.token, 1_024);
  const paymentMethodId = normalizeText(input.paymentMethodId, 80);
  const issuerId =
    input.issuerId === undefined || input.issuerId === null || input.issuerId === ""
      ? null
      : normalizeText(input.issuerId, 80);
  const webhookUrl = normalizeHttpsUrl(input.webhookUrl);
  const installments =
    typeof input.installments === "number" &&
    Number.isSafeInteger(input.installments) &&
    input.installments >= 1 &&
    input.installments <= 48
      ? input.installments
      : null;
  const customerInput =
    input.customer !== null &&
    typeof input.customer === "object" &&
    !Array.isArray(input.customer)
      ? (input.customer as Record<string, unknown>)
      : null;
  const metadataInput =
    input.metadata !== null &&
    typeof input.metadata === "object" &&
    !Array.isArray(input.metadata)
      ? (input.metadata as Record<string, unknown>)
      : null;

  if (
    !paymentId ||
    !idempotencyKey ||
    idempotencyKey !== createCardPaymentIdempotencyKey(paymentId) ||
    !amount ||
    amount.minorUnits <= 0 ||
    !description ||
    !token ||
    !installments ||
    !CARD_PAYMENT_METHOD.test(paymentMethodId) ||
    (issuerId !== null && !CARD_PAYMENT_METHOD.test(issuerId)) ||
    !webhookUrl ||
    !customerInput ||
    !metadataInput
  ) {
    return null;
  }

  const email = normalizeText(customerInput.email, 200).toLowerCase();
  if (!CARD_PAYMENT_EMAIL.test(email)) return null;

  const metadataEntries = Object.entries(metadataInput);
  if (metadataEntries.length > 20) return null;
  const metadata: Record<string, string> = {};
  for (const [key, rawValue] of metadataEntries.sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const value = normalizeText(rawValue, 200);
    if (!CARD_PAYMENT_METADATA_KEY.test(key) || !value) return null;
    metadata[key] = value;
  }

  return Object.freeze({
    paymentId,
    idempotencyKey,
    amount,
    description,
    token,
    installments,
    paymentMethodId,
    issuerId,
    webhookUrl,
    customer: Object.freeze({ email }),
    metadata: Object.freeze(metadata),
  });
}

export function normalizeCardPaymentProviderReceipt(input: Readonly<{
  providerPaymentReference?: unknown;
  status?: unknown;
}>): CardPaymentProviderReceipt | null {
  const providerPaymentReference = normalizeText(
    input.providerPaymentReference,
    160,
  );
  const status =
    typeof input.status === "string" &&
    cardPaymentProviderStatuses.includes(input.status as CardPaymentProviderStatus)
      ? (input.status as CardPaymentProviderStatus)
      : null;

  return CARD_PAYMENT_REFERENCE.test(providerPaymentReference) && status
    ? Object.freeze({ providerPaymentReference, status })
    : null;
}
