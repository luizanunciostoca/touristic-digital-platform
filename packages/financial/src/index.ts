const ID_BODY = /^[A-Za-z0-9_-]+$/u;
const CURRENCY = /^[A-Z]{3}$/u;
const ACCOUNT_REFERENCE = /^[A-Za-z0-9:_-]+$/u;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;

const currencyBrand: unique symbol = Symbol("CurrencyCode");
const paymentIdBrand: unique symbol = Symbol("PaymentId");
const ledgerTransactionIdBrand: unique symbol = Symbol("LedgerTransactionId");
const financialEventIdBrand: unique symbol = Symbol("FinancialEventId");
const paymentIdempotencyKeyBrand: unique symbol = Symbol(
  "PaymentIdempotencyKey",
);

export type CurrencyCode = string & { readonly [currencyBrand]: true };
export type PaymentId = string & { readonly [paymentIdBrand]: true };
export type LedgerTransactionId = string & {
  readonly [ledgerTransactionIdBrand]: true;
};
export type FinancialEventId = string & {
  readonly [financialEventIdBrand]: true;
};
export type PaymentIdempotencyKey = string & {
  readonly [paymentIdempotencyKeyBrand]: true;
};

export interface Money {
  readonly minorUnits: number;
  readonly currency: CurrencyCode;
}

export const paymentStatuses = Object.freeze([
  "pending",
  "confirmed",
  "failed",
  "cancelled",
  "expired",
  "refunded",
] as const);

export type PaymentStatus = (typeof paymentStatuses)[number];

export interface FinancialSubjectReference {
  readonly kind: "order";
  readonly reference: string;
}

export interface Payment {
  readonly id: PaymentId;
  readonly idempotencyKey: PaymentIdempotencyKey;
  readonly subject: FinancialSubjectReference;
  readonly amount: Money;
  readonly status: PaymentStatus;
  readonly providerReference: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly confirmedAt: string | null;
  readonly refundedAt: string | null;
}

export interface PaymentRepositoryPort {
  findById(paymentId: PaymentId): Promise<Payment | null>;
  save(payment: Payment): Promise<Payment>;
}

export interface PaymentIdempotencyClaim {
  readonly claimed: boolean;
  readonly paymentId: PaymentId;
}

export interface PaymentIdempotencyPort {
  claim(
    key: PaymentIdempotencyKey,
    proposedPaymentId: PaymentId,
  ): Promise<PaymentIdempotencyClaim>;
  find(key: PaymentIdempotencyKey): Promise<PaymentId | null>;
}

export interface CheckoutCustomer {
  readonly name: string;
  readonly email: string;
  readonly phone: string | null;
  readonly document: string | null;
}

export interface CheckoutProviderRequest {
  readonly paymentId: PaymentId;
  readonly idempotencyKey: PaymentIdempotencyKey;
  readonly amount: Money;
  readonly description: string;
  readonly returnUrl: string;
  readonly webhookUrl: string;
  readonly customer: CheckoutCustomer;
  readonly metadata: Readonly<Record<string, string>>;
}

export interface CheckoutProviderSession {
  readonly providerCheckoutId: string;
  readonly checkoutUrl: string;
  readonly providerReference: string | null;
}

export interface FinancialCheckoutProviderPort {
  createCheckout(
    input: CheckoutProviderRequest,
  ): Promise<CheckoutProviderSession>;
}

export const providerPaymentStatuses = Object.freeze([
  "paid",
  "failed",
  "cancelled",
  "expired",
  "refunded",
] as const);

export type ProviderPaymentStatus = (typeof providerPaymentStatuses)[number];

export interface VerifiedProviderPaymentEvent {
  readonly providerEventId: string;
  readonly externalReference: string;
  readonly providerPaymentReference: string | null;
  readonly status: ProviderPaymentStatus;
  readonly occurredAt: string;
}

export interface FinancialWebhookVerifierPort {
  verify(
    rawBody: Uint8Array,
    signature: string,
  ): Promise<VerifiedProviderPaymentEvent | null>;
}

export type LedgerDirection = "debit" | "credit";

export interface LedgerPosting {
  readonly accountReference: string;
  readonly direction: LedgerDirection;
  readonly amount: Money;
}

