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
