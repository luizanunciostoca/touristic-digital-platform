import { describe, expect, it, vi } from "vitest";

import {
  TicketingPublicHttpTransport,
  type TicketingPublicHttpTransportDependencies,
} from "./public-http-transport.js";
import { TicketingApplicationError } from "./ticketing-application-service.js";

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

function transportWithQuote(overrides: {
  readonly remainingQuantity?: number;
  readonly sellable?: boolean;
} = {}) {
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
