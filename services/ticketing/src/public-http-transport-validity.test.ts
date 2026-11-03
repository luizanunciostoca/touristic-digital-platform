import { describe, expect, it, vi } from "vitest";

import {
  TicketingPublicHttpTransport,
  type TicketingPublicHttpTransportDependencies,
} from "./public-http-transport.js";
import { TicketingApplicationError } from "./ticketing-application-service.js";
import { TicketingOperatorAuthorizationError } from "./operator-authorization.js";

function transportWithOfflineSync(sync: ReturnType<typeof vi.fn>) {
  const audit = vi.fn().mockResolvedValue(undefined);
  const dependencies = {
    enabled: true,
    offlineDevices: { sync },
    audit: { record: audit },
    clock: { now: () => "2026-09-20T02:00:00.000Z" },
  } as unknown as TicketingPublicHttpTransportDependencies;
  return {
    transport: new TicketingPublicHttpTransport(dependencies),
    audit,
  };
}

function transportWithQuote(
  overrides: {
    readonly remainingQuantity?: number;
    readonly sellable?: boolean;
  } = {},
) {
  const inventory = {
    id: "tin_quote_contract_0001",
    destinationId: "morro-de-sao-paulo",
    product: { kind: "business_experience", reference: "morro-pro:test" },
    label: "Experiência",
    unitAmount: { minorUnits: 15900, currency: "BRL" },
    pricingVersion: "quote-v1",
    maxPerReservation: 6,
    salesStartAt: "2026-09-20T00:00:00.000Z",
    salesEndAt: "2026-09-25T00:00:00.000Z",
    startsAt: "2026-09-24T18:00:00.000Z",
    endsAt: "2026-09-24T22:00:00.000Z",
  };
  const remainingQuantity = overrides.remainingQuantity ?? 4;
  const sellable = overrides.sellable ?? true;
  const dependencies = {
    enabled: true,
    authorization: {
      authorize: vi.fn().mockResolvedValue({
        allowed: true,
        actor: { subject: "guest:quote", role: "viewer" },
      }),
    },
    reservations: {
      findInventoryById: vi.fn().mockResolvedValue(inventory),
      availability: vi.fn().mockResolvedValue({
        inventoryId: inventory.id,
        capacity: 20,
        committedQuantity: 20 - remainingQuantity,
        remainingQuantity,
        sellable,
        observedAt: "2026-09-20T02:00:00.000Z",
      }),
    },
    clock: { now: () => "2026-09-20T02:00:00.000Z" },
  } as unknown as TicketingPublicHttpTransportDependencies;
  return new TicketingPublicHttpTransport(dependencies);
}

describe("Ticketing Admission public projection", () => {
  it("projects presentation metadata without projecting catalog-binding authority", async () => {
    const inventory = {
      id: "tin_admission_public_0001",
      destinationId: "morro-de-sao-paulo",
      product: { kind: "business_experience", reference: "the-party" },
      label: "The Party · Pista",
      unitAmount: { minorUnits: 8000, currency: "BRL" },
      pricingVersion: "party-v1",
      capacity: 200,
      maxPerReservation: 8,
      salesStartAt: "2026-09-20T00:00:00.000Z",
      salesEndAt: "2026-09-26T23:00:00.000Z",
      startsAt: "2026-09-27T02:59:00.000Z",
      endsAt: "2026-09-27T09:00:00.000Z",
      enabled: true,
      createdAt: "2026-09-20T00:00:00.000Z",
      updatedAt: "2026-09-20T00:00:00.000Z",
      admission: {
        placeId: "place_toca_do_morcego",
        subtype: "party",
        ticketType: "Pista",
        tierLabel: "1º lote",
        displayOrder: 10,
      },
    };
    const dependencies = {
      enabled: true,
      authorization: {
        authorize: vi.fn().mockResolvedValue({
          allowed: true,
          actor: { subject: "guest:admission", role: "viewer" },
        }),
      },
      reads: {
        listInventory: vi.fn().mockResolvedValue([inventory]),
      },
      reservations: {
        availability: vi.fn().mockResolvedValue({
          inventoryId: inventory.id,
          capacity: 200,
          committedQuantity: 20,
          remainingQuantity: 180,
          sellable: true,
          observedAt: "2026-09-26T20:00:00.000Z",
        }),
      },
      clock: { now: () => "2026-09-26T20:00:00.000Z" },
    } as unknown as TicketingPublicHttpTransportDependencies;

    const result = await new TicketingPublicHttpTransport(dependencies).handle({
      method: "GET",
      pathname: "/api/ticketing/v1/inventory",
      correlationId: "ticketing:test:admission:public",
    });

    expect(result.status).toBe(200);
    expect(result.body.data).toEqual([
      expect.objectContaining({
        id: inventory.id,
        admission: inventory.admission,
      }),
    ]);
    expect(JSON.stringify(result.body)).not.toContain("offerId");
  });
});