export interface LedgerTransaction {
  readonly id: LedgerTransactionId;
  readonly externalKey: string;
  readonly occurredAt: string;
  readonly postings: readonly LedgerPosting[];
}

export interface LedgerTransactionRepositoryPort {
  append(transaction: LedgerTransaction): Promise<void>;
  findByExternalKey(externalKey: string): Promise<LedgerTransaction | null>;
}

export interface PaymentApprovedEvent {
  readonly eventId: FinancialEventId;
  readonly type: "PaymentApproved";
  readonly version: 1;
  readonly occurredAt: string;
  readonly paymentId: PaymentId;
  readonly orderReference: string;
  readonly amount: Money;
  readonly paymentReference: string | null;
}

export interface PaymentRefundedEvent {
  readonly eventId: FinancialEventId;
  readonly type: "PaymentRefunded";
  readonly version: 1;
  readonly occurredAt: string;
  readonly paymentId: PaymentId;
  readonly orderReference: string;
  readonly amount: Money;
  readonly refundReference: string | null;
}

export type FinancialDomainEvent = PaymentApprovedEvent | PaymentRefundedEvent;

function normalizeString(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maxLength
    ? normalized
    : "";
}

function normalizePrefixedId(
  value: unknown,
  prefix: string,
  maxLength = 120,
): string {
  const normalized = normalizeString(value, maxLength);
  if (!normalized.startsWith(prefix)) return "";
  const body = normalized.slice(prefix.length);
  if (body.length < 8 || !ID_BODY.test(body)) return "";
  return normalized;
}

export function normalizeCurrencyCode(value: unknown): CurrencyCode | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return CURRENCY.test(normalized) ? (normalized as CurrencyCode) : null;
}

export function createMoney(
  minorUnits: unknown,
  currency: unknown,
): Money | null {
  if (
    typeof minorUnits !== "number" ||
    !Number.isSafeInteger(minorUnits) ||
    minorUnits < 0
  ) {
    return null;
  }
  const normalizedCurrency = normalizeCurrencyCode(currency);
  if (!normalizedCurrency) return null;
  return Object.freeze({
    minorUnits,
    currency: normalizedCurrency,
  });
}

export function addMoney(left: Money, right: Money): Money {
  if (left.currency !== right.currency) {
    throw new Error("FINANCIAL_CURRENCY_MISMATCH");
  }
  const total = left.minorUnits + right.minorUnits;
  if (!Number.isSafeInteger(total)) {
    throw new Error("FINANCIAL_AMOUNT_OVERFLOW");
  }
  const money = createMoney(total, left.currency);
  if (!money) throw new Error("FINANCIAL_INVALID_MONEY");
  return money;
}

export function normalizePaymentId(value: unknown): PaymentId | null {
  const normalized = normalizePrefixedId(value, "pay_");
  return normalized ? (normalized as PaymentId) : null;
}

export function normalizeLedgerTransactionId(
  value: unknown,
): LedgerTransactionId | null {
  const normalized = normalizePrefixedId(value, "led_");
  return normalized ? (normalized as LedgerTransactionId) : null;
}

export function normalizeFinancialEventId(
  value: unknown,
): FinancialEventId | null {
  const normalized = normalizePrefixedId(value, "fev_");
  return normalized ? (normalized as FinancialEventId) : null;
}

export function normalizeFinancialReference(
  value: unknown,
  maxLength = 160,
): string {
  const normalized = normalizeString(value, maxLength);
  return normalized && ID_BODY.test(normalized) ? normalized : "";
}

export function normalizeFinancialTimestamp(value: unknown): string {
  const normalized = normalizeString(value, 40);
  if (!normalized || !ISO_TIMESTAMP.test(normalized)) return "";
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? normalized : "";
}

export function createPaymentIdempotencyKey(
  orderReference: unknown,
): PaymentIdempotencyKey | null {
  const normalized = normalizeFinancialReference(orderReference, 120);
  if (!normalized) return null;
  return `payment:v1:${normalized}` as PaymentIdempotencyKey;
}

const PROVIDER_METADATA_KEY = /^[A-Za-z0-9_.:-]{1,80}$/u;
const PROVIDER_REFERENCE = /^[A-Za-z0-9._:-]{4,160}$/u;
const PROVIDER_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

