import { describe, expect, it } from "vitest";
import {
  issueAffiliateReferralToken,
  verifyAffiliateReferralToken,
  createAffiliatesApi,
} from "./affiliates-api.mjs";

const secret = "affiliate-test-secret-that-is-at-least-32-bytes-long";

describe("affiliate referral token", () => {
  it("round-trips signed server-owned referral authority", () => {
    const issued = issueAffiliateReferralToken(
      {
        affiliateId: "aff_portal_0001",
        programId: "program_morro_0001",
        destinationId: "morro-de-sao-paulo",
        ttlSeconds: 3600,
      },
      secret,
      1_800_000_000,
    );

    expect(
      verifyAffiliateReferralToken(issued.token, secret, 1_800_000_100),
    ).toMatchObject({
      v: 1,
      affiliateId: "aff_portal_0001",
      programId: "program_morro_0001",
      destinationId: "morro-de-sao-paulo",
      issuedAt: 1_800_000_000,
      expiresAt: 1_800_003_600,
    });
  });

  it("rejects tampering and expiration", () => {
    const issued = issueAffiliateReferralToken(
      {
        affiliateId: "aff_portal_0001",
        programId: "program_morro_0001",
        destinationId: "morro-de-sao-paulo",
        ttlSeconds: 600,
      },
      secret,
      1_800_000_000,
    );

    expect(
      verifyAffiliateReferralToken(
        `${issued.token}tampered`,
        secret,
        1_800_000_100,
      ),
    ).toBeNull();
    expect(
      verifyAffiliateReferralToken(issued.token, secret, 1_800_000_601),
    ).toBeNull();
  });

  it("rejects a token signed for a different secret", () => {
    const issued = issueAffiliateReferralToken(
      {
        affiliateId: "aff_portal_0001",
        programId: "program_morro_0001",
        destinationId: "morro-de-sao-paulo",
        ttlSeconds: 600,
      },
      secret,
      1_800_000_000,
    );
    expect(
      verifyAffiliateReferralToken(
        issued.token,
        "different-secret-that-is-also-at-least-32-bytes-long",
        1_800_000_100,
      ),
    ).toBeNull();
  });

  it("caps issued token lifetime at the canonical 30-day window", () => {
    const issued = issueAffiliateReferralToken(
      {
        affiliateId: "aff_portal_0001",
        programId: "program_morro_0001",
        destinationId: "morro-de-sao-paulo",
        ttlSeconds: 365 * 24 * 60 * 60,
      },
      secret,
      1_800_000_000,
    );

    expect(issued.payload.expiresAt - issued.payload.issuedAt).toBe(
      30 * 24 * 60 * 60,
    );
  });
});


function request(method, body, headers = {}) {
  const payload = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
  return {
    method,
    headers,
    async *[Symbol.asyncIterator]() {
      for (const chunk of payload) yield chunk;
    },
  };
}

function responseRecorder() {
  const headers = new Map();
  return {
    statusCode: 0,
    body: "",
    setHeader(name, value) {
      headers.set(String(name).toLowerCase(), value);
    },
    getHeader(name) {
      return headers.get(String(name).toLowerCase());
    },
    end(value = "") {
      this.body = String(value);
    },
  };
}

function fakePool() {
  const account = {
    affiliate_id: "aff_portal_0001",
    identity_reference: "identity-affiliate-1",
    account_type: "person",
    role_category: "creator",
    status: "active",
    identity_verified: 1,
    contact_verified: 1,
    fraud_blocked: 0,
    created_at: "2026-09-20T12:00:00.000Z",
    updated_at: "2026-09-20T12:00:00.000Z",
  };
  const membership = {
    membership_id: "membership_0001",
    program_id: "program_morro_0001",
    status: "approved",
    accepted_terms_version: "v1",
    financial_onboarding_status: "eligible",
    joined_at: "2026-09-20T12:00:00.000Z",
    ended_at: null,
    updated_at: "2026-09-20T12:00:00.000Z",
    destination_id: "morro-de-sao-paulo",
    program_status: "active",
    terms_version: "v1",
  };
  return {
    async execute(sql, params) {
      if (sql.includes("FROM affiliate_accounts")) return [[account]];
      if (sql.includes("FROM affiliate_memberships")) {
        return [params?.[1] === "morro-de-sao-paulo" ? [membership] : []];
      }
      if (sql.includes("FROM affiliate_entitlements e")) return [[]];
      if (sql.includes("FROM affiliate_conversions c")) return [[]];
      if (sql.includes("FROM affiliate_attributions a")) {
        return [[{ attribution_count: 0, latest_attribution_at: null }]];
      }
      if (sql.includes("FROM affiliate_materialization_requests mr2")) return [[]];
      throw new Error(`UNEXPECTED_SQL:${sql}`);
    },
    async end() {},
  };
}

