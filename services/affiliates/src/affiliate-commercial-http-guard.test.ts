import { describe, expect, it, vi } from "vitest";
import { handleAffiliateHttpRequest } from "./affiliate-http-transport.js";

function dependencies() {
  return {
    authorization: {
      authorize: vi.fn(async () => ({
        allowed: true as const,
        actor: {
          subject: "affiliate-user",
          role: "affiliate" as const,
          affiliateId: "aff_00000001",
          destinationId: "morro",
        },
      })),
    },
    reads: {
      readAffiliate: vi.fn(async () => null),
    },
    application: {
      recordReferralAndEstablishAttribution: vi.fn(async () => {
        throw new Error("APPLICATION_MUST_NOT_BE_CALLED");
      }),
    },
  };
}

function validBody() {
  return {
    requestId: "request-http-commercial-0001",
    programId: "prog_morro_0001",
    subjectId: "browser-subject-commercial-0001",
    source: "checkout_code" as const,
    evidence: { token: "opaque-referral-evidence" },
  };
}

describe("Affiliate browser commercial authority guard", () => {
  it("fails closed on every browser-supplied commission or eligible-revenue field", async () => {
    for (const forbidden of [
      { rate: 0.3 },
      { rateBasisPoints: 3000 },
      { commissionRate: "30%" },
      { commissionMinorUnits: 300 },
      { eligibleRevenueMinorUnits: 1000 },
    ]) {
      const deps = dependencies();
      const result = await handleAffiliateHttpRequest(
        {
          method: "POST",
          pathname: "/api/affiliates/v1/referrals",
          destinationId: "morro",
          body: { ...validBody(), ...forbidden },
        },
        deps,
      );
      expect(result.status).toBe(400);
      expect(result.body).toEqual({ error: "MONETARY_AUTHORITY_FORBIDDEN" });
      expect(
        deps.application.recordReferralAndEstablishAttribution,
      ).not.toHaveBeenCalled();
    }
  });
});
