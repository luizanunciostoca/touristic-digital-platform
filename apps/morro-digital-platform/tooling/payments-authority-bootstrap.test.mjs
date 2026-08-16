import { describe, expect, it } from "vitest";

import { verifyCheckoutHandoffCapability } from "@touristic/ordering-server";

import { createPaymentsCheckoutAuthorityBootstrap } from "./payments-api.mjs";

const secret = "payments-handoff-secret-at-least-thirty-two-characters";

function handoff() {
  return {
    sessionId: "bootstrap_session_123",
    planId: "growth",
    contractor: {
      name: "Bootstrap Guest",
      email: "guest@example.com",
      phone: "+55 75 99999-0000",
      document: "123.456.789-00",
    },
    businessDraft: {
      demoBusinessId: "demo-bootstrap",
      displayName: "Bootstrap Business",
      categoryId: "restaurant",
      specialty: "Local",
      environment: "sandbox",
      publishable: false,
    },
    acceptedTerms: [
      {
        type: "terms",
        version: "terms_v1",
        acceptedAt: "2026-08-16T07:00:00Z",
      },
      {
        type: "privacy",
        version: "privacy_v1",
        acceptedAt: "2026-08-16T07:00:00Z",
      },
    ],
    returnUrl: "https://morro.digital/checkout/return",
    tutorial: false,
    requiresPaymentsCapability: true,
  };
}

function bootstrap(overrides = {}) {
  return createPaymentsCheckoutAuthorityBootstrap({
    destinationId: "morro",
    handoffSecret: secret,
    origins: new Set(["https://morro.digital"]),
    production: true,
    rateLimits: {
      consume: () => Promise.resolve({ allowed: true, retryAfterSeconds: 0 }),
    },
    now: () => 1_787_000_000_000,
    audit: () => undefined,
    ...overrides,
  });
}

function request(body = handoff(), overrides = {}) {
  return {
    method: "POST",
    pathname: "/api/payments/v1/checkout-authority",
    headers: { origin: "https://morro.digital" },
    body,
    clientIp: "203.0.113.20",
    correlationId: "corr_bootstrap_12345678",
    ...overrides,
  };
}

describe("Payments server-issued checkout authority bootstrap", () => {
  it("issues a short-lived guest capability bound to the exact handoff", async () => {
    const transport = bootstrap();
    const result = await transport.handle(request());

    expect(result.status).toBe(201);
    expect(result.body.data.handoffToken).toEqual(expect.any(String));
    const context = verifyCheckoutHandoffCapability(
      result.body.data.handoffToken,
      handoff(),
      secret,
      { nowEpochSeconds: 1_787_000_000 },
    );
    expect(context).toEqual({
      requesterKind: "guest_capability",
      actorSubject: "guest:bootstrap_session_123",
      destinationId: "morro",
      tenantId: null,
    });

    const mutated = { ...handoff(), planId: "other" };
    expect(
      verifyCheckoutHandoffCapability(
        result.body.data.handoffToken,
        mutated,
        secret,
        { nowEpochSeconds: 1_787_000_000 },
      ),
    ).toBeNull();
  });

  it("rejects cross-origin issuance before signing", async () => {
    const result = await bootstrap().handle(
      request(handoff(), { headers: { origin: "https://evil.example" } }),
    );
    expect(result.status).toBe(403);
    expect(result.body).toEqual({ error: "ORIGIN_DENIED" });
  });

  it("rejects a return URL outside the configured allow-list", async () => {
    const result = await bootstrap().handle({
      ...request(),
      body: { ...handoff(), returnUrl: "https://evil.example/return" },
    });
    expect(result.status).toBe(400);
    expect(result.body).toEqual({ error: "RETURN_URL_DENIED" });
  });

  it("fails closed when the server-only HMAC secret is unavailable", async () => {
    const result = await bootstrap({ handoffSecret: "short" }).handle(request());
    expect(result.status).toBe(503);
    expect(result.body).toEqual({ error: "CHECKOUT_AUTHORITY_UNAVAILABLE" });
  });

  it("rate-limits capability issuance without creating financial state", async () => {
    const result = await bootstrap({
      rateLimits: {
        consume: () =>
          Promise.resolve({ allowed: false, retryAfterSeconds: 17 }),
      },
    }).handle(request());
    expect(result.status).toBe(429);
    expect(result.body).toEqual({ error: "RATE_LIMITED" });
    expect(result.headers["Retry-After"]).toBe("17");
  });
});
