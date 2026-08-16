import { describe, expect, it } from "vitest";

import {
  normalizeOrderId,
  type Order,
  type OrderRepositoryPort,
  type OrderRequestKey,
} from "./index.js";
import {
  createTicketingOrderBinding,
  createTicketingReservationOrderApplicationService,
  normalizeTicketingReservationReference,
  ticketingOrderBindingsEqual,
  type TicketingOrderBinding,
  type TicketingOrderBindingRepositoryPort,
} from "./ticketing-reservation.js";

function binding() {
  const orderId = normalizeOrderId("ord_ticketing_binding_0001");
  if (!orderId) throw new Error("FIXTURE_INVALID");
  const value = createTicketingOrderBinding({
    reservationReference: "trv_ticketing_binding_0001",
    orderId,
    productReference: "tour:volta-a-ilha",
    quantity: 2,
    amount: { minorUnits: 39_800, currency: "BRL" },
    pricingVersion: "ticket-2026-08",
    boundAt: "2026-08-16T18:01:00.000Z",
  });
  if (!value) throw new Error("FIXTURE_INVALID");
  return value;
}

function repositories() {
  const orders = new Map<string, Order>();
  const bindings = new Map<string, TicketingOrderBinding>();
  const orderRepository: OrderRepositoryPort = {
    async findById(orderId) {
      return orders.get(orderId) ?? null;
    },
    async findByRequestKey(requestKey: OrderRequestKey) {
      return [...orders.values()].find((order) => order.requestKey === requestKey) ?? null;
    },
    async save(order) {
      const existing = [...orders.values()].find(
        (candidate) => candidate.requestKey === order.requestKey,
      );
      if (existing && existing.id !== order.id) {
        throw new Error("ORDERING_REQUEST_KEY_CONFLICT");
      }
      orders.set(order.id, order);
      return order;
    },
  };
  const bindingRepository: TicketingOrderBindingRepositoryPort = {
    async findByReservationReference(reference) {
      return bindings.get(reference) ?? null;
    },
    async findByOrderId(orderId) {
      return [...bindings.values()].find((value) => value.orderId === orderId) ?? null;
    },
    async save(value) {
      const existing = bindings.get(value.reservationReference);
      if (existing && !ticketingOrderBindingsEqual(existing, value)) {
        throw new Error("ORDERING_TICKETING_BINDING_CONFLICT");
      }
      bindings.set(value.reservationReference, value);
      return value;
    },
  };
  return { orderRepository, bindingRepository };
}

describe("Ordering Ticketing reservation binding", () => {
  it("normalizes only durable Ticketing reservation identities", () => {
    expect(
      normalizeTicketingReservationReference("trv_ticketing_binding_0001"),
    ).toBe("trv_ticketing_binding_0001");
    expect(normalizeTicketingReservationReference("reservation_0001")).toBeNull();
  });

  it("captures the immutable order/product/price relation", () => {
    const value = binding();
    expect(value).toMatchObject({
      reservationReference: "trv_ticketing_binding_0001",
      productReference: "tour:volta-a-ilha",
      quantity: 2,
      pricingVersion: "ticket-2026-08",
      amount: { minorUnits: 39_800, currency: "BRL" },
      boundAt: "2026-08-16T18:01:00.000Z",
    });
    expect(ticketingOrderBindingsEqual(value, value)).toBe(true);
  });

  it("rejects invalid quantities, zero price and malformed products", () => {
    const orderId = normalizeOrderId("ord_ticketing_binding_0001");
    if (!orderId) throw new Error("FIXTURE_INVALID");
    const common = {
      reservationReference: "trv_ticketing_binding_0001",
      orderId,
      pricingVersion: "ticket-2026-08",
      boundAt: "2026-08-16T18:01:00.000Z",
    };

    expect(
      createTicketingOrderBinding({
        ...common,
        productReference: "tour:volta-a-ilha",
        quantity: 0,
        amount: { minorUnits: 39_800, currency: "BRL" },
      }),
    ).toBeNull();
    expect(
      createTicketingOrderBinding({
        ...common,
        productReference: "tour:volta-a-ilha",
        quantity: 2,
        amount: { minorUnits: 0, currency: "BRL" },
      }),
    ).toBeNull();
    expect(
      createTicketingOrderBinding({
        ...common,
        productReference: "<script>",
        quantity: 2,
        amount: { minorUnits: 39_800, currency: "BRL" },
      }),
    ).toBeNull();
  });

  it("creates the canonical ticketing Order once and replays by reservation", async () => {
    const { orderRepository, bindingRepository } = repositories();
    let allocations = 0;
    const service = createTicketingReservationOrderApplicationService({
      orders: orderRepository,
      bindings: bindingRepository,
      identities: {
        allocateOrderId() {
          allocations += 1;
          return "ord_ticketing_reservation_0001";
        },
      },
    });
    const handoff = {
      reservationReference: "trv_ticketing_reservation_0001",
      productReference: "tour:volta-a-ilha",
      quantity: 2,
      amount: { minorUnits: 39_800, currency: "BRL" },
      pricingVersion: "ticket-2026-08",
      capturedAt: "2026-08-16T18:01:00.000Z",
    };

    const first = await service.placeReservationOrder(handoff);
    const replay = await service.placeReservationOrder(handoff);

    expect(first.order).toMatchObject({
      source: {
        kind: "ticketing_reservation",
        reference: "trv_ticketing_reservation_0001",
      },
      status: "pending_payment",
      pricing: {
        amount: { minorUnits: 39_800, currency: "BRL" },
        pricingVersion: "ticket-2026-08",
      },
    });
    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.order.id).toBe(first.order.id);
    expect(replay.binding).toEqual(first.binding);
    expect(allocations).toBe(1);
  });

  it("rejects a replay that tries to change the financial snapshot", async () => {
    const { orderRepository, bindingRepository } = repositories();
    const service = createTicketingReservationOrderApplicationService({
      orders: orderRepository,
      bindings: bindingRepository,
      identities: {
        allocateOrderId: () => "ord_ticketing_reservation_0002",
      },
    });
    const handoff = {
      reservationReference: "trv_ticketing_reservation_0002",
      productReference: "tour:volta-a-ilha",
      quantity: 1,
      amount: { minorUnits: 19_900, currency: "BRL" },
      pricingVersion: "ticket-2026-08",
      capturedAt: "2026-08-16T18:02:00.000Z",
    };
    await service.placeReservationOrder(handoff);

    await expect(
      service.placeReservationOrder({
        ...handoff,
        amount: { minorUnits: 20_000, currency: "BRL" },
      }),
    ).rejects.toThrow("ORDERING_TICKETING_ORDER_CONFLICT");
  });
});
