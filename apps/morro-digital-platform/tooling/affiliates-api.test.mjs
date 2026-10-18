import { afterEach, describe, expect, it, vi } from "vitest";
import mysql from "mysql2";
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
    async getConnection() {
      return {
        query: (...args) => this.query(...args),
        release() {},
        destroy() {},
      };
    },
    async query() {
      return [[], []];
    },
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
      if (sql.includes("FROM affiliate_materialization_requests mr2")) {
        return [[]];
      }
      throw new Error(`UNEXPECTED_SQL:${sql}`);
    },
    async end() {},
  };
}

function apiHarness({
  resolveSession,
  authorizeMutation,
  pool = fakePool(),
  environment = {},
  applySchema = async () => {},
  applyIdentitySchema = async () => {},
} = {}) {
  const api = createAffiliatesApi({
    authApi: {
      resolveSession:
        resolveSession ??
        (async () => ({
          subject: "identity-affiliate-1",
          role: "owner",
        })),
      authorizeMutation: authorizeMutation ?? (() => ({ allowed: true })),
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
        ...environment,
      };
      return values[key] ?? "";
    },
    runtimeDependencies: {
      createPool: () => pool,
      applySchema,
      applyIdentitySchema,
      createApplication: () => ({
        recordReferralAndEstablishAttribution: async () => ({
          attribution: {
            id: "attr_0001",
            expiresAt: "2026-10-01T00:00:00.000Z",
          },
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
      new URL(
        "https://morro.example/api/affiliates/v1/me?affiliateId=aff_forged_9999&destinationId=other",
      ),
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
      expect(JSON.parse(res.body)).toEqual({
        error: "REFERRAL_AUTHORITY_FORBIDDEN",
      });
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

describe("affiliate readiness uses bounded read-only database probes", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("keeps disabled affiliates noncritical without opening a pool", async () => {
    const pool = fakePool();
    pool.query = vi.fn();
    const api = apiHarness({
      pool,
      environment: { AFFILIATES_RUNTIME_ENABLED: "false" },
    });
    expect(await api.start()).toBe(true);
    expect(await api.refreshReadiness()).toEqual({
      status: "pass",
      critical: false,
      detail: "disabled-by-configuration",
    });
    expect(pool.query).not.toHaveBeenCalled();
    await api.stop();
  });

  it.each([
    ["AFFILIATE_DESTINATION_ID", "", "AFFILIATE_DESTINATION_ID_REQUIRED"],
    ["AFFILIATE_REFERRAL_SECRET", "short", "AFFILIATE_REFERRAL_SECRET_INVALID"],
    ["AFFILIATE_PUBLIC_ORIGIN", "", "AFFILIATE_PUBLIC_ORIGIN_REQUIRED"],
  ])(
    "publishes only the approved startup code for %s",
    async (key, value, detail) => {
      const api = apiHarness({
        environment: { NODE_ENV: "production", [key]: value },
      });
      expect(await api.start()).toBe(false);
      expect(await api.refreshReadiness()).toEqual({
        status: "fail",
        critical: true,
        detail,
      });
      await api.stop();
    },
  );

  it.each([
    "database connection refused",
    "missing affiliate_accounts column identity_verified",
  ])(
    "cannot become ready in external-schema mode when probe reports %s",
    async (failure) => {
      vi.stubEnv("MORRO_DATABASE_SCHEMA_MODE", "external");
      const pool = fakePool();
      pool.query = vi
        .fn()
        .mockRejectedValue(new Error(`${failure}: private-dsn-and-secret`));
      pool.end = vi.fn().mockResolvedValue(undefined);
      const applySchema = vi.fn();
      const applyIdentitySchema = vi.fn();
      const api = apiHarness({ pool, applySchema, applyIdentitySchema });
      expect(await api.start()).toBe(false);
      expect(pool.query).toHaveBeenCalledOnce();
      expect(applySchema).not.toHaveBeenCalled();
      expect(applyIdentitySchema).not.toHaveBeenCalled();
      expect(api.readinessCheck()).toEqual({
        status: "fail",
        critical: true,
        detail: "AFFILIATES_RUNTIME_UNAVAILABLE",
      });
      expect(JSON.stringify(api.readinessCheck())).not.toContain(
        "private-dsn-and-secret",
      );
      expect(pool.end).toHaveBeenCalledOnce();
      expect(await api.refreshReadiness()).toEqual(api.readinessCheck());
      expect(pool.query).toHaveBeenCalledOnce();
      await api.stop();
      expect(pool.end).toHaveBeenCalledOnce();
    },
  );

  it("probes required tables and migrated identity fields without reading rows", async () => {
    vi.stubEnv("MORRO_DATABASE_SCHEMA_MODE", "external");
    const pool = fakePool();
    pool.query = vi.fn().mockResolvedValue([[], []]);
    const api = apiHarness({ pool });
    expect(await api.start()).toBe(true);
    const command = pool.query.mock.calls[0][0];
    expect(command.timeout).toBeGreaterThan(0);
    expect(command.timeout).toBeLessThanOrEqual(1500);
    expect(command.sql).toMatch(/^SELECT\b/u);
    expect(command.sql).toContain("LIMIT 0");
    for (const table of [
      "affiliate_accounts",
      "affiliate_memberships",
      "affiliate_programs",
      "affiliate_referral_evidence",
      "affiliate_attributions",
      "affiliate_conversions",
      "affiliate_entitlements",
      "affiliate_materialization_requests",
      "affiliate_idempotency_claims",
      "affiliate_audit_events",
      "affiliate_outbox_events",
    ])
      expect(command.sql).toContain(table);
    for (const column of [
      "identity_verified",
      "accepted_terms_version",
      "financial_onboarding_status",
      "destination_id",
    ])
      expect(command.sql).toContain(column);
    expect(command.sql).not.toMatch(
      /\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE)\b/iu,
    );
    expect(api.readinessCheck()).toEqual({
      status: "pass",
      critical: true,
      detail: "affiliates-runtime-ready",
    });
    await api.stop();
  });

  it("detects database failure after startup and recovers on a later successful probe", async () => {
    const pool = fakePool();
    pool.query = vi.fn().mockResolvedValue([[], []]);
    const api = apiHarness({ pool });
    expect(await api.start()).toBe(true);
    pool.query.mockRejectedValueOnce(new Error("lost database: confidential"));
    expect(await api.refreshReadiness()).toEqual({
      status: "fail",
      critical: true,
      detail: "AFFILIATES_RUNTIME_UNAVAILABLE",
    });
    const response = responseRecorder();
    await api.handle(
      request("GET"),
      response,
      new URL("https://morro.example/api/affiliates/v1/me"),
    );
    expect(response.statusCode).toBe(503);
    expect(await api.refreshReadiness()).toEqual({
      status: "pass",
      critical: true,
      detail: "affiliates-runtime-ready",
    });
    await api.stop();
  });

  it("deduplicates concurrent readiness calls into one in-flight query", async () => {
    const pool = fakePool();
    pool.query = vi.fn().mockResolvedValue([[], []]);
    const api = apiHarness({ pool });
    expect(await api.start()).toBe(true);
    let complete;
    pool.query.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const first = api.refreshReadiness();
    const second = api.refreshReadiness();
    await vi.waitFor(() => expect(pool.query).toHaveBeenCalledTimes(2));
    complete([[], []]);
    expect((await first).status).toBe("pass");
    expect((await second).status).toBe("pass");
    expect(pool.query).toHaveBeenCalledTimes(2);
    await api.stop();
  });

  it("destroys a stalled query connection and ignores its late success", async () => {
    vi.useFakeTimers();
    const pool = fakePool();
    pool.query = vi.fn().mockResolvedValue([[], []]);
    const api = apiHarness({ pool });
    expect(await api.start()).toBe(true);
    let complete;
    const destroy = vi.fn();
    pool.getConnection = vi.fn(async () => ({
      query: (...args) => pool.query(...args),
      destroy,
      release() {},
    }));
    pool.query.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const pending = api.refreshReadiness();
    await vi.advanceTimersByTimeAsync(1500);
    expect((await pending).status).toBe("fail");
    expect(destroy).toHaveBeenCalledOnce();
    expect(pool.query).toHaveBeenCalledTimes(2);
    complete([[], []]);
    await vi.advanceTimersByTimeAsync(0);
    expect(api.readinessCheck().status).toBe("fail");
    expect((await api.refreshReadiness()).status).toBe("pass");
    expect(pool.query).toHaveBeenCalledTimes(3);
    await api.stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not resurrect readiness when a probe completes after stop", async () => {
    const pool = fakePool();
    pool.query = vi.fn().mockResolvedValue([[], []]);
    pool.end = vi.fn().mockResolvedValue(undefined);
    const api = apiHarness({ pool });
    expect(await api.start()).toBe(true);
    let complete;
    pool.query.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const pending = api.refreshReadiness();
    await vi.waitFor(() => expect(pool.query).toHaveBeenCalledTimes(2));
    await api.stop();
    complete([[], []]);
    expect((await pending).status).toBe("fail");
    expect(await api.refreshReadiness()).toEqual({
      status: "fail",
      critical: true,
      detail: "AFFILIATES_RUNTIME_NOT_STARTED",
    });
    expect(pool.end).toHaveBeenCalledOnce();
    expect(pool.query).toHaveBeenCalledTimes(2);
  });

  it("fails closed when the runtime cannot create a pool", async () => {
    const api = apiHarness({ pool: null });
    expect(await api.start()).toBe(false);
    expect(await api.refreshReadiness()).toEqual({
      status: "fail",
      critical: true,
      detail: "AFFILIATES_RUNTIME_UNAVAILABLE",
    });
    await api.stop();
  });

  it.each(["timeout", "stop"])(
    "destroys a connection acquired after %s without issuing SQL",
    async (mode) => {
      vi.useFakeTimers();
      const pool = fakePool();
      pool.query = vi.fn().mockResolvedValue([[], []]);
      const normalConnection = pool.getConnection.bind(pool);
      pool.getConnection = vi.fn(normalConnection);
      const api = apiHarness({ pool });
      expect(await api.start()).toBe(true);
      let acquired;
      pool.getConnection.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            acquired = resolve;
          }),
      );
      const pending = api.refreshReadiness();
      const concurrent = api.refreshReadiness();
      await vi.advanceTimersByTimeAsync(0);
      if (mode === "timeout") await vi.advanceTimersByTimeAsync(1500);
      else await api.stop();
      expect((await pending).status).toBe("fail");
      expect((await concurrent).status).toBe("fail");
      expect((await api.refreshReadiness()).status).toBe("fail");
      expect(pool.getConnection).toHaveBeenCalledTimes(2);
      const lateConnection = {
        query: vi.fn(),
        release: vi.fn(),
        destroy: vi.fn(),
      };
      acquired(lateConnection);
      await vi.advanceTimersByTimeAsync(0);
      expect(lateConnection.destroy).toHaveBeenCalledOnce();
      expect(lateConnection.release).not.toHaveBeenCalled();
      expect(lateConnection.query).not.toHaveBeenCalled();
      expect(api.readinessCheck().status).toBe("fail");
      if (mode === "timeout")
        expect((await api.refreshReadiness()).status).toBe("pass");
      await api.stop();
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("destroys a connection when the driver rejects before the outer deadline", async () => {
    const pool = fakePool();
    const api = apiHarness({ pool });
    expect(await api.start()).toBe(true);
    const connection = {
      query: vi.fn().mockRejectedValue(
        Object.assign(new Error("driver timeout"), {
          code: "PROTOCOL_SEQUENCE_TIMEOUT",
        }),
      ),
      destroy: vi.fn(),
      release: vi.fn(),
    };
    pool.getConnection = vi.fn().mockResolvedValue(connection);
    expect((await api.refreshReadiness()).status).toBe("fail");
    expect(connection.destroy).toHaveBeenCalledOnce();
    expect(connection.release).not.toHaveBeenCalled();
    await api.stop();
  });

  it.each(["startup", "stop"])(
    "bounds %s cleanup even if pool.end never settles",
    async (mode) => {
      vi.useFakeTimers();
      const pool = fakePool();
      const api = apiHarness({ pool });
      if (mode === "startup")
        pool.query = vi.fn().mockRejectedValue(new Error("unavailable"));
      else expect(await api.start()).toBe(true);
      pool.end = vi.fn(() => new Promise(() => {}));
      const result =
        mode === "startup"
          ? expect(api.start()).resolves.toBe(false)
          : expect(api.stop()).rejects.toThrow(
              "AFFILIATES_RUNTIME_STOP_TIMEOUT",
            );
      await vi.advanceTimersByTimeAsync(1500);
      await result;
      expect(api.readinessCheck().status).toBe("fail");
      expect(pool.end).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
      await api.stop();
    },
  );

  it("rejects an external schema missing the referral outbox table", async () => {
    vi.stubEnv("MORRO_DATABASE_SCHEMA_MODE", "external");
    const pool = fakePool();
    pool.query = vi.fn(async ({ sql }) => {
      if (sql.includes("affiliate_outbox_events"))
        throw new Error("missing outbox");
      return [[], []];
    });
    const api = apiHarness({ pool });
    expect(await api.start()).toBe(false);
    expect(api.readinessCheck()).toEqual({
      status: "fail",
      critical: true,
      detail: "AFFILIATES_RUNTIME_UNAVAILABLE",
    });
    await api.stop();
  });

  it("clears the readiness deadline on stop even if the driver never settles", async () => {
    vi.useFakeTimers();
    const pool = fakePool();
    pool.query = vi.fn().mockResolvedValue([[], []]);
    const api = apiHarness({ pool });
    expect(await api.start()).toBe(true);
    pool.query.mockImplementationOnce(() => new Promise(() => {}));
    const pending = api.refreshReadiness();
    await Promise.resolve();
    await api.stop();
    expect((await pending).detail).toBe("AFFILIATES_RUNTIME_NOT_STARTED");
    expect(vi.getTimerCount()).toBe(0);
  });
});

// The real driver talks to a synthetic loopback protocol server. This proves
// driver resource cleanup, not SQL/schema semantics or a deployed database.
async function driverResourceHarness({ stallStartup = false } = {}) {
  const server = mysql.createServer();
  const connections = new Set();
  const pendingQueries = new Set();
  let queryCount = 0;
  let stall = stallStartup;
  server.on("connection", (connection) => {
    connections.add(connection);
    connection.on("error", () => {});
    connection.stream.on("close", () => {
      connections.delete(connection);
      pendingQueries.delete(connection);
    });
    connection.serverHandshake({
      protocolVersion: 10,
      serverVersion: "8.0.0-synthetic-readiness-test",
      connectionId: connections.size,
      statusFlags: 2,
      characterSet: 45,
      capabilityFlags: 0x00000200 | 0x00008000 | 0x00000001 | 0x00000004,
      authCallback: (_auth, complete) => {
        complete(null);
        connection._resetSequenceId();
      },
    });
    connection.on("query", () => {
      queryCount += 1;
      if (stall) pendingQueries.add(connection);
      else connection.writeOk();
      connection._resetSequenceId();
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const pool = mysql
    .createPool({
      host: "127.0.0.1",
      port: server._server.address().port,
      user: "synthetic-readiness",
      password: "",
      connectionLimit: 3,
      waitForConnections: true,
    })
    .promise();
  const api = apiHarness({ pool });
  return {
    api,
    pool,
    stall: (value) => {
      stall = value;
    },
    queries: () => queryCount,
    pending: () => pendingQueries.size,
    close: async () => {
      for (const connection of connections) connection.stream.destroy();
      await api.stop().catch(() => undefined);
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

describe("readiness driver resources with a synthetic protocol server", () => {
  it("closes the timed-out connection before allowing a fresh probe and recovers", async () => {
    const harness = await driverResourceHarness();
    try {
      expect(await harness.api.start()).toBe(true);
      harness.stall(true);
      const probes = Array.from({ length: 10 }, () =>
        harness.api.refreshReadiness(),
      );
      expect(
        (await Promise.all(probes)).every((result) => result.status === "fail"),
      ).toBe(true);
      expect(harness.queries()).toBe(2);
      await vi.waitFor(() => expect(harness.pending()).toBe(0), {
        timeout: 500,
      });
      expect(harness.pool.pool._allConnections.length).toBe(0);
      harness.stall(false);
      expect((await harness.api.refreshReadiness()).status).toBe("pass");
      expect(harness.queries()).toBe(3);
      expect(harness.pool.pool._freeConnections.length).toBe(1);
    } finally {
      await harness.close();
    }
  });

  it("bounds startup cleanup when the server retains the first probe", async () => {
    const harness = await driverResourceHarness({ stallStartup: true });
    let deadline;
    try {
      const result = await Promise.race([
        harness.api.start(),
        new Promise((resolve) => {
          deadline = setTimeout(() => resolve("STILL_PENDING"), 2500);
        }),
      ]);
      expect(result).toBe(false);
      await vi.waitFor(() => expect(harness.pending()).toBe(0), {
        timeout: 500,
      });
      expect(harness.pool.pool._allConnections.length).toBe(0);
      expect(harness.queries()).toBe(1);
    } finally {
      clearTimeout(deadline);
      await harness.close();
    }
  });

  it("stops without waiting for a retained probe to complete", async () => {
    const harness = await driverResourceHarness();
    let deadline;
    try {
      expect(await harness.api.start()).toBe(true);
      harness.stall(true);
      const pending = harness.api.refreshReadiness();
      await vi.waitFor(() => expect(harness.pending()).toBe(1));
      const result = await Promise.race([
        harness.api.stop().then(() => "STOPPED"),
        new Promise((resolve) => {
          deadline = setTimeout(() => resolve("STILL_PENDING"), 2500);
        }),
      ]);
      expect(result).toBe("STOPPED");
      expect((await pending).detail).toBe("AFFILIATES_RUNTIME_NOT_STARTED");
      await vi.waitFor(() => expect(harness.pending()).toBe(0), {
        timeout: 500,
      });
    } finally {
      clearTimeout(deadline);
      await harness.close();
    }
  });
});
