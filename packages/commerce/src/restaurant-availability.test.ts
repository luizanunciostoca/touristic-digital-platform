import { describe, expect, it } from "vitest";

import {
  createRestaurantReservationSlot,
  createRestaurantSlotAvailability,
  isRestaurantSlotBookable,
} from "./restaurant-availability.js";

function slot(overrides: Record<string, unknown> = {}) {
  const value = createRestaurantReservationSlot({
    id: "rsl_dinner_0001",
    businessId: "business_restaurant_1",
    placeId: "place_restaurant_1",
    destinationId: "morro-de-sao-paulo",
    serviceDate: "2026-10-10",
    startsAt: "2026-10-10T22:00:00.000Z",
    endsAt: "2026-10-11T00:00:00.000Z",
    seatingArea: "varanda",
    capacity: 20,
    minPartySize: 1,
    maxPartySize: 8,
    minimumLeadMinutes: 60,
    maximumAdvanceDays: 90,
    holdDurationSeconds: 600,
    depositPolicy: { kind: "none" },
    createdAt: "2026-09-23T20:00:00.000Z",
    ...overrides,
  });
  if (!value) throw new Error("FIXTURE_INVALID");
  return value;
}

describe("restaurant availability domain", () => {
  it("creates a bounded server-owned slot", () => {
    expect(slot()).toMatchObject({
      capacity: 20,
      maxPartySize: 8,
      holdDurationSeconds: 600,
    });
  });

  it("enforces party limits within physical capacity", () => {
    expect(() => slot({ capacity: 4, maxPartySize: 8 })).toThrow(
      "FIXTURE_INVALID",
    );
  });

  it("honors lead time and maximum advance booking", () => {
    const value = slot();
    expect(isRestaurantSlotBookable(value, "2026-10-10T20:59:59.000Z")).toBe(
      true,
    );
    expect(isRestaurantSlotBookable(value, "2026-10-10T21:00:01.000Z")).toBe(
      false,
    );
    expect(isRestaurantSlotBookable(value, "2026-06-01T00:00:00.000Z")).toBe(
      false,
    );
  });

  it("computes guest capacity without treating table reservations as tickets", () => {
    expect(
      createRestaurantSlotAvailability({
        slot: slot(),
        committedGuests: 17,
        observedAt: "2026-10-09T20:00:00.000Z",
      }),
    ).toMatchObject({
      committedGuests: 17,
      remainingGuests: 3,
      sellable: true,
    });
  });

  it("fails closed when committed guests exceed capacity", () => {
    expect(
      createRestaurantSlotAvailability({
        slot: slot(),
        committedGuests: 21,
        observedAt: "2026-10-09T20:00:00.000Z",
      }),
    ).toBeNull();
  });
});
