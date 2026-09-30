import { describe, expect, it } from "vitest";

import {
  GROWTH_HTTP_ROUTES,
  evaluateGrowthRequestGuard,
  validateGrowthHttpRoutes,
} from "./index.js";

const redeemRoute = GROWTH_HTTP_ROUTES.find(
  (route) => route.operationId === "growth.rewards.redeem",
);

function subjectContext() {
  return {
    credentialKind: "authenticated_session" as const,
    subjectId: "asub_00000001",
    requestDestinationId: "morro",
    credentialDestinationIds: new Set(["morro"]),
    requestTenantId: "tenant_00000001",
    credentialTenantIds: new Set(["tenant_00000001"]),
    capabilities: new Set(["growth.read", "growth.write"]),
    sessionCookiePresent: true,
    csrfTokenPresent: true,
    csrfTokenMatchesSession: true,
    idempotencyKey: "idem_00000001",
    requestCountInWindow: 0,
    rateLimitMaximum: 20,
  };
}

describe("isolated growth HTTP contracts", () => {
  it("keeps every route versioned and explicitly unmounted", () => {
    const routes = validateGrowthHttpRoutes(GROWTH_HTTP_ROUTES);

    expect(routes.length).toBeGreaterThan(0);
    expect(
      routes.every(
        (route) =>
          route.path.startsWith("/v1/growth/") &&
          route.runtimeMounted === false,
      ),
    ).toBe(true);
  });

  it("fails closed on cross-tenant reward redemption", () => {
    if (!redeemRoute) throw new Error("REDEEM_ROUTE_MISSING");

    const decision = evaluateGrowthRequestGuard(redeemRoute, {
      ...subjectContext(),
      requestTenantId: "tenant_other",
    });

    expect(decision).toEqual({
      allowed: false,
      code: "TENANT_SCOPE_DENIED",
    });
  });

  it("requires CSRF for cookie-authenticated mutations", () => {
    if (!redeemRoute) throw new Error("REDEEM_ROUTE_MISSING");

    const decision = evaluateGrowthRequestGuard(redeemRoute, {
      ...subjectContext(),
      csrfTokenMatchesSession: false,
    });

    expect(decision).toEqual({
      allowed: false,
      code: "CSRF_INVALID",
    });
  });

  it("requires idempotency on value mutations", () => {
    if (!redeemRoute) throw new Error("REDEEM_ROUTE_MISSING");

    const decision = evaluateGrowthRequestGuard(redeemRoute, {
      ...subjectContext(),
      idempotencyKey: null,
    });

    expect(decision).toEqual({
      allowed: false,
      code: "IDEMPOTENCY_KEY_REQUIRED",
    });
  });

  it("enforces capabilities before a request reaches a domain owner", () => {
    if (!redeemRoute) throw new Error("REDEEM_ROUTE_MISSING");

    const decision = evaluateGrowthRequestGuard(redeemRoute, {
      ...subjectContext(),
      capabilities: new Set(["growth.read"]),
    });

    expect(decision).toEqual({
      allowed: false,
      code: "CAPABILITY_DENIED",
    });
  });

  it("enforces route-specific rate limits", () => {
    if (!redeemRoute) throw new Error("REDEEM_ROUTE_MISSING");

    const decision = evaluateGrowthRequestGuard(redeemRoute, {
      ...subjectContext(),
      requestCountInWindow: 20,
      rateLimitMaximum: 20,
    });

    expect(decision).toEqual({
      allowed: false,
      code: "RATE_LIMIT_EXCEEDED",
    });
  });

  it("allows an authorized scoped request without mounting any runtime", () => {
    if (!redeemRoute) throw new Error("REDEEM_ROUTE_MISSING");

    expect(evaluateGrowthRequestGuard(redeemRoute, subjectContext())).toEqual({
      allowed: true,
      code: "ALLOWED",
    });
  });
});
