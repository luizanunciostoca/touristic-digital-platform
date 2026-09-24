import { describe, expect, it } from "vitest";

import type {
  Payment,
  PaymentId,
} from "@touristic/financial";
import {
  createOrder,
  createPricingQuote,
  capturePricingSnapshot,
  createRestaurantOrderRequestKey,
  normalizeOrderId,
  normalizeOrderSourceReference,
  type Order,
} from "./index.js";
import {
  createRestaurantReservationOrderBinding,
  type RestaurantReservationOrderBinding,
} from "./restaurant-reservation.js";

import {
  createRestaurantCheckoutApplicationService,
  normalizeRestaurantCheckoutHandoff,
} from "./restaurant-checkout.js";

describe("restaurant checkout", () => {
  it("normalizes a payment handoff without financial authority in the browser", () => {
    expect(
      normalizeRestaurantCheckoutHandoff({
        reservationReference: "rrv_restaurant_12345678",
        customer: {
          name: "Cliente Teste",
          email: "cliente@example.com",
        },
        returnUrl: "https://morro.example/reservas",
        requiresPaymentsCapability: true,
      }),
    ).toMatchObject({
      reservationReference: "rrv_restaurant_12345678",
      requiresPaymentsCapability: true,
    });
  });

  it("creates one pending payment for an existing restaurant order", async () => {
    const orderId = normalizeOrderId("ord_restaurant_12345678");
    const requestKey = createRestaurantOrderRequestKey(
      "rrv_restaurant_12345678",
    );
    const source = normalizeOrderSourceReference(
      "rrv_restaurant_12345678",
      "restaurant_reservation",
    );
    const quote = createPricingQuote({
      planId: "rrv_restaurant_12345678",
      planName: "restaurant_deposit",
      minorUnits: 5000,
      currency: "BRL",
      pricingVersion: "rdep_12345678",
    });
    const pricing = quote
      ? capturePricingSnapshot(quote, "2026-09-24T01:00:00.000Z")
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
      createdAt: "2026-09-24T01:00:00.000Z",
    });
    if (!order) throw new Error("FIXTURE_INVALID");
    const binding = createRestaurantReservationOrderBinding({
      reservationReference: "rrv_restaurant_12345678",
      orderId: order.id,
      businessId: "business_restaurant_a",
      amount: order.pricing.amount,
      pricingVersion: order.pricing.pricingVersion,
      boundAt: order.createdAt,
    });
    if (!binding) throw new Error("FIXTURE_INVALID");
    let payment: Payment | null = null;
    let claimed: PaymentId | null = null;
    const service = createRestaurantCheckoutApplicationService({
      orders: {
        async findById() {
          return order;
        },
        async findByRequestKey() {
          return order;
        },
        async save(value) {
          return value;
        },
      },
      bindings: {
        async findByReservationReference() {
          return binding;
        },
        async findByOrderId() {
          return null;
        },
        async save(value) {
          return value;
        },
      },
      payments: {
        async findById() {
          return payment;
        },
        async save(value) {
          payment = value;
          return value;
        },
      },
      paymentIdempotency: {
        async find() {
          return claimed;
        },
        async claim(_key, paymentId) {
          claimed = paymentId;
          return { claimed: true, paymentId };
        },
      },
      identities: {
        allocatePaymentId() {
          return "pay_restaurant_12345678";
        },
      },
    });
    const result = await service.startCheckout({
      reservationReference: "rrv_restaurant_12345678",
      customer: {
        name: "Cliente Teste",
        email: "cliente@example.com",
      },
      returnUrl: "https://morro.example/reservas",
      requiresPaymentsCapability: true,
    });
    expect(result.payment).toMatchObject({
      id: "pay_restaurant_12345678",
      status: "pending",
      amount: { minorUnits: 5000, currency: "BRL" },
    });
  });
});
