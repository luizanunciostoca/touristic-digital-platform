import { describe, expect, it } from "vitest";

import { normalizeOrderId } from "./index.js";
import {
  createTicketingOrderBinding,
  normalizeTicketingReservationReference,
  ticketingOrderBindingsEqual,
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
});
