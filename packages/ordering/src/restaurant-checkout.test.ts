import { describe, expect, it } from "vitest";

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
    const order = {
      id: "ord_restaurant_12345678",
      requestKey: "restaurant:rrv_restaurant_12345678",
      source: {
        kind: "restaurant_reservation",
        reference: "rrv_restaurant_12345678",
      },
      status: "pending_payment",
      pricing: {
        planId: "rrv_restaurant_12345678",
        planName: "restaurant_deposit",
        amount: { minorUnits: 5000, currency: "BRL" },
        pricingVersion: "rdep_12345678",
        capturedAt: "2026-09-24T01:00:00.000Z",
      },
      createdAt: "2026-09-24T01:00:00.000Z",
      updatedAt: "2026-09-24T01:00:00.000Z",
    };
    let payment = null;
    let claimed = null;
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
          return {
            reservationReference: "rrv_restaurant_12345678",
            orderId: order.id,
            businessId: "business_restaurant_a",
            amount: { minorUnits: 5000, currency: "BRL" },
            pricingVersion: "rdep_12345678",
            boundAt: order.createdAt,
          };
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