function normalizeProviderText(value: unknown, maxLength: number): string {
  const normalized = normalizeString(value, maxLength);
  if (!normalized) return "";
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

function normalizeProviderUrl(value: unknown): string {
  const normalized = normalizeProviderText(value, 2_048);
  if (!normalized) return "";
  try {
    const url = new URL(normalized);
    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      url.username ||
      url.password
    ) {
      return "";
    }
    return url.toString();
  } catch {
    return "";
  }
}

function normalizeProviderIdempotencyKey(
  value: unknown,
): PaymentIdempotencyKey | null {
  const normalized = normalizeString(value, 256);
  const prefix = "payment:v1:";
  if (!normalized.startsWith(prefix)) return null;
  const expected = createPaymentIdempotencyKey(normalized.slice(prefix.length));
  return expected === normalized ? expected : null;
}

export function createCheckoutProviderRequest(input: {
  readonly paymentId: unknown;
  readonly idempotencyKey: unknown;
  readonly amount: unknown;
  readonly description: unknown;
  readonly returnUrl: unknown;
  readonly webhookUrl: unknown;
  readonly customer: unknown;
  readonly metadata: unknown;
}): CheckoutProviderRequest | null {
  const paymentId = normalizePaymentId(input.paymentId);
  const idempotencyKey = normalizeProviderIdempotencyKey(input.idempotencyKey);
  const amountInput = input.amount as Partial<Money> | null | undefined;
  const amount = createMoney(amountInput?.minorUnits, amountInput?.currency);
  const description = normalizeProviderText(input.description, 240);
  const returnUrl = normalizeProviderUrl(input.returnUrl);
  const webhookUrl = normalizeProviderUrl(input.webhookUrl);
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
    !amount ||
    amount.minorUnits <= 0 ||
    !description ||
    !returnUrl ||
    !webhookUrl ||
    !customerInput ||
    !metadataInput
  ) {
    return null;
  }

  const name = normalizeProviderText(customerInput.name, 160);
  const email = normalizeProviderText(customerInput.email, 200).toLowerCase();
  const phone =
    customerInput.phone === null
      ? null
      : normalizeProviderText(customerInput.phone, 40);
  const document =
    customerInput.document === null
      ? null
      : normalizeProviderText(customerInput.document, 40);
  if (
    !name ||
    !PROVIDER_EMAIL.test(email) ||
    (customerInput.phone !== null && !phone) ||
    (customerInput.document !== null && !document)
  ) {
    return null;
  }

  const entries = Object.entries(metadataInput);
  if (entries.length > 20) return null;
  const metadata: Record<string, string> = {};
  for (const [key, rawValue] of entries.sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const value = normalizeProviderText(rawValue, 200);
    if (!PROVIDER_METADATA_KEY.test(key) || !value) return null;
    metadata[key] = value;
  }

  return Object.freeze({
    paymentId,
    idempotencyKey,
    amount,
    description,
    returnUrl,
    webhookUrl,
    customer: Object.freeze({ name, email, phone, document }),
    metadata: Object.freeze(metadata),
  });
}

export function normalizeCheckoutProviderSession(
  input: Readonly<{
    providerCheckoutId?: unknown;
    checkoutUrl?: unknown;
    providerReference?: unknown;
  }>,
): CheckoutProviderSession | null {
  const providerCheckoutId = normalizeProviderText(
    input.providerCheckoutId,
    160,
  );
  const checkoutUrl = normalizeProviderUrl(input.checkoutUrl);
  const providerReference =
    input.providerReference === null
      ? null
      : normalizeProviderText(input.providerReference, 160);
  if (
    !PROVIDER_REFERENCE.test(providerCheckoutId) ||
    !checkoutUrl ||
    (providerReference !== null && !PROVIDER_REFERENCE.test(providerReference))
  ) {
    return null;
  }
  return Object.freeze({
    providerCheckoutId,
    checkoutUrl,
    providerReference,
  });
}

