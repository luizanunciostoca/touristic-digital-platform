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
  normalizeRestaurantReservationReference,
  type RestaurantReservationOrderBindingRepositoryPort,
} from "./restaurant-reservation.js";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export interface RestaurantCheckoutApplicationRequest {
  readonly reservationReference: unknown;
  readonly customer: unknown;
  readonly returnUrl: unknown;
  readonly requiresPaymentsCapability: unknown;
}

export interface ValidatedRestaurantCheckoutHandoff {
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

function text(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  if (!normalized || normalized.length > max) return "";
  return normalized;
}

function optionalText(value: unknown, max: number): string | null {
  if (value === null || value === undefined || value === "") return null;
  return text(value, max) || null;
}

function normalizeReturnUrl(value: unknown): string {
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

export function normalizeRestaurantCheckoutHandoff(
  input: RestaurantCheckoutApplicationRequest,
): ValidatedRestaurantCheckoutHandoff | null {
  const reservationReference = normalizeRestaurantReservationReference(
    input.reservationReference,
  );
  const customerInput =
    input.customer !== null &&
    typeof input.customer === "object" &&
    !Array.isArray(input.customer)
      ? (input.customer as Record<string, unknown>)
      : null;
  const returnUrl = normalizeReturnUrl(input.returnUrl);
  if (
    !reservationReference ||
    !customerInput ||
    !returnUrl ||
    input.requiresPaymentsCapability !== true
  ) {
    return null;
  }
  const name = text(customerInput.name, 160);
  const email = text(customerInput.email, 200).toLowerCase();
  const phone = optionalText(customerInput.phone, 40);
  const document = optionalText(customerInput.document, 40);
  if (!name || !EMAIL.test(email)) return null;
  return Object.freeze({
    reservationReference,
    customer: Object.freeze({ name, email, phone, document }),
    returnUrl,
    requiresPaymentsCapability: true as const,
  });
}

export function createRestaurantCheckoutApplicationService(dependencies: {
  readonly orders: OrderRepositoryPort;
  readonly bindings: RestaurantReservationOrderBindingRepositoryPort;
  readonly payments: PaymentRepositoryPort;
  readonly paymentIdempotency: PaymentIdempotencyPort;
  readonly identities: { allocatePaymentId(): unknown };
}) {
  return Object.freeze({
    async startCheckout(
      input: RestaurantCheckoutApplicationRequest,
    ): Promise<
      Readonly<{ order: Order; payment: Payment; replayed: boolean }>
    > {
      const handoff = normalizeRestaurantCheckoutHandoff(input);
      if (!handoff) {
        throw new Error("ORDERING_RESTAURANT_CHECKOUT_INVALID");
      }
      const binding = await dependencies.bindings.findByReservationReference(
        handoff.reservationReference,
      );
      if (!binding) {
        throw new Error("ORDERING_RESTAURANT_BINDING_NOT_FOUND");
      }
      const orderId = normalizeOrderId(binding.orderId);
      if (!orderId) {
        throw new Error("ORDERING_RESTAURANT_CHECKOUT_CONFLICT");
      }
      const order = await dependencies.orders.findById(orderId);
      if (
        !order ||
        order.source.kind !== "restaurant_reservation" ||
        order.source.reference !== handoff.reservationReference ||
        order.status === "cancelled" ||
        (order.status !== "pending_payment" &&
          order.status !== "payment_confirmed") ||
        order.pricing.amount.minorUnits !== binding.amount.minorUnits ||
        order.pricing.amount.currency !== binding.amount.currency
      ) {
        throw new Error("ORDERING_RESTAURANT_CHECKOUT_CONFLICT");
      }

      const idempotencyKey = createPaymentIdempotencyKey(order.id);
      if (!idempotencyKey) {
        throw new Error("ORDERING_RESTAURANT_PAYMENT_CONFLICT");
      }
      let paymentId =
        await dependencies.paymentIdempotency.find(idempotencyKey);
      let replayed = paymentId !== null;
      if (!paymentId) {
        const proposedPaymentId = normalizePaymentId(
          dependencies.identities.allocatePaymentId(),
        );
        if (!proposedPaymentId) {
          throw new Error("ORDERING_RESTAURANT_PAYMENT_ID_INVALID");
        }
        const claim = await dependencies.paymentIdempotency.claim(
          idempotencyKey,
          proposedPaymentId,
        );
        paymentId = normalizePaymentId(claim.paymentId);
        if (!paymentId) {
          throw new Error("ORDERING_RESTAURANT_PAYMENT_CONFLICT");
        }
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
        if (!proposed) {
          throw new Error("ORDERING_RESTAURANT_PAYMENT_CONFLICT");
        }
        payment = await dependencies.payments.save(proposed);
      } else {
        replayed = true;
      }
      return Object.freeze({ order, payment, replayed });
    },
  });
}
