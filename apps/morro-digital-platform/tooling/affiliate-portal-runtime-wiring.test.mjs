import { readFile } from "node:fs/promises";
import { createServer, get } from "node:http";
import { compileFunction } from "node:vm";

import { afterEach, describe, expect, it, vi } from "vitest";
import { createAffiliatesApi } from "./affiliates-api.mjs";
import { createPlatformOperations } from "./platform-operations.mjs";

const devServerUrl = new URL("./dev-server.mjs", import.meta.url);

describe("affiliate commercial portal runtime wiring", () => {
  it("composes the Affiliates API into startup, readiness and request routing", async () => {
    const source = await readFile(devServerUrl, "utf8");

    expect(source).toContain(
      'import { createAffiliatesApi } from "./affiliates-api.mjs";',
    );
    expect(source).toContain(
      "const affiliatesApi = createAffiliatesApi({ authApi, getEnvironmentValue });",
    );
    expect(source).toContain("await affiliatesApi.start();");
    expect(source).not.toContain("affiliatesRuntimeReady");
    expect(source).toContain("await serveReadiness(response, correlationId);");
    expect(source).toContain('name: "affiliates-commercial-runtime"');
    expect(source).toContain("if (affiliatesApi.matches(requestUrl.pathname))");
    expect(source).toContain(
      "await affiliatesApi.handle(request, response, requestUrl);",
    );
  });
});

