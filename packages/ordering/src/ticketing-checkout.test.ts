import { describe, expect, it } from "vitest";

import {
  createPaymentIdempotencyKey,
  type Payment,
  type PaymentRepositoryPort,
} from "@touristic/financial";

import {
  createTicketingCheckoutApplicationService,
  normalizeTicketingCheckoutHandoff,
} from "./ticketing-checkout.js";
import {
  capturePricingSnapshot,
  createOrder,
  createPricingQuote,
  createTicketingOrderRequestKey,
  normalizeOrderId,
  normalizeOrderSourceReference,
  type Order,
  type OrderRepositoryPort,
} from "./index.js";
import {
  createTicketingOrderBinding,
  type TicketingOrderBinding,
  type TicketingOrderBindingRepositoryPort,
} from "./ticketing-reservation.js";

function fixture() {
  const orderId = normalizeOrderId("ord_ticketing_checkout_0001");
  const requestKey = createTicketingOrderRequestKey(
    "trv_ticketing_checkout_0001",
  );
  const source = normalizeOrderSourceReference(
    "trv_ticketing_checkout_0001",
    "ticketing_reservation",
  );
  const quote = createPricingQuote({
    planId: "trv_ticketing_checkout_0001",
    planName: "tour:volta-a-ilha",
    minorUnits: 39_800,
    currency: "BRL",
    pricingVersion: "ticket-2026-08",
  });
  const pricing = quote
    ? capturePricingSnapshot(quote, "2026-08-16T18:00:00.000Z")
    : null;
  if (!orderId || !requestKey || !source || !pricing) {
    throw new Error("FIXTURE_INVALID");
  }
  const order = createOrder({
    id: orderId,
    requestKey,
    source,
    status: "pending_payment",
    pricing,
    createdAt: "2026-08-16T18:00:00.000Z",
  });
  const binding = createTicketingOrderBinding({
    reservationReference: "trv_ticketing_checkout_0001",
    orderId,
    productReference: "tour:volta-a-ilha",
    quantity: 2,
    amount: pricing.amount,
    pricingVersion: pricing.pricingVersion,
    boundAt: "2026-08-16T18:00:00.000Z",
  });
  if (!order || !binding) throw new Error("FIXTURE_INVALID");
  return { order, binding };
}

function serviceFixture(order: Order, binding: TicketingOrderBinding) {
  let payment: Payment | null = null;
  let claimed: string | null = null;
  const orders: OrderRepositoryPort = {
    async findById(id) {
      return id === order.id ? order : null;
    },
    async findByRequestKey() {
      return order;
    },
    async save(value) {
      return value;
    },
  };
  const bindings: TicketingOrderBindingRepositoryPort = {
    async findByReservationReference(reference) {
      return reference === binding.reservationReference ? binding : null;
    },
    async findByOrderId(id) {
      return id === binding.orderId ? binding : null;
    },
    async save(value) {
      return value;
    },
  };
  const payments: PaymentRepositoryPort = {
    async findById(id) {
      return payment?.id === id ? payment : null;
    },
    async save(value) {
      payment = value;
      return value;
    },
  };
  const application = createTicketingCheckoutApplicationService({
    orders,
    bindings,
    payments,
    paymentIdempotency: {
      async find() {
        return claimed as never;
      },
      async claim(_key, proposed) {
        if (!claimed) claimed = proposed;
        return { claimed: claimed === proposed, paymentId: claimed as never };
      },
    },
    identities: { allocatePaymentId: () => "pay_ticketing_checkout_0001" },
  });
  return { application, getPayment: () => payment };
}

const request = {
  reservationReference: "trv_ticketing_checkout_0001",
  customer: {
    name: "Maria da Silva",
    email: "maria@example.com",
    phone: null,
    document: null,
  },
  returnUrl: "https://morro.example/ingressos",
  requiresPaymentsCapability: true,
} as const;

describe("Ordering Ticketing checkout handoff", () => {
  it("validates a reservation handoff without Business checkout fields", () => {
    expect(normalizeTicketingCheckoutHandoff(request)).toMatchObject({
      reservationReference: "trv_ticketing_checkout_0001",
      customer: { email: "maria@example.com" },
    });
  });

  it("creates the canonical Financial Payment exactly once for the existing Order", async () => {
    const { order, binding } = fixture();
    const { application, getPayment } = serviceFixture(order, binding);
    const first = await application.startCheckout(request);
    const replay = await application.startCheckout(request);
    const key = createPaymentIdempotencyKey(order.id);

    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.payment.id).toBe(first.payment.id);
    expect(getPayment()).toMatchObject({
      idempotencyKey: key,
      subject: { kind: "order", reference: order.id },
      amount: { minorUnits: 39_800, currency: "BRL" },
    });
  });

  it("fails closed when the immutable binding disagrees with the Order snapshot", async () => {
    const { order, binding } = fixture();
    const divergent = createTicketingOrderBinding({
      ...binding,
      amount: { minorUnits: 40_000, currency: "BRL" },
    });
    if (!divergent) throw new Error("FIXTURE_INVALID");
    const { application } = serviceFixture(order, divergent);
    await expect(application.startCheckout(request)).rejects.toThrow(
      "ORDERING_TICKETING_CHECKOUT_CONFLICT",
    );
  });
});
