import { createHmac } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  TicketingCommerceHttpTransport,
  type TicketingCommerceHttpTransportDependencies,
} from "./commerce-public-http-transport.js";

const secret = "commerce-test-root-secret-000000000000000000000000";
const now = "2026-09-17T22:00:00.000Z";

function request(
  pathname: string,
  method = "GET",
  headers: Record<string, string> = {},
  body?: unknown,
) {
  return Object.freeze({
    method,
    pathname,
    headers: Object.freeze({
      host: "morro.example",
      "x-forwarded-proto": "https",
      "x-correlation-id": "commerce:test:0001",
      ...headers,
    }),
    body,
    correlationId: "commerce:test:0001",
  });
}

function dependencies(
  authorization: TicketingCommerceHttpTransportDependencies["authorization"] = {
    authorize: vi.fn().mockResolvedValue({
      allowed: false,
      reason: "authentication_required",
    }),
  },
  businessInventoryOverrides: Partial<
    TicketingCommerceHttpTransportDependencies["businessInventory"]
  > = {},
): TicketingCommerceHttpTransportDependencies {
  const businessInventory = {
    listByBusiness: vi.fn().mockResolvedValue([]),
    createForBusiness: vi.fn(),
    disableForBusiness: vi.fn(),
    ...businessInventoryOverrides,
  };
  return {
    enabled: true,
    reservations: {
      availability: vi.fn(),
      findReservationById: vi.fn(),
    },
    reads: {
      listInventory: vi.fn().mockResolvedValue([]),
      listReservationsByHolderReference: vi.fn().mockResolvedValue([]),
    },
    holders: {},
    reservationOrders: {},
    checkoutHandoffs: {},
    tickets: {},
    ticketing: {},
    offlineDevices: {},
    offlineDeviceRegistry: {},
    authorization,
    audit: { record: vi.fn().mockResolvedValue(undefined) },
    qrSigningSecret: secret,
    offlineProvisioningSecret: secret,
    clock: { now: () => now },
    businessInventory,
    destinationId: "morro-de-sao-paulo",
  } as unknown as TicketingCommerceHttpTransportDependencies;
}

function sessionCookie(setCookie: string): string {
  return setCookie.split(";", 1)[0] ?? "";
}

function signedSessionCookie(claims: Record<string, unknown>): string {
  const key = createHmac("sha256", secret)
    .update("morro-digital:commerce-session:v1")
    .digest();
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = createHmac("sha256", key)
    .update(payload)
    .digest("base64url");
  return `morro_commerce_session=${payload}.${signature}`;
}

describe("TicketingCommerceHttpTransport security boundary", () => {
  it("issues an HttpOnly Strict Secure guest session only for same-origin HTTPS", async () => {
    const transport = new TicketingCommerceHttpTransport(dependencies());
    const result = await transport.handle(
      request("/api/ticketing/v1/consumer-session", "POST", {
        origin: "https://morro.example",
      }, {}),
    );

    expect(result.status).toBe(201);
    expect(result.headers["Set-Cookie"]).toContain("HttpOnly");
    expect(result.headers["Set-Cookie"]).toContain("SameSite=Strict");
    expect(result.headers["Set-Cookie"]).toContain("Secure");
    expect(result.body.data).toMatchObject({
      subject: expect.stringMatching(/^guest:[a-f0-9]{32}$/u),
      csrfToken: expect.any(String),
    });
  });

  it("rejects cross-origin guest session issuance", async () => {
    const transport = new TicketingCommerceHttpTransport(dependencies());
    const result = await transport.handle(
      request("/api/ticketing/v1/consumer-session", "POST", {
        origin: "https://evil.example",
      }, {}),
    );
    expect(result.status).toBe(403);
    expect(result.body.error).toBe("ORIGIN_DENIED");
  });

  it("rejects tampered and expired guest sessions", async () => {
    const transport = new TicketingCommerceHttpTransport(dependencies());
    const issued = await transport.handle(
      request("/api/ticketing/v1/consumer-session", "POST", {
        origin: "https://morro.example",
      }, {}),
    );
    const cookie = sessionCookie(String(issued.headers["Set-Cookie"]));
    const tampered = `${cookie.slice(0, -1)}x`;
    const tamperedResult = await transport.handle(
      request("/api/ticketing/v1/reservations", "GET", { cookie: tampered }),
    );
    expect(tamperedResult.status).toBe(401);

    const expired = signedSessionCookie({
      version: 1,
      subject: "guest:0123456789abcdef0123456789abcdef",
      issuedAt: 1_700_000_000,
      expiresAt: 1_700_000_000 + 30 * 24 * 60 * 60,
    });
    const expiredResult = await transport.handle(
      request("/api/ticketing/v1/reservations", "GET", { cookie: expired }),
    );
    expect(expiredResult.status).toBe(401);
  });

  it("requires CSRF for guest mutations and never elevates guest to operator routes", async () => {
    const transport = new TicketingCommerceHttpTransport(dependencies());
    const issued = await transport.handle(
      request("/api/ticketing/v1/consumer-session", "POST", {
        origin: "https://morro.example",
      }, {}),
    );
    const cookie = sessionCookie(String(issued.headers["Set-Cookie"]));

    const mutation = await transport.handle(
      request(
        "/api/ticketing/v1/reservations",
        "POST",
        { cookie, origin: "https://morro.example" },
        {},
      ),
    );
    expect(mutation.status).toBe(403);
    expect(mutation.body.error).toBe("INVALID_CSRF");

    const operator = await transport.handle(
      request(
        "/api/ticketing/v1/operator/check-in",
        "POST",
        {
          cookie,
          origin: "https://morro.example",
          "x-csrf-token": String((issued.body.data as { csrfToken: string }).csrfToken),
        },
        {},
      ),
    );
    expect(operator.status).toBe(401);
    expect(operator.body.error).toBe("AUTH_REQUIRED");
  });

  it("keeps the public catalog readable without creating guest privileges", async () => {
    const deps = dependencies();
    const transport = new TicketingCommerceHttpTransport(deps);
    const result = await transport.handle(
      request("/api/ticketing/v1/inventory", "GET"),
    );
    expect(result.status).toBe(200);
    expect(result.body.data).toEqual([]);
  });

  it("fails closed for cross-tenant Morro Pro inventory reads", async () => {
    const listByBusiness = vi.fn().mockResolvedValue([]);
    const transport = new TicketingCommerceHttpTransport(
      dependencies(
        {
          authorize: vi.fn().mockResolvedValue({
            allowed: true,
            actor: {
              subject: "user:business-a",
              role: "editor",
              businessIds: ["business-a"],
            },
          }),
        },
        { listByBusiness },
      ),
    );
    const result = await transport.handle(
      request("/api/ticketing/v1/operator/businesses/business-b/inventory", "GET"),
    );
    expect(result.status).toBe(404);
    expect(listByBusiness).not.toHaveBeenCalled();
  });

  it("allows an authenticated tenant to list only its own Morro Pro inventory", async () => {
    const listByBusiness = vi.fn().mockResolvedValue([]);
    const transport = new TicketingCommerceHttpTransport(
      dependencies(
        {
          authorize: vi.fn().mockResolvedValue({
            allowed: true,
            actor: {
              subject: "user:business-a",
              role: "editor",
              businessIds: ["business-a"],
            },
          }),
        },
        { listByBusiness },
      ),
    );
    const result = await transport.handle(
      request("/api/ticketing/v1/operator/businesses/business-a/inventory", "GET"),
    );
    expect(result.status).toBe(200);
    expect(listByBusiness).toHaveBeenCalledWith("business-a");
  });
});
