import { describe, expect, it, vi } from "vitest";
import { handleAffiliateHttpRequest } from "./affiliate-http-transport.js";

function dependencies() {
  return {
    authorization: {
      authorize: vi.fn(async (_request, input) => {
        if (input.destinationId !== "morro")
          return { allowed: false as const, reason: "forbidden" as const };
        return {
          allowed: true as const,
          actor: {
            subject: "affiliate-user",
            role: "affiliate" as const,
            affiliateId: "aff_00000001",
            destinationId: "morro",
          },
        };
      }),
    },
    reads: {
      readAffiliate: vi.fn(async () => ({
        status: "active",
        destinationId: "morro",
      })),
    },
    application: { recordReferralAndEstablishAttribution: vi.fn() },
    clock: { now: () => "2026-08-17T12:00:00.000Z" },
  };
}

describe("Affiliates authenticated HTTP boundary", () => {
  it("denies cross-destination access", async () => {
    const deps = dependencies();
    const result = await handleAffiliateHttpRequest(
      {
        method: "GET",
        pathname: "/api/affiliates/v1/me",
        destinationId: "other",
      },
      deps,
    );
    expect(result.status).toBe(403);
    expect(result.body).toEqual({ error: "FORBIDDEN" });
  });

  it("rejects browser monetary authority before application mutation", async () => {
    const deps = dependencies();
    for (const monetaryInput of [
      { amount: 1000 },
      { currency: "BRL" },
      { payout: { destination: "forbidden" } },
      { providerToken: "forbidden-provider-token" },
      { rate: 0.3 },
      { rateBasisPoints: 3000 },
      { commissionRate: "30%" },
      { commissionMinorUnits: 300 },
      { eligibleRevenueMinorUnits: 1000 },
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
  });
});
