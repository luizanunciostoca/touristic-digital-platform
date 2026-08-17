import { describe, expect, it } from "vitest";

import { createPlatformOperations } from "./platform-operations.mjs";

function environment(values = {}) {
  return (key) => values[key] ?? "";
}

function responseCapture(initialHeaders = {}) {
  const headers = new Map(
    Object.entries(initialHeaders).map(([name, value]) => [
      name.toLowerCase(),
      String(value),
    ]),
  );
  return {
    setHeader(name, value) {
      headers.set(name.toLowerCase(), String(value));
    },
    getHeader(name) {
      return headers.get(name.toLowerCase());
    },
    header(name) {
      return headers.get(name.toLowerCase());
    },
  };
}

describe("Platform production operations", () => {
  it("transitions canonical readiness from startup to ready to shutdown", () => {
    const operations = createPlatformOperations({
      additionalReadinessChecks: () => [
        {
          name: "auth-security-state",
          status: "pass",
          critical: true,
          detail: "shared-durable",
        },
      ],
      sink: () => undefined,
    });

    expect(operations.healthSnapshot("corr_startup").readiness).toBe(
      "not_ready",
    );

    operations.setListening(true, "corr_started");
    const ready = operations.healthSnapshot("corr_ready");
    expect(ready.status).toBe("healthy");
    expect(ready.readiness).toBe("ready");
    expect(ready.checks).toContainEqual({
      name: "auth-security-state",
      status: "pass",
      critical: true,
      detail: "shared-durable",
    });

    expect(operations.beginShutdown("SIGTERM", "corr_shutdown")).toBe(true);
    expect(operations.beginShutdown("SIGTERM", "corr_duplicate")).toBe(false);
    const draining = operations.healthSnapshot("corr_draining");
    expect(draining.status).toBe("unhealthy");
    expect(draining.readiness).toBe("not_ready");
  });

  it("keeps degraded providers visible without making optional providers critical", () => {
    const records = [];
    const operations = createPlatformOperations({ sink: (record) => records.push(record) });
    operations.setListening(true, "corr_started");
    records.length = 0;

    operations.providerDegraded(
      "weather-open-meteo",
      "upstream timeout",
      "corr_weather",
    );
    operations.providerDegraded(
      "weather-open-meteo",
      "upstream timeout",
      "corr_weather_duplicate",
    );

    const degraded = operations.healthSnapshot("corr_degraded");
    expect(degraded.status).toBe("degraded");
    expect(degraded.readiness).toBe("ready");
    expect(records).toHaveLength(1);
    expect(records[0].observation.name).toBe("platform.provider.degraded");

    operations.providerRecovered("weather-open-meteo", "corr_recovered");
    operations.providerRecovered("weather-open-meteo", "corr_duplicate");
    expect(records).toHaveLength(2);
    expect(records[1].observation.name).toBe("platform.provider.recovered");
  });

  it("accepts only bounded correlation IDs and generates a safe fallback", () => {
    const operations = createPlatformOperations({ sink: () => undefined });

    expect(
      operations.correlationIdFromRequest({
        headers: { "x-correlation-id": "request_ABC-123.trace" },
      }),
    ).toBe("request_ABC-123.trace");

    const generated = operations.correlationIdFromRequest({
      headers: { "x-correlation-id": "invalid correlation id with spaces" },
    });
    expect(generated).toMatch(/^corr_[0-9a-f-]{36}$/u);
  });

  it("binds immutable release identity, correlation ID and approved import-map hashes", () => {
    const operations = createPlatformOperations({
      getEnvironmentValue: environment({
        MORRO_RELEASE_SHA: "abc123",
        MORRO_RELEASE_VERSION: "2.0.0",
        MORRO_DEPLOYMENT_ID: "deploy-42",
      }),
      sink: () => undefined,
    });
    const response = responseCapture({
      "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline'",
    });

    operations.bindResponse(response, "corr_release");

    expect(response.header("x-correlation-id")).toBe("corr_release");
    expect(response.header("x-release-sha")).toBe("abc123");
    expect(response.header("x-release-version")).toBe("2.0.0");
    expect(response.header("x-deployment-id")).toBe("deploy-42");
    const csp = response.header("content-security-policy");
    expect(csp.match(/'sha256-[^']+'/gu)).toHaveLength(3);
  });

  it("emits explicit rollback identity when a rollback deployment starts", () => {
    const records = [];
    const operations = createPlatformOperations({
      getEnvironmentValue: environment({
        MORRO_RELEASE_SHA: "new-good-sha",
        MORRO_RELEASE_VERSION: "2.0.1",
        MORRO_DEPLOYMENT_ID: "rollback-deploy",
        MORRO_ROLLBACK_FROM_SHA: "bad-sha",
      }),
      sink: (record) => records.push(record),
    });

    operations.setListening(true, "corr_rollback");

    const rollback = records.find(
      (record) => record.observation.name === "platform.release.rollback_activated",
    );
    expect(rollback).toBeDefined();
    expect(rollback.observation.attributes).toMatchObject({
      releaseSha: "new-good-sha",
      deploymentId: "rollback-deploy",
      fromReleaseSha: "bad-sha",
      toReleaseSha: "new-good-sha",
    });
  });
});