export function createPendingPayment(input: {
  readonly id: unknown;
  readonly orderReference: unknown;
  readonly amount: Money;
  readonly createdAt: unknown;
}): Payment | null {
  const id = normalizePaymentId(input.id);
  const orderReference = normalizeFinancialReference(input.orderReference, 120);
  const idempotencyKey = createPaymentIdempotencyKey(orderReference);
  const amountInput = input.amount as Partial<Money> | null | undefined;
  const amount = createMoney(amountInput?.minorUnits, amountInput?.currency);
  const createdAt = normalizeFinancialTimestamp(input.createdAt);

  if (
    !id ||
    !orderReference ||
    !idempotencyKey ||
    !amount ||
    amount.minorUnits === 0 ||
    !createdAt
  ) {
    return null;
  }

  const canonicalCreatedAt = new Date(createdAt).toISOString();
  return Object.freeze({
    id,
    idempotencyKey,
    subject: Object.freeze({
      kind: "order" as const,
      reference: orderReference,
    }),
    amount,
    status: "pending" as const,
    providerReference: null,
    createdAt: canonicalCreatedAt,
    updatedAt: canonicalCreatedAt,
    confirmedAt: null,
    refundedAt: null,
  });
}

export function isPaymentTransitionAllowed(
  from: PaymentStatus,
  to: PaymentStatus,
): boolean {
  if (from === to) return true;
  if (from === "pending") {
    return ["confirmed", "failed", "cancelled", "expired"].includes(to);
  }
  if (from === "confirmed") return to === "refunded";
  return false;
}

export function assertPaymentTransition(
  from: PaymentStatus,
  to: PaymentStatus,
): void {
  if (!isPaymentTransitionAllowed(from, to)) {
    throw new Error(`FINANCIAL_INVALID_PAYMENT_TRANSITION:${from}:${to}`);
  }
}

function normalizeLedgerPosting(value: LedgerPosting): LedgerPosting {
  const accountReference = normalizeString(value.accountReference, 120);
  if (!accountReference || !ACCOUNT_REFERENCE.test(accountReference)) {
    throw new Error("FINANCIAL_INVALID_LEDGER_ACCOUNT");
  }
  if (value.direction !== "debit" && value.direction !== "credit") {
    throw new Error("FINANCIAL_INVALID_LEDGER_DIRECTION");
  }
  const amount = createMoney(value.amount.minorUnits, value.amount.currency);
  if (!amount || amount.minorUnits === 0) {
    throw new Error("FINANCIAL_INVALID_LEDGER_AMOUNT");
  }
  return Object.freeze({
    accountReference,
    direction: value.direction,
    amount,
  });
}

export function createLedgerTransaction(input: {
  readonly id: LedgerTransactionId;
  readonly externalKey: string;
  readonly occurredAt: string;
  readonly postings: readonly LedgerPosting[];
}): LedgerTransaction {
  const id = normalizeLedgerTransactionId(input.id);
  const externalKey = normalizeString(input.externalKey, 160);
  const occurredAt = normalizeFinancialTimestamp(input.occurredAt);
  if (!id) throw new Error("FINANCIAL_INVALID_LEDGER_ID");
  if (!externalKey || !ID_BODY.test(externalKey)) {
    throw new Error("FINANCIAL_INVALID_LEDGER_EXTERNAL_KEY");
  }
  if (!occurredAt) throw new Error("FINANCIAL_INVALID_LEDGER_TIMESTAMP");
  if (input.postings.length < 2) {
    throw new Error("FINANCIAL_LEDGER_REQUIRES_BALANCED_POSTINGS");
  }

  const postings = input.postings.map(normalizeLedgerPosting);
  const currency = postings[0]?.amount.currency;
  if (
    !currency ||
    postings.some((posting) => posting.amount.currency !== currency)
  ) {
    throw new Error("FINANCIAL_LEDGER_CURRENCY_MISMATCH");
  }

  let debit = 0;
  let credit = 0;
  for (const posting of postings) {
    if (posting.direction === "debit") debit += posting.amount.minorUnits;
    else credit += posting.amount.minorUnits;
    if (!Number.isSafeInteger(debit) || !Number.isSafeInteger(credit)) {
      throw new Error("FINANCIAL_AMOUNT_OVERFLOW");
    }
  }
  if (debit !== credit) {
    throw new Error("FINANCIAL_LEDGER_UNBALANCED");
  }

  return Object.freeze({
    id,
    externalKey,
    occurredAt,
    postings: Object.freeze(postings),
  });
}
