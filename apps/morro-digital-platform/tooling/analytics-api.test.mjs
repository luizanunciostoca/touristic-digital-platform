import { describe, expect, it, vi } from "vitest";

import {
  analyticsHttpPath,
  analyticsRateLimitMaxRequests,
  createAnalyticsApi,
} from "./analytics-api.mjs";

function environment(values = {}) {
  return (key) => values[key] ?? "";
}

function responseHarness() {
  const headers = {};
  return {
    headers,
    response: {
      statusCode: 0,
      setHeader(name, value) {
        headers[name] = value;
      },
      end(payload) {
        this.payload = payload;
      },
    },
  };
}

function request(body = "{}", overrides = {}) {
  const chunks = [Buffer.from(body)];
  return {
    method: "POST",
    headers: {
      host: "morro.example",
      origin: "https://morro.example",
      "x-forwarded-proto": "https",
      "content-type": "application/json",
      ...overrides.headers,
    },
    socket: { remoteAddress: "203.0.113.10" },
    async *[Symbol.asyncIterator]() {
      yield* chunks;
    },
    ...overrides,
  };
}

function runtimeHarness() {
  const purgeExpired = vi.fn(async () => 0);
  const transportHandle = vi.fn(async () => ({
    status: 201,
    body: { data: { eventId: "event-001", status: "stored" } },
  }));
  const end = vi.fn(async () => undefined);
  return {
    purgeExpired,
    transportHandle,
    end,
    runtime: {
      createAnalyticsMySqlPool: vi.fn(() => ({ end })),
      applyAnalyticsSchema: vi.fn(async () => undefined),
      createAnalyticsHttpTransport: vi.fn(() => ({
        handle: transportHandle,
      })),
      MySqlAnalyticsEventRepository: class {
        purgeExpired = purgeExpired;
      },
    },
  };
}

describe("Analytics runtime composition", () => {
  it("is healthy but unavailable when the feature is disabled", async () => {
    const api = createAnalyticsApi({
      getEnvironmentValue: environment({
        ANALYTICS_FEATURE_ENABLED: "false",
      }),
    });

    await expect(api.start()).resolves.toBe(true);
    expect(api.readinessCheck()).toEqual({
      status: "pass",
      critical: true,
      detail: "analytics-disabled",
    });

    const { response } = responseHarness();
    await api.handle(request(), response, new URL("https://morro.example" + analyticsHttpPath));
    expect(response.statusCode).toBe(503);
    expect(JSON.parse(response.payload)).toEqual({
      error: "ANALYTICS_FEATURE_DISABLED",
    });
  });

  it("fails readiness when explicitly enabled without durable storage", async () => {
    const api = createAnalyticsApi({
      getEnvironmentValue: environment({
        ANALYTICS_FEATURE_ENABLED: "true",
      }),
    });

    await expect(api.start()).resolves.toBe(false);
    expect(api.readinessCheck()).toEqual({
      status: "fail",
      critical: true,
      detail: "ANALYTICS_UNAVAILABLE",
    });
  });

  it("starts schema, purges retention and forwards only same-origin JSON", async () => {
    const harness = runtimeHarness();
    const api = createAnalyticsApi({
      getEnvironmentValue: environment({
        ANALYTICS_FEATURE_ENABLED: "true",
        ANALYTICS_DATABASE_URL: "mysql://analytics",
        ANALYTICS_RETENTION_DAYS: "90",
      }),
      loadRuntime: async () => harness.runtime,
      now: () => Date.parse("2026-09-20T12:00:00.000Z"),
    });

    await expect(api.start()).resolves.toBe(true);
    expect(harness.purgeExpired).toHaveBeenCalledWith(
      "2026-09-20T12:00:00.000Z",
    );

    const denied = responseHarness();
    await api.handle(
      request("{}", {
        headers: {
          host: "morro.example",
          origin: "https://evil.example",
          "x-forwarded-proto": "https",
          "content-type": "application/json",
        },
      }),
      denied.response,
      new URL("https://morro.example" + analyticsHttpPath),
    );
    expect(denied.response.statusCode).toBe(403);
    expect(harness.transportHandle).not.toHaveBeenCalled();

    const accepted = responseHarness();
    await api.handle(
      request('{"schemaVersion":"1"}'),
      accepted.response,
      new URL("https://morro.example" + analyticsHttpPath),
    );
    expect(accepted.response.statusCode).toBe(201);
    expect(harness.transportHandle).toHaveBeenCalledOnce();

    await api.stop();
    expect(harness.end).toHaveBeenCalledOnce();
  });

  it("rate limits one network subject without persisting its address", async () => {
    const harness = runtimeHarness();
    const api = createAnalyticsApi({
      getEnvironmentValue: environment({
        ANALYTICS_FEATURE_ENABLED: "true",
        ANALYTICS_DATABASE_URL: "mysql://analytics",
      }),
      loadRuntime: async () => harness.runtime,
      now: () => 1_000,
    });
    await api.start();

    let last;
    for (let index = 0; index <= analyticsRateLimitMaxRequests; index += 1) {
      last = responseHarness();
      await api.handle(
        request("{}"),
        last.response,
        new URL("https://morro.example" + analyticsHttpPath),
      );
    }

    expect(last.response.statusCode).toBe(429);
    expect(harness.transportHandle).toHaveBeenCalledTimes(
      analyticsRateLimitMaxRequests,
    );
    await api.stop();
  });
});
