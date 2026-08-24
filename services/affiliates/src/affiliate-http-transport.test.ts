import {
  normalizeAcquisitionSubjectId,
  normalizeAffiliateId,
  normalizeAffiliateProgramId,
  normalizeAttributionId,
  normalizeReferralEvidenceId,
  type Attribution,
} from "@touristic/affiliates";
import { describe, expect, it, vi } from "vitest";
import {
  handleAffiliateHttpRequest,
  type AffiliateHttpAuthorizationPort,
} from "./affiliate-http-transport.js";

function required<T>(value: T | null, label: string): T {
  if (!value) throw new Error(`TEST_ID_INVALID:${label}`);
  return value;
}

const mockAttribution: Attribution = {
  id: required(normalizeAttributionId("attr_http_0001"), "attribution"),
  affiliateId: required(normalizeAffiliateId("aff_00000001"), "affiliate"),
  programId: required(normalizeAffiliateProgramId("apg_morro0001"), "program"),
  subjectId: required(
    normalizeAcquisitionSubjectId("asub_http_0001"),
    "subject",
  ),
  evidenceId: required(
    normalizeReferralEvidenceId("afev_http_0001"),
    "evidence",
  ),
  evidenceFingerprint:
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  source: "checkout_code",
  establishedAt: "2026-08-23T22:00:00.000Z",
  expiresAt: "2026-09-22T22:00:00.000Z",
  policyVersion: "AFFILIATE-POLICY-V1",
};

const allowedDecision = {
  allowed: true as const,
  actor: {
    subject: "affiliate-user",
    role: "affiliate" as const,
    affiliateId: "aff_00000001",
    destinationId: "morro",
  },
};

function dependencies(
  decision: Awaited<
    ReturnType<AffiliateHttpAuthorizationPort["authorize"]>
  > = allowedDecision,
) {
  return {
    authorization: {
      authorize: vi.fn(async () => decision),
    },
    reads: {
      readAffiliate: vi.fn(async () => ({
        status: "active",
        destinationId: "morro",
      })),
    },
    application: {
      recordReferralAndEstablishAttribution: vi.fn(async (input: unknown) => {
        void input;
        return {
          attribution: mockAttribution,
          replayed: false,
          idempotencyKey: "affiliate:v1:test",
        };
      }),
    },
  };
}

function validReferralBody(
  source:
    | "platform_link"
    | "platform_qr"
    | "checkout_code"
    | "server_referral" = "checkout_code",
) {
  return {
    requestId: "request-http-0001",
    programId: "prog_morro_0001",
    subjectId: "browser-subject-reference-0001",
    source,
    evidence: { token: "opaque-referral-evidence" },
  };
}

