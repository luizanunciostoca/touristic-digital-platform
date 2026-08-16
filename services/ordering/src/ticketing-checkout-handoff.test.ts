import { describe, expect, it } from "vitest";

import type { TicketingCheckoutApplicationRequest } from "@touristic/ordering/ticketing-checkout";

import {
  createTicketingCheckoutHandoffCapability,
  verifyTicketingCheckoutHandoffCapability,
} from "./ticketing-checkout-handoff.js";

const secret = "ticketing-handoff-secret-with-at-least-thirty-two-characters";

function request(): TicketingCheckoutApplicationRequest {
  return {
    reservationReference: "trv_1234567890abcdef",
    customer: {
      name: "Cliente Ticketing",
      email: "ticketing@example.com",
      phone: "+55 75 99999-0000",
      document: "123.456.789-00",
    },
    returnUrl: "https://morro.digital/tickets.html",
    requiresPaymentsCapability: true,
  };
}

describe("Ticketing canonical Payments handoff", () => {
  it("binds the exact reservation handoff, actor and destination with expiry", () => {
    const token = createTicketingCheckoutHandoffCapability(
      request(),
      { actorSubject: "user-123", destinationId: "morro" },
      secret,
      { nowEpochSeconds: 1_776_000_000, ttlSeconds: 600 },
    );
    expect(token).not.toBeNull();

    expect(
      verifyTicketingCheckoutHandoffCapability(token, request(), secret, {
        nowEpochSeconds: 1_776_000_100,
      }),
    ).toEqual({
      requesterKind: "authenticated",
      actorSubject: "user-123",
      destinationId: "morro",
      tenantId: null,
    });

    expect(
      verifyTicketingCheckoutHandoffCapability(
        token,
        {
          ...request(),
          returnUrl: "https://evil.example/return",
        },
        secret,
        { nowEpochSeconds: 1_776_000_100 },
      ),
    ).toBeNull();
    expect(
      verifyTicketingCheckoutHandoffCapability(token, request(), secret, {
        nowEpochSeconds: 1_776_000_700,
      }),
    ).toBeNull();
  });

  it("rejects short secrets and invalid actor or destination scopes", () => {
    expect(
      createTicketingCheckoutHandoffCapability(
        request(),
        { actorSubject: "user-123", destinationId: "morro" },
        "short",
      ),
    ).toBeNull();
    expect(
      createTicketingCheckoutHandoffCapability(
        request(),
        { actorSubject: "x", destinationId: "morro" },
        secret,
      ),
    ).toBeNull();
    expect(
      createTicketingCheckoutHandoffCapability(
        request(),
        { actorSubject: "user-123", destinationId: "!invalid" },
        secret,
      ),
    ).toBeNull();
  });
});
