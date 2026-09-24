import { describe, expect, it } from "vitest";

import {
  assertRestaurantReservationTransition,
  createRestaurantReservation,
  isRestaurantReservationTransitionAllowed,
  normalizeRestaurantDepositPolicy,
} from "./restaurant-reservations.js";

function reservation(overrides: Record<string, unknown> = {}) {
  return {
    id: "rrv_12345678",
    businessId: "business_toca",
    placeId: "place_toca",
    destinationId: "morro-de-sao-paulo",
    serviceDate: "2026-09-26",
    startsAt: "2026-09-26T22:00:00.000Z",
    endsAt: "2026-09-27T00:00:00.000Z",
    partySize: 4,
    seatingArea: "varanda",
    notes: null,
    holderReference: "guest_12345678",
    status: "held",
    depositPolicy: { kind: "none" },
    holdExpiresAt: "2026-09-26T21:15:00.000Z",
    createdAt: "2026-09-26T21:00:00.000Z",
    ...overrides,
  };
}

describe("restaurant reservation domain", () => {
  it("accepts a bounded hold with explicit business and place identity", () => {
    expect(createRestaurantReservation(reservation())).toMatchObject({
      id: "rrv_12345678",
      status: "held",
      partySize: 4,
      seatingArea: "varanda",
    });
  });

  it("does not invent a checkout deposit when policy is none", () => {
    expect(normalizeRestaurantDepositPolicy({ kind: "none" })).toEqual({
      kind: "none",
    });
  });

  it("accepts only server-shaped positive deposits", () => {
    expect(
      normalizeRestaurantDepositPolicy({
        kind: "required",
        amount: { minorUnits: 5000, currency: "brl" },
      }),
    ).toEqual({
      kind: "required",
      amount: { minorUnits: 5000, currency: "BRL" },
    });
    expect(
      normalizeRestaurantDepositPolicy({
        kind: "required",
        amount: { minorUnits: 0, currency: "BRL" },
      }),
    ).toBeNull();
  });

  it("requires active holds to expire before service starts", () => {
    expect(
      createRestaurantReservation(
        reservation({ holdExpiresAt: "2026-09-26T22:00:00.000Z" }),
      ),
    ).toBeNull();
  });

  it("prevents invalid terminal-state transitions", () => {
    expect(isRestaurantReservationTransitionAllowed("held", "confirmed")).toBe(
      true,
    );
    expect(
      isRestaurantReservationTransitionAllowed("confirmed", "completed"),
    ).toBe(true);
    expect(
      isRestaurantReservationTransitionAllowed("completed", "confirmed"),
    ).toBe(false);
    expect(() =>
      assertRestaurantReservationTransition("no_show", "confirmed"),
    ).toThrow("COMMERCE_RESTAURANT_INVALID_TRANSITION");
  });

  it("keeps required-deposit reservations in payment-compatible states", () => {
    expect(
      createRestaurantReservation(
        reservation({
          status: "pending_confirmation",
          depositPolicy: {
            kind: "required",
            amount: { minorUnits: 5000, currency: "BRL" },
          },
        }),
      ),
    ).toBeNull();
  });
});
