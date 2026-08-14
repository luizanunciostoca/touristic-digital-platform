import { describe, expect, it } from "vitest";

import type { CheckoutApplicationRequest } from "@touristic/ordering";
import {
  normalizeBusinessCheckoutHandoff,
  normalizeOrderId,
} from "@touristic/ordering";

import {
  checkoutHandoffFingerprint,
  checkoutRequestFingerprint,
  createCheckoutHandoffCapability,
  createCheckoutReturnUrlPolicyFromEnvironment,
  createCheckoutStatusCapability,
  normalizeCheckoutRequestContext,
  verifyCheckoutHandoffCapability,
} from "./checkout-security.js";

const secret = "m139-secret-with-at-least-thirty-two-characters";

function request(): CheckoutApplicationRequest {
  return {
    sessionId: "security_session_123",
    planId: "growth",
    contractor: {
      name: "Cliente Seguro",
      email: "secure@example.com",
      phone: "+55 75 99999-0000",
      document: "123.456.789-00",
    },
    businessDraft: {
      demoBusinessId: "demo_security_123",
      displayName: "Negócio Seguro",
      categoryId: "restaurant",
      specialty: "Local",
      environment: "sandbox",
      publishable: false,
    },
    acceptedTerms: [
      {
        type: "privacy",
        version: "privacy_v1",
        acceptedAt: "2026-08-14T22:00:00Z",
      },
      {
        type: "terms",
        version: "terms_v1",
        acceptedAt: "2026-08-14T22:00:00Z",
      },
    ],
    returnUrl: "https://morro.digital/checkout/return",
    tutorial: false,
    requiresPaymentsCapability: true,
  };
}

describe("M139 checkout security primitives", () => {
  it("derives deterministic status capabilities and verifies only the exact token", () => {
    const orderId = normalizeOrderId("ord_security_12345678");
    if (!orderId) throw new Error("FIXTURE_INVALID");
    const capability = createCheckoutStatusCapability(secret);
    const first = capability.issue(orderId);
    const second = capability.issue(orderId);

    expect(first).toEqual(second);
    expect(first.token).toMatch(/^cst_v1_[A-Za-z0-9_-]+$/u);
    expect(first.tokenHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(
      capability.verify(orderId, first.token, first.tokenHash),
    ).toBe(true);
    expect(
      capability.verify(orderId, first.token + "x", first.tokenHash),
    ).toBe(false);
    expect(
      capability.verify(orderId, first.token, "0".repeat(64)),
    ).toBe(false);
  });

  it("binds a bounded guest capability to the full normalized handoff and context", () => {
    const token = createCheckoutHandoffCapability(
      request(),
      { destinationId: "morro", tenantId: null },
      secret,
      { nowEpochSeconds: 1_776_000_000, ttlSeconds: 900 },
    );
    expect(token).not.toBeNull();

    const verified = verifyCheckoutHandoffCapability(
      token,
      request(),
      secret,
      { nowEpochSeconds: 1_776_000_100 },
    );
    expect(verified).toEqual({
      requesterKind: "guest_capability",
      actorSubject: "guest:security_session_123",
      destinationId: "morro",
      tenantId: null,
    });

    expect(
      verifyCheckoutHandoffCapability(
        token,
        { ...request(), planId: "performance" },
        secret,
        { nowEpochSeconds: 1_776_000_100 },
      ),
    ).toBeNull();
    expect(
      verifyCheckoutHandoffCapability(
        token,
        request(),
        secret,
        { nowEpochSeconds: 1_776_001_000 },
      ),
    ).toBeNull();
  });

  it("canonicalizes legal acceptance ordering in fingerprints but binds authorization context", () => {
    const first = normalizeBusinessCheckoutHandoff(request());
    const reversed = normalizeBusinessCheckoutHandoff({
      ...request(),
      acceptedTerms: [...(request().acceptedTerms as unknown[])].reverse(),
    });
    const authenticated = normalizeCheckoutRequestContext({
      requesterKind: "authenticated",
      actorSubject: "user-123",
      destinationId: "MORRO",
      tenantId: "business-123",
    });
    const guest = normalizeCheckoutRequestContext({
      requesterKind: "guest_capability",
      actorSubject: "guest:security_session_123",
      destinationId: "morro",
      tenantId: null,
    });
    if (!first || !reversed || !authenticated || !guest) {
      throw new Error("FIXTURE_INVALID");
    }

    expect(checkoutHandoffFingerprint(first)).toBe(
      checkoutHandoffFingerprint(reversed),
    );
    expect(checkoutRequestFingerprint(first, authenticated)).not.toBe(
      checkoutRequestFingerprint(first, guest),
    );
    expect(authenticated.destinationId).toBe("morro");
  });

  it("enforces an exact production HTTPS return-origin allowlist", () => {
    const policy = createCheckoutReturnUrlPolicyFromEnvironment({
      NODE_ENV: "production",
      PAYMENTS_RETURN_URL_ORIGINS:
        "https://morro.digital,https://itacare.digital",
    });
    const context = normalizeCheckoutRequestContext({
      requesterKind: "authenticated",
      actorSubject: "user-123",
      destinationId: "morro",
      tenantId: "business-123",
    });
    if (!context) throw new Error("FIXTURE_INVALID");

    expect(
      policy.allows(
        "https://morro.digital/checkout/return?state=1",
        context,
      ),
    ).toBe(true);
    expect(
      policy.allows("https://evil.example/return", context),
    ).toBe(false);
    expect(
      policy.allows("http://morro.digital/return", context),
    ).toBe(false);
  });

  it("fails closed when security secrets or allowlists are absent", () => {
    expect(() => createCheckoutStatusCapability("short")).toThrow(
      "PAYMENTS_STATUS_TOKEN_SECRET is required",
    );
    expect(() =>
      createCheckoutReturnUrlPolicyFromEnvironment({}),
    ).toThrow("PAYMENTS_RETURN_URL_ORIGINS is required");
  });
});
