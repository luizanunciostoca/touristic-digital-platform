import {
  createMoney,
  normalizeFinancialTimestamp,
  type Money,
} from "@touristic/financial";

const ID_BODY = /^[A-Za-z0-9_-]+$/u;
const REQUEST_KEY = /^business:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/u;

const orderIdBrand: unique symbol = Symbol("OrderId");
const orderRequestKeyBrand: unique symbol = Symbol("OrderRequestKey");

export type OrderId = string & { readonly [orderIdBrand]: true };
export type OrderRequestKey = string & {
  readonly [orderRequestKeyBrand]: true;
};

export const orderStatuses = Object.freeze([
  "draft",
  "pending_payment",
  "payment_confirmed",
  "cancelled",
] as const);

export type OrderStatus = (typeof orderStatuses)[number];

export interface OrderSourceReference {
  readonly kind: "business_onboarding";
  readonly reference: string;
}

export interface PricingQuote {
  readonly planId: string;
  readonly planName: string;
  readonly amount: Money;
  readonly pricingVersion: string;
}

export interface OrderPricingSnapshot extends PricingQuote {
  readonly capturedAt: string;
}

export interface Order {
  readonly id: OrderId;
  readonly requestKey: OrderRequestKey;
  readonly source: OrderSourceReference;
  readonly status: OrderStatus;
  readonly pricing: OrderPricingSnapshot;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface OrderRepositoryPort {
  findById(orderId: OrderId): Promise<Order | null>;
  findByRequestKey(requestKey: OrderRequestKey): Promise<Order | null>;
  save(order: Order): Promise<Order>;
}

export interface OrderPricingAuthorityPort {
  resolvePlan(planId: string): Promise<PricingQuote | null>;
}

export interface OrderPlacedEvent {
  readonly eventId: string;
  readonly type: "OrderPlaced";
  readonly version: 1;
  readonly occurredAt: string;
  readonly orderId: OrderId;
  readonly requestKey: OrderRequestKey;
  readonly source: OrderSourceReference;
  readonly total: Money;
}

function normalizeString(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function normalizeSafeReference(value: unknown, maxLength: number): string {
  const normalized = normalizeString(value, maxLength);
  return normalized && ID_BODY.test(normalized) ? normalized : "";
}

export function normalizeOrderId(value: unknown): OrderId | null {
  const normalized = normalizeString(value, 120);
  if (!normalized.startsWith("ord_")) return null;
  const body = normalized.slice("ord_".length);
  if (body.length < 8 || !ID_BODY.test(body)) return null;
  return normalized as OrderId;
}

export function createBusinessOrderRequestKey(
  sessionId: unknown,
  planId: unknown,
): OrderRequestKey | null {
  const session = normalizeSafeReference(sessionId, 120);
  const plan = normalizeSafeReference(planId, 80);
  if (!session || !plan) return null;
  return `business:${session}:${plan}` as OrderRequestKey;
}

export function normalizeOrderRequestKey(
  value: unknown,
): OrderRequestKey | null {
  const normalized = normalizeString(value, 220);
  return REQUEST_KEY.test(normalized) ? (normalized as OrderRequestKey) : null;
}

export function normalizeOrderSourceReference(
  value: unknown,
): OrderSourceReference | null {
  const reference = normalizeSafeReference(value, 120);
  if (!reference) return null;
  return Object.freeze({
    kind: "business_onboarding" as const,
    reference,
  });
}

export function createPricingQuote(input: {
  readonly planId: unknown;
  readonly planName: unknown;
  readonly minorUnits: unknown;
  readonly currency: unknown;
  readonly pricingVersion: unknown;
}): PricingQuote | null {
  const planId = normalizeSafeReference(input.planId, 80);
  const planName = normalizeString(input.planName, 160);
  const pricingVersion = normalizeSafeReference(input.pricingVersion, 80);
  const amount = createMoney(input.minorUnits, input.currency);
  if (!planId || !planName || !pricingVersion || !amount) return null;
  return Object.freeze({ planId, planName, amount, pricingVersion });
}

export function capturePricingSnapshot(
  quote: PricingQuote,
  capturedAt: unknown,
): OrderPricingSnapshot | null {
  const timestamp = normalizeFinancialTimestamp(capturedAt);
  if (!timestamp) return null;
  const amount = createMoney(quote.amount.minorUnits, quote.amount.currency);
  if (!amount) return null;
  return Object.freeze({
    planId: quote.planId,
    planName: quote.planName,
    amount,
    pricingVersion: quote.pricingVersion,
    capturedAt: timestamp,
  });
}

export function createOrder(input: {
  readonly id: OrderId;
  readonly requestKey: OrderRequestKey;
  readonly source: OrderSourceReference;
  readonly status?: OrderStatus;
  readonly pricing: OrderPricingSnapshot;
  readonly createdAt: unknown;
  readonly updatedAt?: unknown;
}): Order | null {
  const createdAt = normalizeFinancialTimestamp(input.createdAt);
  const updatedAt = normalizeFinancialTimestamp(
    input.updatedAt ?? input.createdAt,
  );
  if (!createdAt || !updatedAt) return null;
  if (
    !normalizeOrderId(input.id) ||
    !normalizeOrderRequestKey(input.requestKey)
  ) {
    return null;
  }
  const source = normalizeOrderSourceReference(input.source.reference);
  if (!source || source.kind !== input.source.kind) return null;
  const pricing = capturePricingSnapshot(
    input.pricing,
    input.pricing.capturedAt,
  );
  if (!pricing) return null;

  return Object.freeze({
    id: input.id,
    requestKey: input.requestKey,
    source,
    status: input.status ?? "draft",
    pricing,
    createdAt,
    updatedAt,
  });
}

export function isOrderTransitionAllowed(
  from: OrderStatus,
  to: OrderStatus,
): boolean {
  if (from === to) return true;
  if (from === "draft") return to === "pending_payment" || to === "cancelled";
  if (from === "pending_payment") {
    return to === "payment_confirmed" || to === "cancelled";
  }
  return false;
}

export function assertOrderTransition(
  from: OrderStatus,
  to: OrderStatus,
): void {
  if (!isOrderTransitionAllowed(from, to)) {
    throw new Error(`ORDERING_INVALID_TRANSITION:${from}:${to}`);
  }
}