describe("Ticketing presentation quote authority", () => {
  it("computes total, currency, limits, and expiry on the server", async () => {
    const transport = transportWithQuote();
    const result = await transport.handle({
      method: "POST",
      pathname: "/api/ticketing/v1/quote",
      body: { inventoryId: "tin_quote_contract_0001", quantity: 2 },
      correlationId: "ticketing:test:quote:success",
    });

    expect(result.status).toBe(200);
    expect(result.body.data).toEqual(
      expect.objectContaining({
        inventoryId: "tin_quote_contract_0001",
        quantity: 2,
        unitAmount: { minorUnits: 15900, currency: "BRL" },
        totalAmount: { minorUnits: 31800, currency: "BRL" },
        pricingVersion: "quote-v1",
        availableQuantity: 4,
        maxPerReservation: 6,
        expiresAt: "2026-09-20T02:01:00.000Z",
      }),
    );
  });

  it("fails closed for sold-out inventory and over-limit quantity", async () => {
    const soldOut = await transportWithQuote({ remainingQuantity: 0 }).handle({
      method: "POST",
      pathname: "/api/ticketing/v1/quote",
      body: { inventoryId: "tin_quote_contract_0001", quantity: 1 },
      correlationId: "ticketing:test:quote:sold-out",
    });
    expect(soldOut.status).toBe(409);
    expect(soldOut.body.error).toBe("TICKETING_INVENTORY_EXHAUSTED");

    const overMax = await transportWithQuote({ remainingQuantity: 4 }).handle({
      method: "POST",
      pathname: "/api/ticketing/v1/quote",
      body: { inventoryId: "tin_quote_contract_0001", quantity: 5 },
      correlationId: "ticketing:test:quote:over-max",
    });
    expect(overMax.status).toBe(409);
    expect(overMax.body.error).toBe("TICKETING_QUANTITY_LIMIT");
  });

  it("fails closed for unavailable inventory and invalid quantity", async () => {
    const unavailable = await transportWithQuote({ sellable: false }).handle({
      method: "POST",
      pathname: "/api/ticketing/v1/quote",
      body: { inventoryId: "tin_quote_contract_0001", quantity: 1 },
      correlationId: "ticketing:test:quote:unavailable",
    });
    expect(unavailable.status).toBe(409);
    expect(unavailable.body.error).toBe("TICKETING_INVENTORY_UNAVAILABLE");

    const invalid = await transportWithQuote().handle({
      method: "POST",
      pathname: "/api/ticketing/v1/quote",
      body: { inventoryId: "tin_quote_contract_0001", quantity: 0 },
      correlationId: "ticketing:test:quote:invalid",
    });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error).toBe("TICKETING_QUANTITY_INVALID");
  });
});

describe("Ticketing public HTTP offline sync error boundary", () => {
  it("preserves ticket expiry as a business conflict after device authentication", async () => {
    const sync = vi
      .fn()
      .mockRejectedValue(
        new TicketingApplicationError("TICKETING_TICKET_EXPIRED"),
      );
    const { transport, audit } = transportWithOfflineSync(sync);

    const result = await transport.handle({
      method: "POST",
      pathname: "/api/ticketing/v1/offline-sync",
      headers: { authorization: "Bearer valid-device-credential" },
      body: { envelope: {} },
      correlationId: "ticketing:test:offline:expired",
    });

    expect(result.status).toBe(409);
    expect(result.body.error).toBe("TICKETING_TICKET_EXPIRED");
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ticketing.offline.sync",
        result: "failure",
        reason: "TICKETING_TICKET_EXPIRED",
      }),
    );
  });

  it("keeps device credential failures fail-closed as authentication errors", async () => {
    const sync = vi
      .fn()
      .mockRejectedValue(new Error("TICKETING_DEVICE_CREDENTIAL_INVALID"));
    const { transport, audit } = transportWithOfflineSync(sync);

    const result = await transport.handle({
      method: "POST",
      pathname: "/api/ticketing/v1/offline-sync",
      headers: { authorization: "Bearer invalid-device-credential" },
      body: { envelope: {} },
      correlationId: "ticketing:test:offline:credential",
    });

    expect(result.status).toBe(401);
    expect(result.body.error).toBe("DEVICE_AUTH_REQUIRED");
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ticketing.offline.sync",
        result: "denied",
        reason: "device_auth_or_envelope_invalid",
      }),
    );
  });

  it("maps duplicate validation to an idempotency conflict instead of availability failure", async () => {
    const sync = vi
      .fn()
      .mockRejectedValue(
        new TicketingApplicationError("TICKETING_TICKET_ALREADY_VALIDATED"),
      );
    const { transport } = transportWithOfflineSync(sync);

    const result = await transport.handle({
      method: "POST",
      pathname: "/api/ticketing/v1/offline-sync",
      headers: { authorization: "Bearer valid-device-credential" },
      body: { envelope: {} },
      correlationId: "ticketing:test:offline:duplicate-validation",
    });

    expect(result.status).toBe(409);
    expect(result.body.error).toBe("TICKETING_TICKET_ALREADY_VALIDATED");
  });
});

