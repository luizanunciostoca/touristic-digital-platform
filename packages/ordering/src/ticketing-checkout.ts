import {
  createPaymentIdempotencyKey,
  createPendingPayment,
  normalizePaymentId,
  type Payment,
  type PaymentIdempotencyPort,
  type PaymentRepositoryPort,
} from "@touristic/financial";

import {
  normalizeOrderId,
  type Order,
  type OrderRepositoryPort,
} from "./index.js";
import {
  normalizeTicketingReservationReference,
  type TicketingOrderBindingRepositoryPort,
} from "./ticketing-reservation.js";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export interface TicketingCheckoutApplicationRequest {
  readonly reservationReference: unknown;
  readonly customer: unknown;
  readonly returnUrl: unknown;
  readonly requiresPaymentsCapability: unknown;
}

export interface ValidatedTicketingCheckoutHandoff {
  readonly reservationReference: string;
  readonly customer: Readonly<{
    name: string;
    email: string;
    phone: string | null;
    document: string | null;
  }>;
  readonly returnUrl: string;
  readonly requiresPaymentsCapability: true;
}

export interface TicketingCheckoutApplicationResult {
  readonly order: Order;
  readonly payment: Payment;
  readonly replayed: boolean;
}

export interface TicketingCheckoutApplicationService {
  startCheckout(
    input: TicketingCheckoutApplicationRequest,
  ): Promise<TicketingCheckoutApplicationResult>;
}

function text(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  if (!normalized || normalized.length > max) return "";
  const invalid = [...normalized].some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code <= 31 || code === 127 || character === "<" || character === ">";
  });
  return invalid ? "" : normalized;
}

function optionalText(value: unknown, max: number): string | null {
  if (value === null || value === undefined || value === "") return null;
  return text(value, max) || null;
}

function returnUrl(value: unknown): string {
  const normalized = text(value, 1_000);
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
    return normalized;
  } catch {
    return "";
  }
}

export function normalizeTicketingCheckoutHandoff(
  input: TicketingCheckoutApplicationRequest,
): ValidatedTicketingCheckoutHandoff | null {
  const reservationReference = normalizeTicketingReservationReference(
    input.reservationReference,
  );
  const customerInput =
    input.customer !== null &&
    typeof input.customer === "object" &&
    !Array.isArray(input.customer)
      ? (input.customer as Record<string, unknown>)
      : null;
  const url = returnUrl(input.returnUrl);
  if (
    !reservationReference ||
    !customerInput ||
    !url ||
    input.requiresPaymentsCapability !== true
  ) {
    return null;
  }
  const name = text(customerInput.name, 160);
  const email = text(customerInput.email, 200).toLowerCase();
  const phone = optionalText(customerInput.phone, 40);
  const document = optionalText(customerInput.document, 40);
  if (!name || !EMAIL.test(email)) return null;
  if (
    (customerInput.phone !== undefined &&
      customerInput.phone !== null &&
      customerInput.phone !== "" &&
      !phone) ||
    (customerInput.document !== undefined &&
      customerInput.document !== null &&
      customerInput.document !== "" &&
      !document)
  ) {
    return null;
  }
  return Object.freeze({
    reservationReference,
    customer: Object.freeze({ name, email, phone, document }),
    returnUrl: url,
    requiresPaymentsCapability: true as const,
  });
}

function assertOrder(
  order: Order,
  reservationReference: string,
  binding: Awaited<
    ReturnType<
      TicketingOrderBindingRepositoryPort["findByReservationReference"]
    >
  >,
): void {
  if (
    !binding ||
    binding.orderId !== order.id ||
    order.source.kind !== "ticketing_reservation" ||
    order.source.reference !== reservationReference ||
    order.status === "cancelled" ||
    (order.status !== "pending_payment" &&
      order.status !== "payment_confirmed") ||
    order.pricing.amount.minorUnits !== binding.amount.minorUnits ||
    order.pricing.amount.currency !== binding.amount.currency ||
    order.pricing.pricingVersion !== binding.pricingVersion ||
    order.pricing.planName !== binding.productReference
  ) {
    throw new Error("ORDERING_TICKETING_CHECKOUT_CONFLICT");
  }
}

function assertPayment(payment: Payment, order: Order): void {
  const key = createPaymentIdempotencyKey(order.id);
  if (
    !key ||
    payment.idempotencyKey !== key ||
    payment.subject.kind !== "order" ||
    payment.subject.reference !== order.id ||
    payment.amount.minorUnits !== order.pricing.amount.minorUnits ||
    payment.amount.currency !== order.pricing.amount.currency ||
    payment.createdAt !== order.createdAt
  ) {
    throw new Error("ORDERING_TICKETING_PAYMENT_CONFLICT");
  }
}

export function createTicketingCheckoutApplicationService(dependencies: {
  readonly orders: OrderRepositoryPort;
  readonly bindings: TicketingOrderBindingRepositoryPort;
  readonly payments: PaymentRepositoryPort;
  readonly paymentIdempotency: PaymentIdempotencyPort;
  readonly identities: { allocatePaymentId(): unknown };
}): TicketingCheckoutApplicationService {
  return Object.freeze({
    async startCheckout(
      input: TicketingCheckoutApplicationRequest,
    ): Promise<TicketingCheckoutApplicationResult> {
      const handoff = normalizeTicketingCheckoutHandoff(input);
      if (!handoff) throw new Error("ORDERING_TICKETING_CHECKOUT_INVALID");
      const binding = await dependencies.bindings.findByReservationReference(
        handoff.reservationReference,
      );
      if (!binding) throw new Error("ORDERING_TICKETING_BINDING_NOT_FOUND");
      const orderId = normalizeOrderId(binding.orderId);
      if (!orderId) throw new Error("ORDERING_TICKETING_CHECKOUT_CONFLICT");
      const order = await dependencies.orders.findById(orderId);
      if (!order) throw new Error("ORDERING_TICKETING_ORDER_NOT_FOUND");
      assertOrder(order, handoff.reservationReference, binding);

      const idempotencyKey = createPaymentIdempotencyKey(order.id);
      if (!idempotencyKey)
        throw new Error("ORDERING_TICKETING_PAYMENT_CONFLICT");
      let paymentId =
        await dependencies.paymentIdempotency.find(idempotencyKey);
      let replayed = paymentId !== null;
      if (!paymentId) {
        const proposedPaymentId = normalizePaymentId(
          dependencies.identities.allocatePaymentId(),
        );
        if (!proposedPaymentId) {
          throw new Error("ORDERING_TICKETING_PAYMENT_ID_INVALID");
        }
        const claim = await dependencies.paymentIdempotency.claim(
          idempotencyKey,
          proposedPaymentId,
        );
        paymentId = normalizePaymentId(claim.paymentId);
        if (!paymentId) throw new Error("ORDERING_TICKETING_PAYMENT_CONFLICT");
        replayed = !claim.claimed;
      }

      let payment = await dependencies.payments.findById(paymentId);
      if (!payment) {
        const proposed = createPendingPayment({
          id: paymentId,
          orderReference: order.id,
          amount: order.pricing.amount,
          createdAt: order.createdAt,
        });
        if (!proposed) throw new Error("ORDERING_TICKETING_PAYMENT_CONFLICT");
        payment = await dependencies.payments.save(proposed);
      } else {
        replayed = true;
      }
      assertPayment(payment, order);
      return Object.freeze({ order, payment, replayed });
    },
  });
}