describe("Affiliates authenticated HTTP boundary", () => {
  it("denies unauthenticated requests", async () => {
    const deps = dependencies({
      allowed: false,
      reason: "authentication_required",
    });
    const result = await handleAffiliateHttpRequest(
      {
        method: "GET",
        pathname: "/api/affiliates/v1/me",
        destinationId: "morro",
      },
      deps,
    );
    expect(result.status).toBe(401);
    expect(result.body).toEqual({ error: "AUTH_REQUIRED" });
  });

  it("denies unauthorized roles", async () => {
    const deps = dependencies({ allowed: false, reason: "forbidden" });
    const result = await handleAffiliateHttpRequest(
      {
        method: "POST",
        pathname: "/api/affiliates/v1/referrals",
        destinationId: "morro",
        body: validReferralBody(),
      },
      deps,
    );
    expect(result.status).toBe(403);
    expect(result.body).toEqual({ error: "FORBIDDEN" });
    expect(
      deps.application.recordReferralAndEstablishAttribution,
    ).not.toHaveBeenCalled();
  });

  it("denies a tenant mismatch even if upstream authorization returns allowed", async () => {
    const deps = dependencies({
      allowed: true,
      actor: { ...allowedDecision.actor, destinationId: "other" },
    });
    const result = await handleAffiliateHttpRequest(
      {
        method: "GET",
        pathname: "/api/affiliates/v1/me",
        destinationId: "morro",
      },
      deps,
    );
    expect(result.status).toBe(403);
    expect(deps.reads.readAffiliate).not.toHaveBeenCalled();
  });

  it("fails closed when authenticated affiliate context is incomplete", async () => {
    const deps = dependencies({
      allowed: true,
      actor: {
        subject: "affiliate-user",
        role: "affiliate",
        destinationId: "morro",
      },
    });
    const result = await handleAffiliateHttpRequest(
      {
        method: "POST",
        pathname: "/api/affiliates/v1/referrals",
        destinationId: "morro",
        body: validReferralBody(),
      },
      deps,
    );
    expect(result.status).toBe(403);
    expect(result.body).toEqual({ error: "FORBIDDEN" });
    expect(
      deps.application.recordReferralAndEstablishAttribution,
    ).not.toHaveBeenCalled();
  });

  it("denies affiliate or destination mismatch supplied by the browser", async () => {
    for (const body of [
      { ...validReferralBody(), affiliateId: "aff_other0001" },
      { ...validReferralBody(), destinationId: "other" },
    ]) {
      const deps = dependencies();
      const result = await handleAffiliateHttpRequest(
        {
          method: "POST",
          pathname: "/api/affiliates/v1/referrals",
          destinationId: "morro",
          body,
        },
        deps,
      );
      expect(result.status).toBe(403);
      expect(result.body).toEqual({ error: "FORBIDDEN" });
      expect(
        deps.application.recordReferralAndEstablishAttribution,
      ).not.toHaveBeenCalled();
    }
  });

  it("does not let the browser assert affiliate identity even when it matches the actor", async () => {
    const deps = dependencies();
    const result = await handleAffiliateHttpRequest(
      {
        method: "POST",
        pathname: "/api/affiliates/v1/referrals",
        destinationId: "morro",
        body: { ...validReferralBody(), affiliateId: "aff_00000001" },
      },
      deps,
    );
    expect(result.status).toBe(400);
    expect(result.body).toEqual({ error: "ATTRIBUTION_AUTHORITY_FORBIDDEN" });
    expect(
      deps.application.recordReferralAndEstablishAttribution,
    ).not.toHaveBeenCalled();
  });

  it("rejects browser monetary authority before application mutation", async () => {
    const deps = dependencies();
    for (const monetaryInput of [
      { amount: 1000 },
      { currency: "BRL" },
      { payout: { destination: "forbidden" } },
      { providerToken: "forbidden-provider-token" },
    ]) {
      const result = await handleAffiliateHttpRequest(
        {
          method: "POST",
          pathname: "/api/affiliates/v1/referrals",
          destinationId: "morro",
          body: { ...validReferralBody(), ...monetaryInput },
        },
        deps,
      );
      expect(result.status).toBe(400);
      expect(result.body).toEqual({ error: "MONETARY_AUTHORITY_FORBIDDEN" });
    }
    expect(
      deps.application.recordReferralAndEstablishAttribution,
    ).not.toHaveBeenCalled();
  });

  it("rejects browser attempts to supply authoritative attribution fields", async () => {
    const deps = dependencies();
    for (const authoritativeInput of [
      { evidenceId: "afev_attacker01" },
      { attributionId: "attr_attacker01" },
      { evidenceFingerprint: "f".repeat(64) },
      { serverObservedAt: "2099-01-01T00:00:00.000Z" },
      { receivedAt: "2099-01-01T00:00:00.000Z" },
      { establishedAt: "2099-01-01T00:00:00.000Z" },
      { expiresAt: "2099-12-31T00:00:00.000Z" },
      { policyVersion: "ATTACKER-POLICY" },
    ]) {
      const result = await handleAffiliateHttpRequest(
        {
          method: "POST",
          pathname: "/api/affiliates/v1/referrals",
          destinationId: "morro",
          body: { ...validReferralBody(), ...authoritativeInput },
        },
        deps,
      );
      expect(result.status).toBe(400);
      expect(result.body).toEqual({ error: "ATTRIBUTION_AUTHORITY_FORBIDDEN" });
    }
    expect(
      deps.application.recordReferralAndEstablishAttribution,
    ).not.toHaveBeenCalled();
  });

  it("rejects unknown sources and malformed or missing evidence", async () => {
    const deps = dependencies();
    const unknown = await handleAffiliateHttpRequest(
      {
        method: "POST",
        pathname: "/api/affiliates/v1/referrals",
        destinationId: "morro",
        body: { ...validReferralBody(), source: "unknown_source" },
      },
      deps,
    );
    expect(unknown.status).toBe(400);
    expect(unknown.body).toEqual({ error: "INVALID_REFERRAL_SOURCE" });

    for (const malformed of [
      { ...validReferralBody(), evidence: null },
      { ...validReferralBody(), evidence: {} },
      { ...validReferralBody(), evidence: "raw-token" },
      { ...validReferralBody(), requestId: "" },
      { ...validReferralBody(), programId: "" },
      { ...validReferralBody(), subjectId: "" },
    ]) {
      const result = await handleAffiliateHttpRequest(
        {
          method: "POST",
          pathname: "/api/affiliates/v1/referrals",
          destinationId: "morro",
          body: malformed,
        },
        deps,
      );
      expect(result.status).toBe(400);
      expect(result.body).toEqual({ error: "INVALID_REFERRAL_REQUEST" });
    }
    expect(
      deps.application.recordReferralAndEstablishAttribution,
    ).not.toHaveBeenCalled();
  });

  it("accepts browser link, QR and checkout evidence as untrusted input", async () => {
    for (const source of [
      "platform_link",
      "platform_qr",
      "checkout_code",
    ] as const) {
      const deps = dependencies();
      const result = await handleAffiliateHttpRequest(
        {
          method: "POST",
          pathname: "/api/affiliates/v1/referrals",
          destinationId: "morro",
          body: validReferralBody(source),
        },
        deps,
      );
      expect(result.status).toBe(200);
      expect(
        deps.application.recordReferralAndEstablishAttribution,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: "request-http-0001",
          affiliateId: "aff_00000001",
          destinationId: "morro",
          subjectId: "browser-subject-reference-0001",
          source,
          evidence: { token: "opaque-referral-evidence" },
          actorReference: "affiliate-user",
        }),
      );
      const call = deps.application.recordReferralAndEstablishAttribution.mock
        .calls[0]?.[0] as Record<string, unknown> | undefined;
      expect(call).not.toHaveProperty("evidenceId");
      expect(call).not.toHaveProperty("attributionId");
      expect(call).not.toHaveProperty("evidenceFingerprint");
      expect(call).not.toHaveProperty("serverObservedAt");
      expect(call).not.toHaveProperty("receivedAt");
    }
  });

  it("allows server_referral only from an authenticated service principal", async () => {
    const deniedDeps = dependencies();
    const denied = await handleAffiliateHttpRequest(
      {
        method: "POST",
        pathname: "/api/affiliates/v1/referrals",
        destinationId: "morro",
        body: validReferralBody("server_referral"),
      },
      deniedDeps,
    );
    expect(denied.status).toBe(403);
    expect(denied.body).toEqual({ error: "SERVER_REFERRAL_FORBIDDEN" });

    const serviceDeps = dependencies({
      allowed: true,
      actor: {
        subject: "affiliate-ingress-service",
        role: "service",
        affiliateId: "aff_00000001",
        destinationId: "morro",
      },
    });
    const accepted = await handleAffiliateHttpRequest(
      {
        method: "POST",
        pathname: "/api/affiliates/v1/referrals",
        destinationId: "morro",
        body: validReferralBody("server_referral"),
      },
      serviceDeps,
    );
    expect(accepted.status).toBe(200);
    expect(
      serviceDeps.application.recordReferralAndEstablishAttribution,
    ).toHaveBeenCalledTimes(1);
  });

  it("returns a scoped read projection for the authenticated affiliate", async () => {
    const deps = dependencies();
    const result = await handleAffiliateHttpRequest(
      {
        method: "GET",
        pathname: "/api/affiliates/v1/me",
        destinationId: "morro",
      },
      deps,
    );
    expect(result.status).toBe(200);
    expect(result.body).toEqual({
      affiliate: { status: "active", destinationId: "morro" },
    });
    expect(deps.reads.readAffiliate).toHaveBeenCalledWith({
      affiliateId: "aff_00000001",
      destinationId: "morro",
    });
  });
});