describe("Ticketing online check-in capability boundary", () => {
  it("rejects missing operator capability before inspecting the check-in payload", async () => {
    let payloadReads = 0;
    const authorize = vi.fn<
      TicketingPublicHttpTransportDependencies["authorization"]["authorize"]
    >(async (_request, options) =>
      options.admin
        ? { allowed: false as const, reason: "admin_required" as const }
        : {
            allowed: true as const,
            actor: { subject: "non-operator", role: "viewer" as const },
          },
    );
    const dependencies = {
      enabled: true,
      authorization: { authorize },
      audit: { record: vi.fn().mockResolvedValue(undefined) },
      clock: { now: () => "2026-11-02T12:00:00.000Z" },
    } as unknown as TicketingPublicHttpTransportDependencies;
    const result = await new TicketingPublicHttpTransport(dependencies).handle({
      method: "POST",
      pathname: "/api/ticketing/v1/operator/check-in",
      headers: {},
      get body() {
        payloadReads += 1;
        throw new Error("OPERATOR_PAYLOAD_MUST_REMAIN_UNREAD");
      },
    });
    expect(result.status).toBe(403);
    expect(result.body.error).toBe("ADMIN_REQUIRED");
    expect(payloadReads).toBe(0);
    expect(authorize).toHaveBeenCalledTimes(1);
  });
});

describe("D02 online trusted context and error boundary", () => {
  const authority = {
    subject: "operator-current",
    capabilities: ["ticketing.manage"],
    scope: { kind: "business", businessIds: ["business-a"] },
  };
  const request = {
    method: "POST",
    pathname: "/api/ticketing/v1/operator/check-in",
  };
  function fixture(operatorAuthority: unknown) {
    const checkInByQr = vi.fn().mockResolvedValue({ replayed: false });
    const audit = vi.fn().mockResolvedValue(undefined);
    const dependencies = {
      enabled: true,
      authorization: {
        authorize: vi.fn().mockResolvedValue({
          allowed: true,
          actor: {
            subject: authority.subject,
            role: "admin",
            operatorAuthority,
          },
        }),
      },
      ticketing: { checkInByQr },
      audit: { record: audit },
      clock: { now: () => "2026-11-03T04:00:00.000Z" },
    } as unknown as TicketingPublicHttpTransportDependencies;
    return {
      transport: new TicketingPublicHttpTransport(dependencies),
      checkInByQr,
      audit,
    };
  }

  it.each([
    undefined,
    { ...authority, subject: "forged-actor" },
    { ...authority, capabilities: [] },
  ])(
    "requires current operator authority before payload access: %j",
    async (value) => {
      const { transport, checkInByQr } = fixture(value);
      let reads = 0;
      const result = await transport.handle({
        ...request,
        get body() {
          reads += 1;
          throw new Error("BODY_MUST_REMAIN_UNREAD");
        },
      });
      expect(result.status).toBe(403);
      expect(result.body).toEqual({ error: "TICKETING_OPERATOR_FORBIDDEN" });
      expect(reads).toBe(0);
      expect(checkInByQr).not.toHaveBeenCalled();
    },
  );

  it("forwards only server actor, scope and clock despite forged payload fields", async () => {
    const { transport, checkInByQr } = fixture(authority);
    const result = await transport.handle({
      ...request,
      body: {
        qrPayload: "signed-ticket",
        operatorReference: "forged-actor",
        operatorAuthority: {
          subject: "forged-actor",
          scope: { kind: "platform" },
        },
        businessIds: ["business-b"],
        occurredAt: "2030-01-01T00:00:00Z",
      },
    });
    expect(result.status).toBe(200);
    expect(checkInByQr).toHaveBeenCalledTimes(1);
    expect(checkInByQr).toHaveBeenCalledWith({
      qrPayload: "signed-ticket",
      operatorReference: authority.subject,
      operatorAuthority: authority,
      occurredAt: "2026-11-03T04:00:00.000Z",
    });
  });

  it.each([
    [
      new TicketingOperatorAuthorizationError(
        "TICKETING_OPERATOR_FORBIDDEN",
        "CONTRADICTORY_FACTS",
      ),
      403,
    ],
    [
      new TicketingOperatorAuthorizationError(
        "TICKETING_OPERATOR_NOT_FOUND",
        "DESTINATION_MISSING",
      ),
      404,
    ],
    [
      new TicketingOperatorAuthorizationError(
        "TICKETING_OPERATOR_UNAVAILABLE",
        "DEPENDENCY_UNAVAILABLE",
      ),
      503,
    ],
    [new TicketingApplicationError("TICKETING_DESTINATION_SUSPENDED"), 409],
    [new TicketingApplicationError("TICKETING_CHECKIN_REPLAY_CONFLICT"), 409],
    [new Error("TICKETING_CHECKIN_REPLAY_CONFLICT"), 409],
  ] as const)(
    "maps %s to %s without exposing internal owner diagnosis",
    async (error, status) => {
      const { transport, checkInByQr, audit } = fixture(authority);
      checkInByQr.mockRejectedValue(error);
      const result = await transport.handle({
        ...request,
        body: { qrPayload: "signed-ticket" },
      });
      expect(result.status).toBe(status);
      expect(result.body).toEqual({ error: error.message });
      expect(audit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "ticketing.http",
          reason: error.message,
          actorSubject: authority.subject,
        }),
      );
    },
  );
});
