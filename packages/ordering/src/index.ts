import {
  createMoney,
  createPaymentIdempotencyKey,
  createPendingPayment,
  normalizeFinancialTimestamp,
  normalizePaymentId,
  type Money,
  type Payment,
  type PaymentId,
  type PaymentIdempotencyPort,
  type PaymentRepositoryPort,
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
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maxLength
    ? normalized
    : "";
}

function normalizeSafeReference(value: unknown, maxLength: number): string {
  const normalized = normalizeString(value, maxLength);
  return normalized && ID_BODY.test(normalized) ? normalized : "";
}

function isOrderStatus(value: unknown): value is OrderStatus {
  return (
    typeof value === "string" && orderStatuses.includes(value as OrderStatus)
  );
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
  return normalized && REQUEST_KEY.test(normalized)
    ? (normalized as OrderRequestKey)
    : null;
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
  const normalizedQuote = createPricingQuote({
    planId: quote.planId,
    planName: quote.planName,
    minorUnits: quote.amount.minorUnits,
    currency: quote.amount.currency,
    pricingVersion: quote.pricingVersion,
  });
  if (!timestamp || !normalizedQuote) return null;
  return Object.freeze({
    ...normalizedQuote,
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
  const id = normalizeOrderId(input.id);
  const requestKey = normalizeOrderRequestKey(input.requestKey);
  const source = normalizeOrderSourceReference(input.source.reference);
  const status = input.status ?? "draft";
  const pricing = capturePricingSnapshot(
    input.pricing,
    input.pricing.capturedAt,
  );

  if (
    !createdAt ||
    !updatedAt ||
    !id ||
    !requestKey ||
    !source ||
    source.kind !== input.source.kind ||
    !isOrderStatus(status) ||
    !pricing
  ) {
    return null;
  }

  return Object.freeze({
    id,
    requestKey,
    source,
    status,
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

export interface CheckoutApplicationRequest {
  readonly sessionId: unknown;
  readonly planId: unknown;
  readonly contractor: unknown;
  readonly businessDraft: unknown;
  readonly acceptedTerms: unknown;
  readonly returnUrl: unknown;
  readonly tutorial: unknown;
  readonly requiresPaymentsCapability: unknown;
}

export interface ValidatedCheckoutContractor {
  readonly name: string;
  readonly email: string;
  readonly phone: string;
  readonly document: string;
}

export interface ValidatedCheckoutBusinessDraft {
  readonly demoBusinessId: string | null;
  readonly displayName: string;
  readonly categoryId: string;
  readonly specialty: string;
  readonly environment: "sandbox";
  readonly publishable: false;
}

export type ValidatedCheckoutAcceptanceType = "terms" | "privacy" | "marketing";

export interface ValidatedCheckoutAcceptance {
  readonly type: ValidatedCheckoutAcceptanceType;
  readonly version: string;
  readonly acceptedAt: string;
}

export interface ValidatedBusinessCheckoutHandoff {
  readonly sessionId: string;
  readonly planId: string;
  readonly contractor: ValidatedCheckoutContractor;
  readonly businessDraft: ValidatedCheckoutBusinessDraft;
  readonly acceptedTerms: readonly ValidatedCheckoutAcceptance[];
  readonly returnUrl: string;
  readonly tutorial: false;
  readonly requiresPaymentsCapability: true;
}

export interface CheckoutIdentityPort {
  allocateOrderId(): unknown;
  allocatePaymentId(): unknown;
}

export interface CheckoutClockPort {
  now(): unknown;
}

export interface ProviderNeutralCheckoutDependencies {
  readonly orders: OrderRepositoryPort;
  readonly pricing: OrderPricingAuthorityPort;
  readonly payments: PaymentRepositoryPort;
  readonly paymentIdempotency: PaymentIdempotencyPort;
  readonly identities: CheckoutIdentityPort;
  readonly clock: CheckoutClockPort;
}

export interface ProviderNeutralCheckoutResult {
  readonly order: Order;
  readonly payment: Payment;
  readonly replayed: boolean;
}

export interface ProviderNeutralCheckoutApplicationService {
  startCheckout(
    input: CheckoutApplicationRequest,
  ): Promise<ProviderNeutralCheckoutResult>;
}

export const checkoutApplicationErrorCodes = Object.freeze([
  "CHECKOUT_INVALID_HANDOFF",
  "CHECKOUT_PLAN_NOT_CONFIGURED",
  "CHECKOUT_PRICING_AUTHORITY_INVALID",
  "CHECKOUT_INVALID_IDENTITY",
  "CHECKOUT_INVALID_CLOCK",
  "CHECKOUT_ORDER_CONFLICT",
  "CHECKOUT_ORDER_NOT_REUSABLE",
  "CHECKOUT_PAYMENT_CONFLICT",
] as const);

export type CheckoutApplicationErrorCode =
  (typeof checkoutApplicationErrorCodes)[number];

export class CheckoutApplicationError extends Error {
  readonly code: CheckoutApplicationErrorCode;

  constructor(code: CheckoutApplicationErrorCode) {
    super(code);
    this.name = "CheckoutApplicationError";
    this.code = code;
  }
}

const CHECKOUT_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const CHECKOUT_TEXT_FORBIDDEN = /[\u0000-\u001f\u007f<>]/u;
const CHECKOUT_ACCEPTANCE_TYPES = Object.freeze([
  "terms",
  "privacy",
  "marketing",
] as const);

function checkoutFailure(code: CheckoutApplicationErrorCode): never {
  throw new CheckoutApplicationError(code);
}

function checkoutRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeCheckoutText(value: unknown, maxLength: number): string {
  const normalized = normalizeString(value, maxLength);
  return normalized && !CHECKOUT_TEXT_FORBIDDEN.test(normalized)
    ? normalized
    : "";
}

function normalizeOptionalCheckoutText(
  value: unknown,
  maxLength: number,
): string | null {
  if (value === undefined || value === null) return null;
  return normalizeCheckoutText(value, maxLength) || null;
}

function normalizeCheckoutReturnUrl(value: unknown): string {
  const normalized = normalizeCheckoutText(value, 1_000);
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
  } catch {
    return "";
  }
  return normalized;
}

function normalizeCheckoutAcceptance(
  value: unknown,
): ValidatedCheckoutAcceptance | null {
  const record = checkoutRecord(value);
  if (!record) return null;
  const type = normalizeCheckoutText(record.type, 40);
  const version = normalizeCheckoutText(record.version, 100);
  const acceptedAt = normalizeFinancialTimestamp(record.acceptedAt);
  if (
    !CHECKOUT_ACCEPTANCE_TYPES.includes(
      type as ValidatedCheckoutAcceptanceType,
    ) ||
    !version ||
    !acceptedAt
  ) {
    return null;
  }
  return Object.freeze({
    type: type as ValidatedCheckoutAcceptanceType,
    version,
    acceptedAt: new Date(acceptedAt).toISOString(),
  });
}

export function normalizeBusinessCheckoutHandoff(
  input: CheckoutApplicationRequest,
): ValidatedBusinessCheckoutHandoff | null {
  const sessionId = normalizeSafeReference(input.sessionId, 120);
  const planId = normalizeSafeReference(input.planId, 80);
  const contractorInput = checkoutRecord(input.contractor);
  const draftInput = checkoutRecord(input.businessDraft);
  const returnUrl = normalizeCheckoutReturnUrl(input.returnUrl);

  if (
    !sessionId ||
    !planId ||
    !contractorInput ||
    !draftInput ||
    !returnUrl ||
    input.tutorial !== false ||
    input.requiresPaymentsCapability !== true
  ) {
    return null;
  }

  const name = normalizeCheckoutText(contractorInput.name, 160);
  const email = normalizeCheckoutText(contractorInput.email, 200).toLowerCase();
  const phone = normalizeCheckoutText(contractorInput.phone, 40);
  const document = normalizeCheckoutText(contractorInput.document, 40);
  if (!name || !CHECKOUT_EMAIL.test(email) || !phone || !document) {
    return null;
  }

  if (
    draftInput.environment !== "sandbox" ||
    draftInput.publishable !== false
  ) {
    return null;
  }

  const demoBusinessId =
    draftInput.demoBusinessId === undefined ||
    draftInput.demoBusinessId === null
      ? null
      : normalizeSafeReference(draftInput.demoBusinessId, 120);
  const displayName = normalizeOptionalCheckoutText(
    draftInput.displayName,
    180,
  );
  const categoryId =
    draftInput.categoryId === undefined || draftInput.categoryId === null
      ? null
      : normalizeSafeReference(draftInput.categoryId, 80);
  const specialty = normalizeOptionalCheckoutText(draftInput.specialty, 180);

  if (
    (draftInput.demoBusinessId !== undefined &&
      draftInput.demoBusinessId !== null &&
      !demoBusinessId) ||
    (draftInput.displayName !== undefined &&
      draftInput.displayName !== null &&
      !displayName) ||
    (draftInput.categoryId !== undefined &&
      draftInput.categoryId !== null &&
      !categoryId) ||
    (draftInput.specialty !== undefined &&
      draftInput.specialty !== null &&
      !specialty)
  ) {
    return null;
  }

  if (
    !Array.isArray(input.acceptedTerms) ||
    input.acceptedTerms.length === 0 ||
    input.acceptedTerms.length > 8
  ) {
    return null;
  }

  const acceptedTerms: ValidatedCheckoutAcceptance[] = [];
  const seenAcceptanceTypes = new Set<ValidatedCheckoutAcceptanceType>();
  for (const rawAcceptance of input.acceptedTerms) {
    const acceptance = normalizeCheckoutAcceptance(rawAcceptance);
    if (!acceptance || seenAcceptanceTypes.has(acceptance.type)) {
      return null;
    }
    seenAcceptanceTypes.add(acceptance.type);
    acceptedTerms.push(acceptance);
  }
  if (
    !seenAcceptanceTypes.has("terms") ||
    !seenAcceptanceTypes.has("privacy")
  ) {
    return null;
  }

  return Object.freeze({
    sessionId,
    planId,
    contractor: Object.freeze({ name, email, phone, document }),
    businessDraft: Object.freeze({
      demoBusinessId,
      displayName: displayName ?? "",
      categoryId: categoryId ?? "",
      specialty: specialty ?? "",
      environment: "sandbox" as const,
      publishable: false as const,
    }),
    acceptedTerms: Object.freeze(acceptedTerms),
    returnUrl,
    tutorial: false as const,
    requiresPaymentsCapability: true as const,
  });
}

function canonicalCheckoutTimestamp(value: unknown): string {
  const normalized = normalizeFinancialTimestamp(value);
  if (!normalized) checkoutFailure("CHECKOUT_INVALID_CLOCK");
  return new Date(normalized).toISOString();
}

function laterCheckoutTimestamp(previous: string, candidate: string): string {
  const previousMs = Date.parse(previous);
  const candidateMs = Date.parse(candidate);
  if (!Number.isFinite(previousMs) || !Number.isFinite(candidateMs)) {
    checkoutFailure("CHECKOUT_INVALID_CLOCK");
  }
  return new Date(Math.max(candidateMs, previousMs + 1)).toISOString();
}

function assertOrderMatchesHandoff(
  order: Order,
  handoff: ValidatedBusinessCheckoutHandoff,
  requestKey: OrderRequestKey,
): void {
  if (
    order.requestKey !== requestKey ||
    order.source.kind !== "business_onboarding" ||
    order.source.reference !== handoff.sessionId ||
    order.pricing.planId !== handoff.planId ||
    order.pricing.amount.minorUnits <= 0
  ) {
    checkoutFailure("CHECKOUT_ORDER_CONFLICT");
  }
  if (order.status === "cancelled") {
    checkoutFailure("CHECKOUT_ORDER_NOT_REUSABLE");
  }
}

function assertPaymentMatchesOrder(
  payment: Payment,
  paymentId: PaymentId,
  order: Order,
): void {
  const idempotencyKey = createPaymentIdempotencyKey(order.id);
  if (
    !idempotencyKey ||
    payment.id !== paymentId ||
    payment.idempotencyKey !== idempotencyKey ||
    payment.subject.kind !== "order" ||
    payment.subject.reference !== order.id ||
    payment.amount.minorUnits !== order.pricing.amount.minorUnits ||
    payment.amount.currency !== order.pricing.amount.currency ||
    payment.createdAt !== order.createdAt
  ) {
    checkoutFailure("CHECKOUT_PAYMENT_CONFLICT");
  }
}

async function loadOrCreateCheckoutOrder(
  handoff: ValidatedBusinessCheckoutHandoff,
  dependencies: ProviderNeutralCheckoutDependencies,
): Promise<{ readonly order: Order; readonly replayed: boolean }> {
  const requestKey = createBusinessOrderRequestKey(
    handoff.sessionId,
    handoff.planId,
  );
  if (!requestKey) checkoutFailure("CHECKOUT_INVALID_HANDOFF");

  const existing = await dependencies.orders.findByRequestKey(requestKey);
  if (existing) {
    assertOrderMatchesHandoff(existing, handoff, requestKey);
    return Object.freeze({ order: existing, replayed: true });
  }

  const resolvedQuote = await dependencies.pricing.resolvePlan(handoff.planId);
  if (!resolvedQuote) checkoutFailure("CHECKOUT_PLAN_NOT_CONFIGURED");
  const quote = createPricingQuote({
    planId: resolvedQuote.planId,
    planName: resolvedQuote.planName,
    minorUnits: resolvedQuote.amount.minorUnits,
    currency: resolvedQuote.amount.currency,
    pricingVersion: resolvedQuote.pricingVersion,
  });
  if (
    !quote ||
    quote.planId !== handoff.planId ||
    quote.amount.minorUnits <= 0
  ) {
    checkoutFailure("CHECKOUT_PRICING_AUTHORITY_INVALID");
  }

  const createdAt = canonicalCheckoutTimestamp(dependencies.clock.now());
  const snapshot = capturePricingSnapshot(quote, createdAt);
  const orderId = normalizeOrderId(dependencies.identities.allocateOrderId());
  const source = normalizeOrderSourceReference(handoff.sessionId);
  if (!snapshot || !orderId || !source) {
    checkoutFailure("CHECKOUT_INVALID_IDENTITY");
  }
  const proposedOrder = createOrder({
    id: orderId,
    requestKey,
    source,
    pricing: snapshot,
    createdAt,
  });
  if (!proposedOrder) checkoutFailure("CHECKOUT_ORDER_CONFLICT");

  try {
    const persisted = await dependencies.orders.save(proposedOrder);
    if (persisted.id !== proposedOrder.id) {
      checkoutFailure("CHECKOUT_ORDER_CONFLICT");
    }
    assertOrderMatchesHandoff(persisted, handoff, requestKey);
    return Object.freeze({ order: persisted, replayed: false });
  } catch (error) {
    if (
      !(error instanceof Error) ||
      error.message !== "ORDERING_REQUEST_KEY_CONFLICT"
    ) {
      throw error;
    }
    const winner = await dependencies.orders.findByRequestKey(requestKey);
    if (!winner) checkoutFailure("CHECKOUT_ORDER_CONFLICT");
    assertOrderMatchesHandoff(winner, handoff, requestKey);
    return Object.freeze({ order: winner, replayed: true });
  }
}

async function loadOrCreateCheckoutPayment(
  order: Order,
  dependencies: ProviderNeutralCheckoutDependencies,
): Promise<{ readonly payment: Payment; readonly replayed: boolean }> {
  const idempotencyKey = createPaymentIdempotencyKey(order.id);
  if (!idempotencyKey) checkoutFailure("CHECKOUT_PAYMENT_CONFLICT");

  let paymentId = await dependencies.paymentIdempotency.find(idempotencyKey);
  let replayed = paymentId !== null;

  if (!paymentId) {
    const proposedPaymentId = normalizePaymentId(
      dependencies.identities.allocatePaymentId(),
    );
    if (!proposedPaymentId) checkoutFailure("CHECKOUT_INVALID_IDENTITY");
    const claim = await dependencies.paymentIdempotency.claim(
      idempotencyKey,
      proposedPaymentId,
    );
    const claimedPaymentId = normalizePaymentId(claim.paymentId);
    if (
      typeof claim.claimed !== "boolean" ||
      !claimedPaymentId ||
      claimedPaymentId !== claim.paymentId
    ) {
      checkoutFailure("CHECKOUT_PAYMENT_CONFLICT");
    }
    paymentId = claimedPaymentId;
    replayed = !claim.claimed;
  }

  const normalizedPaymentId = normalizePaymentId(paymentId);
  if (!normalizedPaymentId || normalizedPaymentId !== paymentId) {
    checkoutFailure("CHECKOUT_PAYMENT_CONFLICT");
  }

  let payment = await dependencies.payments.findById(normalizedPaymentId);
  if (!payment) {
    const pendingPayment = createPendingPayment({
      id: normalizedPaymentId,
      orderReference: order.id,
      amount: order.pricing.amount,
      createdAt: order.createdAt,
    });
    if (!pendingPayment) checkoutFailure("CHECKOUT_PAYMENT_CONFLICT");
    payment = await dependencies.payments.save(pendingPayment);
  } else {
    replayed = true;
  }

  assertPaymentMatchesOrder(payment, normalizedPaymentId, order);
  return Object.freeze({ payment, replayed });
}

async function ensureCheckoutOrderPendingPayment(
  order: Order,
  handoff: ValidatedBusinessCheckoutHandoff,
  dependencies: ProviderNeutralCheckoutDependencies,
): Promise<Order> {
  if (
    order.status === "pending_payment" ||
    order.status === "payment_confirmed"
  ) {
    return order;
  }
  if (order.status !== "draft") {
    checkoutFailure("CHECKOUT_ORDER_NOT_REUSABLE");
  }

  const candidateTime = canonicalCheckoutTimestamp(dependencies.clock.now());
  const updatedAt = laterCheckoutTimestamp(order.updatedAt, candidateTime);
  const pendingOrder = createOrder({
    ...order,
    status: "pending_payment",
    updatedAt,
  });
  if (!pendingOrder) checkoutFailure("CHECKOUT_ORDER_CONFLICT");

  try {
    return await dependencies.orders.save(pendingOrder);
  } catch (error) {
    if (
      !(error instanceof Error) ||
      (error.message !== "ORDERING_CONCURRENT_ORDER_MODIFICATION" &&
        error.message !== "ORDERING_STALE_ORDER_UPDATE")
    ) {
      throw error;
    }
    const current = await dependencies.orders.findById(order.id);
    if (
      !current ||
      (current.status !== "pending_payment" &&
        current.status !== "payment_confirmed")
    ) {
      checkoutFailure("CHECKOUT_ORDER_CONFLICT");
    }
    assertOrderMatchesHandoff(current, handoff, order.requestKey);
    return current;
  }
}

export function createProviderNeutralCheckoutApplicationService(
  dependencies: ProviderNeutralCheckoutDependencies,
): ProviderNeutralCheckoutApplicationService {
  return Object.freeze({
    async startCheckout(
      input: CheckoutApplicationRequest,
    ): Promise<ProviderNeutralCheckoutResult> {
      const handoff = normalizeBusinessCheckoutHandoff(input);
      if (!handoff) checkoutFailure("CHECKOUT_INVALID_HANDOFF");

      const orderResult = await loadOrCreateCheckoutOrder(
        handoff,
        dependencies,
      );
      const paymentResult = await loadOrCreateCheckoutPayment(
        orderResult.order,
        dependencies,
      );
      const order = await ensureCheckoutOrderPendingPayment(
        orderResult.order,
        handoff,
        dependencies,
      );

      return Object.freeze({
        order,
        payment: paymentResult.payment,
        replayed: orderResult.replayed || paymentResult.replayed,
      });
    },
  });
}