// Exercise the host's actual readiness function and check composition with the
// real platform aggregator over loopback HTTP. SQL and auth are test doubles;
// this is not full host startup, database integration or staging evidence.
async function readinessHarness(environment = {}) {
  const pool = {
    query: vi.fn().mockResolvedValue([[], []]),
    end: vi.fn().mockResolvedValue(undefined),
    async getConnection() {
      return {
        query: (...args) => this.query(...args),
        release() {},
        destroy() {},
      };
    },
  };
  const values = {
    NODE_ENV: "test",
    AFFILIATES_RUNTIME_ENABLED: "true",
    AFFILIATE_DESTINATION_ID: "morro-de-sao-paulo",
    AFFILIATE_REFERRAL_SECRET:
      "test-only-readiness-secret-at-least-32-characters",
    AFFILIATE_PUBLIC_ORIGIN: "https://morro.example",
    ...environment,
  };
  const affiliatesApi = createAffiliatesApi({
    authApi: {
      resolveSession: async () => null,
      authorizeMutation: () => ({ allowed: false }),
    },
    getEnvironmentValue: (key) => values[key] ?? "",
    runtimeDependencies: {
      createPool: () => pool,
      applySchema: async () => {},
      applyIdentitySchema: async () => {},
      createApplication: () => ({}),
    },
  });
  const source = await readFile(devServerUrl, "utf8");
  const checkSource = source.match(
    /\{\s*name: "affiliates-commercial-runtime",[\s\S]*?\n\s*\}/u,
  )?.[0];
  const handlerSource = source.match(
    /async function serveReadiness\(response, correlationId\) \{[\s\S]*?\n\}/u,
  )?.[0];
  expect(checkSource).toBeTruthy();
  expect(handlerSource).toBeTruthy();
  const check = compileFunction(`return (${checkSource});`, ["affiliatesApi"]);
  const operations = createPlatformOperations({
    getEnvironmentValue: (key) => (key === "NODE_ENV" ? "test" : ""),
    additionalReadinessChecks: () => [check(affiliatesApi)],
    sink: () => {},
  });
  operations.setListening(true);
  const serveReadiness = compileFunction(`return (${handlerSource});`, [
    "affiliatesApi",
    "platformOperations",
  ])(affiliatesApi, operations);
  const server = createServer(async (_request, response) => {
    await serveReadiness(response, "corr_readiness_test");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    api: affiliatesApi,
    pool,
    operations,
    request: () =>
      new Promise((resolve, reject) => {
        get(`http://127.0.0.1:${server.address().port}/readyz`, (response) => {
          let body = "";
          response.setEncoding("utf8");
          response.on("data", (chunk) => {
            body += chunk;
          });
          response.on("end", () =>
            resolve({
              status: response.statusCode,
              headers: response.headers,
              body: JSON.parse(body),
            }),
          );
          response.on("error", reject);
        }).on("error", reject);
      }),
    stop: async () => {
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      await affiliatesApi.stop();
    },
  };
}

describe("host readiness behavior with SQL doubles", () => {
  it("returns 503 before startup and on database failure, then 200 after recovery", async () => {
    const harness = await readinessHarness();
    try {
      const before = await harness.request();
      expect(before.status).toBe(503);
      expect(before.body.readiness).toBe("not_ready");
      expect(await harness.api.start()).toBe(true);
      const healthy = await harness.request();
      expect(healthy.status).toBe(200);
      expect(healthy.headers["cache-control"]).toBe("no-store");
      expect(healthy.body.readiness).toBe("ready");
      harness.pool.query.mockRejectedValueOnce(
        new Error("private-dsn-and-secret"),
      );
      const failed = await harness.request();
      expect(failed.status).toBe(503);
      expect(failed.body.readiness).toBe("not_ready");
      expect(failed.body.checks).toContainEqual({
        name: "affiliates-commercial-runtime",
        status: "fail",
        critical: true,
        detail: "AFFILIATES_RUNTIME_UNAVAILABLE",
      });
      expect(JSON.stringify(failed.body)).not.toContain(
        "private-dsn-and-secret",
      );
      expect((await harness.request()).status).toBe(200);
      harness.operations.beginShutdown("SIGTERM");
      expect((await harness.request()).status).toBe(503);
    } finally {
      await harness.stop();
    }
  });

  it("keeps a disabled runtime noncritical without querying SQL", async () => {
    const harness = await readinessHarness({
      AFFILIATES_RUNTIME_ENABLED: "false",
    });
    try {
      expect(await harness.api.start()).toBe(true);
      const response = await harness.request();
      expect(response.status).toBe(200);
      expect(response.body.checks).toContainEqual({
        name: "affiliates-commercial-runtime",
        status: "pass",
        critical: false,
        detail: "disabled-by-configuration",
      });
      expect(harness.pool.query).not.toHaveBeenCalled();
    } finally {
      await harness.stop();
    }
  });

  it("publishes an allowlisted configuration failure as critical 503", async () => {
    const harness = await readinessHarness({
      AFFILIATE_REFERRAL_SECRET: "short",
    });
    try {
      expect(await harness.api.start()).toBe(false);
      const response = await harness.request();
      expect(response.status).toBe(503);
      expect(response.body.checks).toContainEqual({
        name: "affiliates-commercial-runtime",
        status: "fail",
        critical: true,
        detail: "AFFILIATE_REFERRAL_SECRET_INVALID",
      });
      expect(harness.pool.query).not.toHaveBeenCalled();
    } finally {
      await harness.stop();
    }
  });
});

// Execute the actual host shutdown with the real Affiliates API. Pool resources,
// other runtimes and the HTTP drain are doubles; this is not database or full
// host integration proof. Assertions precede any test cleanup of the API.
async function shutdownHarness() {
  const liveConnections = new Set();
  const connections = [];
  const pool = {
    query: vi.fn().mockResolvedValue([[], []]),
    end: vi.fn(async () => {
      liveConnections.clear();
    }),
    async getConnection() {
      const connection = {
        query: (...args) => pool.query(...args),
        release: vi.fn(),
        destroy: vi.fn(() => liveConnections.delete(connection)),
      };
      connections.push(connection);
      liveConnections.add(connection);
      return connection;
    },
  };
  const values = {
    NODE_ENV: "test",
    AFFILIATES_RUNTIME_ENABLED: "true",
    AFFILIATE_DESTINATION_ID: "morro-de-sao-paulo",
    AFFILIATE_REFERRAL_SECRET:
      "test-only-shutdown-secret-at-least-32-characters",
    AFFILIATE_PUBLIC_ORIGIN: "https://morro.example",
  };
  const api = createAffiliatesApi({
    authApi: {
      resolveSession: async () => null,
      authorizeMutation: () => ({ allowed: false }),
    },
    getEnvironmentValue: (key) => values[key] ?? "",
    runtimeDependencies: {
      createPool: () => pool,
      applySchema: async () => {},
      applyIdentitySchema: async () => {},
      createApplication: () => ({}),
    },
  });
  const source = await readFile(devServerUrl, "utf8");
  const shutdownSource = source.match(
    /async function shutdown\(signal\) \{[\s\S]*?\n\}/u,
  )?.[0];
  expect(shutdownSource).toBeTruthy();
  const scope = {
    affiliatesApi: { stop: vi.fn(() => api.stop()) },
    platformOperations: {
      correlationIdFromRequest: () => "corr_shutdown_test",
      beginShutdown: vi.fn(),
      shutdownReadinessDelayMs: 0,
      shutdownDrainTimeoutMs: 100,
      emit: vi.fn(),
      setListening: vi.fn(),
    },
    delay: async () => {},
    openSockets: new Set(),
    closeServerWithin: vi.fn().mockResolvedValue(undefined),
    safeProviderError: () => "test-provider-error",
    process: { exitCode: null },
  };
  for (const name of [
    "analyticsApi",
    "notificationsRuntime",
    "adminApi",
    "adminAuditRuntime",
    "authApi",
    "crmApi",
    "paymentsApi",
    "affiliateAdminRuntime",
    "ticketingApi",
    "commerceApi",
    "contentAdminRuntime",
    "placePlatformRuntime",
    "destinationRuntime",
  ])
    scope[name] = { stop: vi.fn().mockResolvedValue(undefined) };
  const shutdown = compileFunction(
    `let shuttingDown = false; let paymentsRuntimeReady = true;
     let ticketingRuntimeReady = true; return (${shutdownSource});`,
    Object.keys(scope),
  )(...Object.values(scope));
  return { api, pool, liveConnections, connections, scope, shutdown };
}

describe("host shutdown behavior with SQL doubles", () => {
  afterEach(() => vi.useRealTimers());

  it("closes an idle affiliate pool and does not stop it twice", async () => {
    const harness = await shutdownHarness();
    try {
      expect(await harness.api.start()).toBe(true);
      expect(harness.liveConnections.size).toBe(1);
      expect(harness.connections[0].release).toHaveBeenCalledOnce();
      await harness.shutdown("SIGTERM");
      expect(harness.scope.affiliatesApi.stop).toHaveBeenCalledOnce();
      expect(harness.pool.end).toHaveBeenCalledOnce();
      expect(harness.liveConnections.size).toBe(0);
      expect(harness.api.readinessCheck().detail).toBe(
        "AFFILIATES_RUNTIME_NOT_STARTED",
      );
      expect(harness.scope.process.exitCode).toBe(0);
      await harness.shutdown("SIGINT");
      expect(harness.scope.affiliatesApi.stop).toHaveBeenCalledOnce();
    } finally {
      await harness.api.stop();
    }
  });

  it("cancels a pending affiliate probe and ignores its completion after host shutdown", async () => {
    vi.useFakeTimers();
    const harness = await shutdownHarness();
    expect(await harness.api.start()).toBe(true);
    let complete;
    harness.pool.query.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const pending = harness.api.refreshReadiness();
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.pool.query).toHaveBeenCalledTimes(2);
    await harness.shutdown("SIGTERM");
    expect(harness.scope.affiliatesApi.stop).toHaveBeenCalledOnce();
    expect(harness.connections[1].destroy).toHaveBeenCalledOnce();
    expect(harness.liveConnections.size).toBe(0);
    expect((await pending).detail).toBe("AFFILIATES_RUNTIME_NOT_STARTED");
    complete([[], []]);
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.api.readinessCheck().detail).toBe(
      "AFFILIATES_RUNTIME_NOT_STARTED",
    );
    expect(harness.scope.process.exitCode).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("counts bounded affiliate cleanup failure and exits unsuccessfully", async () => {
    vi.useFakeTimers();
    const harness = await shutdownHarness();
    expect(await harness.api.start()).toBe(true);
    harness.pool.end.mockImplementationOnce(() => new Promise(() => {}));
    const stopped = harness.shutdown("SIGTERM");
    await vi.advanceTimersByTimeAsync(1500);
    await stopped;
    expect(harness.scope.affiliatesApi.stop).toHaveBeenCalledOnce();
    expect(harness.pool.end).toHaveBeenCalledOnce();
    expect(harness.liveConnections.size).toBe(1);
    expect(harness.scope.process.exitCode).toBe(1);
    for (const runtime of Object.values(harness.scope))
      if (runtime?.stop) expect(runtime.stop).toHaveBeenCalledOnce();
    expect(harness.scope.platformOperations.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "platform.shutdown.runtime_stop_failed",
        severity: "error",
        attributes: { failedRuntimes: 1 },
      }),
    );
    expect(harness.scope.platformOperations.setListening).toHaveBeenCalledWith(
      false,
      "corr_shutdown_test",
    );
    expect(harness.api.readinessCheck().detail).toBe(
      "AFFILIATES_RUNTIME_NOT_STARTED",
    );
    expect(vi.getTimerCount()).toBe(0);
  });
});