function apiHarness({ resolveSession, authorizeMutation } = {}) {
  const pool = fakePool();
  const api = createAffiliatesApi({
    authApi: {
      resolveSession:
        resolveSession ??
        (async () => ({
          subject: "identity-affiliate-1",
          role: "owner",
        })),
      authorizeMutation:
        authorizeMutation ??
        (() => ({ allowed: true })),
    },
    getEnvironmentValue(key) {
      const values = {
        AFFILIATES_RUNTIME_ENABLED: "true",
        AFFILIATE_DESTINATION_ID: "morro-de-sao-paulo",
        AFFILIATE_PUBLIC_ORIGIN: "https://morro.example",
        AFFILIATE_REFERRAL_SECRET: secret,
        AFFILIATE_REFERRAL_TTL_SECONDS: "3600",
        AFFILIATES_DATABASE_URL: "mysql://unused",
        NODE_ENV: "test",
      };
      return values[key] ?? "";
    },
    runtimeDependencies: {
      createPool: () => pool,
      applySchema: async () => {},
      applyIdentitySchema: async () => {},
      createApplication: () => ({
        recordReferralAndEstablishAttribution: async () => ({
          attribution: { id: "attr_0001", expiresAt: "2026-10-01T00:00:00.000Z" },
          replayed: false,
        }),
      }),
    },
  });
  return api;
}

describe("affiliate portal HTTP security contract", () => {
  it("fails closed for absent or expired sessions", async () => {
    const api = apiHarness({ resolveSession: async () => null });
    expect(await api.start()).toBe(true);
    const res = responseRecorder();
    await api.handle(
      request("GET"),
      res,
      new URL("https://morro.example/api/affiliates/v1/me"),
    );
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body)).toEqual({ error: "AUTH_REQUIRED" });
    await api.stop();
  });

  it("binds readback to session identity and server destination", async () => {
    const api = apiHarness();
    expect(await api.start()).toBe(true);
    const res = responseRecorder();
    await api.handle(
      request("GET"),
      res,
      new URL("https://morro.example/api/affiliates/v1/me?affiliateId=aff_forged_9999&destinationId=other"),
    );
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.affiliate.affiliateId).toBe("aff_portal_0001");
    expect(body.memberships).toHaveLength(1);
    expect(body.memberships[0].destination_id).toBe("morro-de-sao-paulo");
    expect(body.payoutAuthority).toEqual(
      expect.objectContaining({
        owner: "Financial",
        affiliateCanInitiatePayout: false,
      }),
    );
    await api.stop();
  });

  it("rejects forged affiliate, destination and monetary authority on link issuance", async () => {
    const api = apiHarness();
    expect(await api.start()).toBe(true);
    for (const forged of [
      { affiliateId: "aff_other_0001" },
      { destinationId: "other-destination" },
      { commissionMinor: "99999999" },
      { payout: true },
    ]) {
      const res = responseRecorder();
      await api.handle(
        request(
          "POST",
          { programId: "program_morro_0001", path: "/passeios", ...forged },
          { origin: "https://morro.example", "x-csrf-token": "csrf" },
        ),
        res,
        new URL("https://morro.example/api/affiliates/v1/referral-links"),
      );
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body)).toEqual({ error: "REFERRAL_AUTHORITY_FORBIDDEN" });
    }
    await api.stop();
  });

  it("denies invalid CSRF and origin decisions from auth authority", async () => {
    const api = apiHarness({
      authorizeMutation: () => ({ allowed: false, reason: "invalid_csrf" }),
    });
    expect(await api.start()).toBe(true);
    const res = responseRecorder();
    await api.handle(
      request("POST", { programId: "program_morro_0001", path: "/" }),
      res,
      new URL("https://morro.example/api/affiliates/v1/referral-links"),
    );
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body)).toEqual({ error: "INVALID_CSRF" });
    await api.stop();
  });

  it("rejects a validly signed referral for another destination", async () => {
    const api = apiHarness();
    expect(await api.start()).toBe(true);
    const issued = issueAffiliateReferralToken(
      {
        affiliateId: "aff_portal_0001",
        programId: "program_other_0001",
        destinationId: "other-destination",
        ttlSeconds: 600,
      },
      secret,
    );
    const res = responseRecorder();
    await api.handle(
      request(
        "POST",
        { token: issued.token },
        { origin: "https://morro.example" },
      ),
      res,
      new URL("https://morro.example/api/affiliates/v1/referral-capture"),
    );
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body)).toEqual({
      error: "AFFILIATE_DESTINATION_FORBIDDEN",
    });
    await api.stop();
  });
});
