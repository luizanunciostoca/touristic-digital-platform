import { describe, expect, it, vi } from "vitest";
import { createAffiliatePortalClient } from "./affiliate-portal-client.js";

const session = {
  authenticated: true as const,
  csrfToken: "csrf-token",
  user: {
    id: "identity-affiliate-1",
    email: "affiliate@example.com",
    role: "owner" as const,
    businessIds: [],
  },
};

const projection = {
  affiliate: {
    affiliateId: "aff_portal_0001",
    accountType: "person" as const,
    roleCategory: "creator",
    status: "active" as const,
    identityVerified: true,
    contactVerified: true,
    fraudBlocked: false,
    createdAt: "2026-09-20T12:00:00.000Z",
    updatedAt: "2026-09-20T12:00:00.000Z",
  },
  memberships: [],
  summaryByCurrency: [],
  attribution: { count: 0, latestAt: null },
  conversions: [],
  materializations: [],
  payoutAuthority: {
    owner: "Financial" as const,
    affiliateCanInitiatePayout: false as const,
    note: "Financial authority",
  },
};

describe("affiliate portal browser client", () => {
  it("fails closed when the dashboard session is absent", async () => {
    const secureFetch = vi.fn();
    const client = createAffiliatePortalClient({
      getSession: vi.fn().mockResolvedValue(null),
      secureFetch,
      logout: vi.fn().mockResolvedValue(true),
      login: vi.fn(),
    });

    await expect(client.bootstrap()).rejects.toThrow("AUTH_REQUIRED");
    expect(secureFetch).not.toHaveBeenCalled();
  });

  it("sends server session credentials and CSRF for referral issuance", async () => {
    const secureFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        referral: {
          url:
            "https://morro.example/affiliate-portal-capture.html?aff_ref=signed",
          expiresAt: "2026-10-20T12:00:00.000Z",
        },
      }), { status: 201, headers: { "Content-Type": "application/json" } }),
    );
    const client = createAffiliatePortalClient({
      getSession: vi.fn().mockResolvedValue(session),
      secureFetch,
      logout: vi.fn().mockResolvedValue(true),
      login: vi.fn(),
    });

    await client.issueReferralLink("program_morro_0001", "/passeios");

    expect(secureFetch).toHaveBeenCalledWith(
      "/api/affiliates/v1/referral-links",
      expect.objectContaining({
        credentials: "same-origin",
        headers: expect.objectContaining({ "X-CSRF-Token": "csrf-token" }),
      }),
    );
  });
  it("loads only the authenticated server projection", async () => {
    const secureFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(projection), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const client = createAffiliatePortalClient({
      getSession: vi.fn().mockResolvedValue(session),
      secureFetch,
      logout: vi.fn().mockResolvedValue(true),
      login: vi.fn(),
    });

    await expect(client.bootstrap()).resolves.toEqual({
      session,
      projection,
    });
    expect(secureFetch).toHaveBeenCalledWith(
      "/api/affiliates/v1/me",
      expect.objectContaining({ method: "GET", cache: "no-store" }),
    );
  });

  it("issues a referral link without browser monetary authority", async () => {
    const secureFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          referral: {
            url: "https://morro.example/?aff_ref=signed",
            expiresAt: "2026-10-20T12:00:00.000Z",
          },
        }),
        {
          status: 201,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    const client = createAffiliatePortalClient({
      getSession: vi.fn().mockResolvedValue(session),
      secureFetch,
      logout: vi.fn().mockResolvedValue(true),
      login: vi.fn(),
    });

    await expect(
      client.issueReferralLink("program_morro_0001", "/passeios"),
    ).resolves.toEqual({
      url: "https://morro.example/?aff_ref=signed",
      expiresAt: "2026-10-20T12:00:00.000Z",
    });
    expect(secureFetch).toHaveBeenCalledWith(
      "/api/affiliates/v1/referral-links",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          programId: "program_morro_0001",
          path: "/passeios",
        }),
      }),
    );
  });
});
