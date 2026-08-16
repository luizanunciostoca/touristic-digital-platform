import { describe, expect, it } from "vitest";

import {
  cancelTicketReservation,
  confirmTicketReservation,
  createTicketInventoryAvailability,
  createTicketInventoryOffer,
  createTicketReservation,
  createTicketReservationRequestKey,
  expireTicketReservation,
  isTicketInventorySellable,
  isTicketReservationExpired,
  reservationRequestKeyMatchesInventory,
} from "./reservations.js";

function inventory() {
  const value = createTicketInventoryOffer({
    id: "tin_sunset_20260816",
    destinationId: "morro-de-sao-paulo",
    product: { kind: "business_experience", reference: "toca-sunset" },
    label: "Sunset admission",
    unitAmount: { minorUnits: 12000, currency: "BRL" },
    pricingVersion: "2026.08.16",
    capacity: 2,
    maxPerReservation: 2,
    salesStartAt: "2026-08-16T12:00:00.000Z",
    salesEndAt: "2026-08-16T19:00:00.000Z",
    startsAt: "2026-08-16T19:00:00.000Z",
    endsAt: "2026-08-17T01:00:00.000Z",
    createdAt: "2026-08-16T10:00:00.000Z",
  });
  if (!value) throw new Error("fixture inventory invalid");
  return value;
}

function heldReservation() {
  const key = createTicketReservationRequestKey(
    "tin_sunset_20260816",
    "browser_attempt_0001",
  );
  if (!key) throw new Error("fixture request key invalid");
  const value = createTicketReservation({
    id: "trv_reservation_0001",
    requestKey: key,
    inventoryId: "tin_sunset_20260816",
    destinationId: "morro-de-sao-paulo",
    product: { kind: "business_experience", reference: "toca-sunset" },
    unitAmount: { minorUnits: 12000, currency: "BRL" },
    pricingVersion: "2026.08.16",
    holderReference: "holder_00000001",
    quantity: 1,
    expiresAt: "2026-08-16T18:10:00.000Z",
    createdAt: "2026-08-16T18:00:00.000Z",
  });
  if (!value) throw new Error("fixture reservation invalid");
  return value;
}

describe("ticket reservation contracts", () => {
  it("creates a server-authoritative inventory offer and reports availability", () => {
    const offer = inventory();
    expect(offer.capacity).toBe(2);
    expect(offer.unitAmount).toEqual({ minorUnits: 12000, currency: "BRL" });
    expect(isTicketInventorySellable(offer, "2026-08-16T18:00:00.000Z")).toBe(
      true,
    );
    expect(isTicketInventorySellable(offer, "2026-08-16T19:00:00.000Z")).toBe(
      false,
    );

    expect(
      createTicketInventoryAvailability({
        inventory: offer,
        committedQuantity: 1,
        observedAt: "2026-08-16T18:00:00.000Z",
      }),
    ).toEqual({
      inventoryId: offer.id,
      capacity: 2,
      committedQuantity: 1,
      remainingQuantity: 1,
      sellable: true,
      observedAt: "2026-08-16T18:00:00.000Z",
    });
  });

  it("binds idempotency keys to one inventory pool", () => {
    const key = createTicketReservationRequestKey(
      "tin_sunset_20260816",
      "browser_attempt_0001",
    );
    expect(key).toBe("ticketing:tin_sunset_20260816:browser_attempt_0001");
    expect(
      reservationRequestKeyMatchesInventory(key, "tin_sunset_20260816"),
    ).toBe(true);
    expect(
      reservationRequestKeyMatchesInventory(key, "tin_other_inventory"),
    ).toBe(false);
  });

  it("snapshots catalog pricing into a hold", () => {
    const reservation = heldReservation();
    expect(reservation.unitAmount).toEqual({
      minorUnits: 12000,
      currency: "BRL",
    });
    expect(reservation.pricingVersion).toBe("2026.08.16");
  });

  it("confirms a live hold only with normalized order and payment authority", () => {
    const confirmed = confirmTicketReservation(heldReservation(), {
      orderId: "ord_ticketing_0001",
      paymentId: "pay_ticketing_0001",
      confirmedAt: "2026-08-16T18:05:00.000Z",
    });
    expect(confirmed.status).toBe("confirmed");
    expect(confirmed.orderId).toBe("ord_ticketing_0001");
    expect(confirmed.paymentId).toBe("pay_ticketing_0001");
    expect(() =>
      confirmTicketReservation(heldReservation(), {
        orderId: "ord_ticketing_0001",
        paymentId: "pay_ticketing_0001",
        confirmedAt: "2026-08-16T18:10:00.001Z",
      }),
    ).toThrow("TICKETING_RESERVATION_HOLD_EXPIRED");
  });

  it("expires or cancels only an active hold", () => {
    const held = heldReservation();
    expect(isTicketReservationExpired(held, "2026-08-16T18:10:00.000Z")).toBe(
      true,
    );
    const expired = expireTicketReservation(held, "2026-08-16T18:10:00.000Z");
    expect(expired.status).toBe("expired");
    expect(expired.expiredAt).toBe("2026-08-16T18:10:00.000Z");

    const cancelled = cancelTicketReservation(
      heldReservation(),
      "2026-08-16T18:02:00.000Z",
    );
    expect(cancelled.status).toBe("cancelled");
    expect(() =>
      cancelTicketReservation(cancelled, "2026-08-16T18:03:00.000Z"),
    ).toThrow("TICKETING_RESERVATION_CANCELLATION_INVALID");
  });

  it("rejects invalid catalog windows and cross-inventory reservation keys", () => {
    expect(
      createTicketInventoryOffer({
        ...inventory(),
        id: "tin_invalid_window",
        salesEndAt: "2026-08-16T20:00:00.000Z",
        startsAt: "2026-08-16T19:00:00.000Z",
      }),
    ).toBeNull();

    expect(
      createTicketReservation({
        ...heldReservation(),
        inventoryId: "tin_other_inventory",
      }),
    ).toBeNull();
  });
});
