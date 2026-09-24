import { describe, expect, it } from "vitest";

import {
  createRestaurantCheckoutHandoffCapability,
  verifyRestaurantCheckoutHandoffCapability,
} from "./restaurant-checkout-handoff.js";

const secret = "restaurant-checkout-secret-1234567890";

function handoff() {
  return {
    reservationReference: "rrv_restaurant_12345678",
    customer: {
      name: "Cliente",
      email: "cliente@example.com",
      phone: null,
      document: null,
    },
    returnUrl: "https://morro.example/reservas",
    requiresPaymentsCapability: true,
  };
}

describe("restaurant checkout handoff capability", () => {
  it("binds reservation, actor, destination and tenant", () => {
    const token = createRestaurantCheckoutHandoffCapability(
      handoff(),
      {
        actorSubject: "guest:1234567890abcdef1234567890abcdef",
        destinationId: "morro-de-sao-paulo",
        tenantId: "business_restaurant_a",
        requesterKind: "guest_capability",
      },
      secret,
      { nowEpochSeconds: 1000, ttlSeconds: 600 },
    );
    expect(token).toBeTruthy();
    expect(
      verifyRestaurantCheckoutHandoffCapability(
        token,
        handoff(),
        secret,
        { nowEpochSeconds: 1100 },
      ),
    ).toMatchObject({
      requesterKind: "guest_capability",
      tenantId: "business_restaurant_a",
    });
  });

  it("rejects a tenant substitution", () => {
    const token = createRestaurantCheckoutHandoffCapability(
      handoff(),
      {
        actorSubject: "guest:1234567890abcdef1234567890abcdef",
        destinationId: "morro-de-sao-paulo",
        tenantId: "business_restaurant_a",
        requesterKind: "guest_capability",
      },
      secret,
      { nowEpochSeconds: 1000, ttlSeconds: 600 },
    );
    const verified = verifyRestaurantCheckoutHandoffCapability(
      token,
      { ...handoff(), reservationReference: "rrv_restaurant_87654321" },
      secret,
      { nowEpochSeconds: 1100 },
    );
    expect(verified).toBeNull();
  });
});
