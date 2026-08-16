import { describe, expect, it } from "vitest";

import { createPlatformHealthSnapshot } from "./health.js";

const FIXED_NOW = "2026-08-16T03:15:00.000Z";
const runtimeOptions = Object.freeze({
  createCorrelationId: () => "corr_platform_health_test",
  now: () => FIXED_NOW,
});

describe("platform health contract", () => {
  it("creates an immutable ready snapshot when critical checks pass", () => {
    const snapshot = createPlatformHealthSnapshot(
      {
        service: "morro-digital-platform",
        destinationId: "morro-de-sao-paulo",
        checks: [
          { name: "module-registry", status: "pass", critical: true },
          { name: "bootstrap", status: "pass", critical: true },
        ],
      },
      runtimeOptions,
    );

    expect(snapshot).toEqual({
      contractVersion: 1,
      service: "morro-digital-platform",
      status: "healthy",
      readiness: "ready",
      checkedAt: FIXED_NOW,
      destinationId: "morro-de-sao-paulo",
      correlationId: "corr_platform_health_test",
      checks: [
        { name: "module-registry", status: "pass", critical: true },
        { name: "bootstrap", status: "pass", critical: true },
      ],
    });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.checks)).toBe(true);
    expect(Object.isFrozen(snapshot.checks[0])).toBe(true);
  });

  it("reports degraded but ready for non-critical degradation", () => {
    const snapshot = createPlatformHealthSnapshot(
      {
        service: "morro-digital-platform",
        destinationId: "morro-de-sao-paulo",
        correlationId: "corr_degraded",
        checks: [
          { name: "bootstrap", status: "pass", critical: true },
          {
            name: "optional-provider",
            status: "fail",
            critical: false,
            detail: "Fallback remains available.",
          },
        ],
      },
      runtimeOptions,
    );

    expect(snapshot.status).toBe("degraded");
    expect(snapshot.readiness).toBe("ready");
    expect(snapshot.correlationId).toBe("corr_degraded");
  });

  it("fails readiness closed when a critical check fails", () => {
    const snapshot = createPlatformHealthSnapshot(
      {
        service: "morro-digital-platform",
        destinationId: "morro-de-sao-paulo",
        checks: [
          { name: "bootstrap", status: "pass", critical: true },
          {
            name: "geospatial-runtime",
            status: "fail",
            critical: true,
            detail: "Provider runtime did not initialize.",
          },
        ],
      },
      runtimeOptions,
    );

    expect(snapshot.status).toBe("unhealthy");
    expect(snapshot.readiness).toBe("not_ready");
  });

  it("rejects empty, duplicate, and forged check states", () => {
    expect(() =>
      createPlatformHealthSnapshot(
        {
          service: "morro-digital-platform",
          destinationId: "morro-de-sao-paulo",
          checks: [],
        },
        runtimeOptions,
      ),
    ).toThrow("at least one check");

    expect(() =>
      createPlatformHealthSnapshot(
        {
          service: "morro-digital-platform",
          destinationId: "morro-de-sao-paulo",
          checks: [
            { name: "bootstrap", status: "pass", critical: true },
            { name: "bootstrap", status: "warn", critical: false },
          ],
        },
        runtimeOptions,
      ),
    ).toThrow("check names must be unique");

    expect(() =>
      createPlatformHealthSnapshot(
        {
          service: "morro-digital-platform",
          destinationId: "morro-de-sao-paulo",
          checks: [
            {
              name: "bootstrap",
              status: "unknown" as "pass",
              critical: true,
            },
          ],
        },
        runtimeOptions,
      ),
    ).toThrow("invalid status");
  });
});
