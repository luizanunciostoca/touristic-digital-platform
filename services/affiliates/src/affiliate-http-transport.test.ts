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
  source: "server_referral",
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
      recordReferralAndEstablishAttribution: vi.fn(async () => ({
        attribution: mockAttribution,
        replayed: false,
        idempotencyKey: "affiliate:v1:test",
      })),
    },
    clock: { now: () => "2026-08-23T22:00:00.000Z" },
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
        body: { source: "checkout_code" },
      },
      deps,
    );
    expect(result.status).toBe(403);
    expect(result.body).toEqual({ error: "FORBIDDEN" });
    expect(
      deps.application.recordReferralAndEstablishAttribution,
    ).not.toHaveBeenCalled();
  });

  it("denies a tenant mismatch even if an upstream authorization adapter returns allowed", async () => {
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

  it("fails closed when the authenticated affiliate context is incomplete", async () => {
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
        body: { source: "checkout_code" },
      },
      deps,
    );
    expect(result.status).toBe(403);
    expect(result.body).toEqual({ error: "FORBIDDEN" });
    expect(
      deps.application.recordReferralAndEstablishAttribution,
    ).not.toHaveBeenCalled();
  });

  it("denies an affiliate mismatch supplied by the browser", async () => {
    const deps = dependencies();
    const result = await handleAffiliateHttpRequest(
      {
        method: "POST",
        pathname: "/api/affiliates/v1/referrals",
        destinationId: "morro",
        body: {
          affiliateId: "aff_other",
          source: "checkout_code",
        },
      },
      deps,
    );
    expect(result.status).toBe(403);
    expect(result.body).toEqual({ error: "FORBIDDEN" });
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
          body: { source: "checkout_code", ...monetaryInput },
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

  it("passes only authoritative actor/tenant identity to the application service", async () => {
    const deps = dependencies();
    const result = await handleAffiliateHttpRequest(
      {
        method: "POST",
        pathname: "/api/affiliates/v1/referrals",
        destinationId: "morro",
        correlationId: "corr:http:referral:0001",
        body: {
          evidenceId: "ref_http_0001",
          attributionId: "att_http_0001",
          programId: "program_morro",
          subjectId: "subject_http_0001",
          source: "server_referral",
          evidenceFingerprint:
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
      },
      deps,
    );
    expect(result.status).toBe(200);
    expect(
      deps.application.recordReferralAndEstablishAttribution,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        affiliateId: "aff_00000001",
        destinationId: "morro",
        actorReference: "affiliate-user",
        programId: "program_morro",
      }),
    );
  });
});
