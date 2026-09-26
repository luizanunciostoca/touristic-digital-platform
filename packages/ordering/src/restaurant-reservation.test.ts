import { describe, expect, it } from "vitest";

import type { Order, OrderRequestKey } from "./index.js";

import {
  createRestaurantReservationOrderApplicationService,
  type RestaurantReservationOrderBinding,
} from "./restaurant-reservation.js";

describe("restaurant reservation ordering", () => {
  it("creates one pending-payment order and replays by reservation reference", async () => {
    const byKey = new Map<OrderRequestKey, Order>();
    const bindings = new Map<string, RestaurantReservationOrderBinding>();
    const service = createRestaurantReservationOrderApplicationService({
      orders: {
        async findById(id) {
          return [...byKey.values()].find((order) => order.id === id) ?? null;
        },
        async findByRequestKey(key) {
          return byKey.get(key) ?? null;
        },
        async save(order) {
          byKey.set(order.requestKey, order);
          return order;
        },
      },
      bindings: {
        async findByReservationReference(reference) {
          return bindings.get(reference) ?? null;
        },
        async findByOrderId(orderId) {
          return (
            [...bindings.values()].find(
              (binding) => binding.orderId === orderId,
            ) ?? null
          );
        },
        async save(binding) {
          bindings.set(binding.reservationReference, binding);
          return binding;
        },
      },
      identities: {
        allocateOrderId() {
          return "ord_restaurant_12345678";
        },
      },
    });

    const handoff = {
      reservationReference: "rrv_restaurant_12345678",
      businessId: "business_restaurant_a",
      amount: { minorUnits: 5000, currency: "BRL" },
      pricingVersion: "rdep_12345678",
      capturedAt: "2026-09-24T01:00:00.000Z",
    };
    const first = await service.placeReservationOrder(handoff);
    const replay = await service.placeReservationOrder(handoff);

    expect(first.order).toMatchObject({
      requestKey: "restaurant:rrv_restaurant_12345678",
      source: {
        kind: "restaurant_reservation",
        reference: "rrv_restaurant_12345678",
      },
      status: "pending_payment",
    });
    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.order.id).toBe(first.order.id);
  });

  it("rejects amount drift for the same reservation", async () => {
    let order: Order | null = null;
    let binding: RestaurantReservationOrderBinding | null = null;
    const service = createRestaurantReservationOrderApplicationService({
      orders: {
        async findById(id) {
          return order?.id === id ? order : null;
        },
        async findByRequestKey() {
          return order;
        },
        async save(value) {
          order = value;
          return value;
        },
      },
      bindings: {
        async findByReservationReference() {
          return binding;
        },
        async findByOrderId() {
          return binding;
        },
        async save(value) {
          binding = value;
          return value;
        },
      },
      identities: {
        allocateOrderId() {
          return "ord_restaurant_87654321";
        },
      },
    });
    const base = {
      reservationReference: "rrv_restaurant_87654321",
      businessId: "business_restaurant_a",
      amount: { minorUnits: 5000, currency: "BRL" },
      pricingVersion: "rdep_87654321",
      capturedAt: "2026-09-24T01:00:00.000Z",
    };
    await service.placeReservationOrder(base);
    await expect(
      service.placeReservationOrder({
        ...base,
        amount: { minorUnits: 6000, currency: "BRL" },
      }),
    ).rejects.toThrow("ORDERING_RESTAURANT_ORDER_CONFLICT");
  });
});
