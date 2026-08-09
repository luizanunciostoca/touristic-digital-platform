import { afterEach, describe, expect, it, vi } from "vitest";

import {
  beginNavigationSession,
  resetNavigationSessionManagerForTests,
} from "./session.js";
import {
  createRouteRecalculationController,
  evaluateRouteRecalculation,
  getRecalculationThresholdMeters,
} from "./recalculation.js";
import type { RouteFeatureCollection } from "./routing.js";

const ROUTE: RouteFeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      geometry: {
        type: "LineString",
        coordinates: [
          [-38.91, -13.38],
          [-38.92, -13.39],
        ],
      },
      properties: {},
    },
  ],
};

afterEach(() => {
  vi.useRealTimers();
  resetNavigationSessionManagerForTests();
});

describe("route recalculation core", () => {
  it("preserves the V1 off-route threshold accuracy*2 + 30m", () => {
    expect(getRecalculationThresholdMeters()).toBe(60);
    expect(getRecalculationThresholdMeters(20)).toBe(70);

    const session = beginNavigationSession();
    expect(
      evaluateRouteRecalculation({
        sessionId: session.id,
        offRouteDistance: 70,
        accuracy: 20,
        speed: 1,
        hasInstructions: true,
      }),
    ).toMatchObject({ eligible: false, reason: "within-route-tolerance" });
    expect(
      evaluateRouteRecalculation({
        sessionId: session.id,
        offRouteDistance: 70.1,
        accuracy: 20,
        speed: 1,
        hasInstructions: true,
      }),
    ).toMatchObject({ eligible: true, reason: "eligible" });
  });

  it("blocks recalculation while stationary, suspended, instruction-less or inactive", () => {
    const session = beginNavigationSession();
    expect(
      evaluateRouteRecalculation({
        sessionId: session.id,
        offRouteDistance: 500,
        speed: 0.49,
        hasInstructions: true,
      }).reason,
    ).toBe("stationary");
    expect(
      evaluateRouteRecalculation({
        sessionId: session.id,
        offRouteDistance: 500,
        speed: 1,
        hasInstructions: true,
        suspended: true,
      }).reason,
    ).toBe("suspended");
    expect(
      evaluateRouteRecalculation({
        sessionId: session.id,
        offRouteDistance: 500,
        speed: 1,
        hasInstructions: false,
      }).reason,
    ).toBe("missing-instructions");
    session.cancel();
    expect(
      evaluateRouteRecalculation({
        sessionId: session.id,
        offRouteDistance: 500,
        speed: 1,
        hasInstructions: true,
      }).reason,
    ).toBe("inactive-session");
  });

  it("preserves the V1 30 second cooldown unless forced", async () => {
    const session = beginNavigationSession();
    let now = 10_000;
    const requestRoute = vi.fn().mockResolvedValue(ROUTE);
    const controller = createRouteRecalculationController({
      sessionId: session.id,
      requestRoute,
      now: () => now,
    });
    const input = {
      start: [-38.91, -13.38] as const,
      end: [-38.92, -13.39] as const,
    };

    await expect(controller.recalculate(input)).resolves.toMatchObject({
      success: true,
      attempts: 1,
    });
    now += 29_999;
    await expect(controller.recalculate(input)).resolves.toMatchObject({
      success: false,
      reason: "cooldown",
      attempts: 0,
    });
    await expect(
      controller.recalculate({ ...input, force: true }),
    ).resolves.toMatchObject({ success: true });
  });

  it("retries three times with V1 backoff 2s then 4s", async () => {
    vi.useFakeTimers();
    const session = beginNavigationSession();
    const requestRoute = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(ROUTE);
    const onRouteAvailable = vi.fn();
    const controller = createRouteRecalculationController({
      sessionId: session.id,
      requestRoute,
      onRouteAvailable,
      now: () => 100_000,
    });

    const pending = controller.recalculate({
      start: [-38.91, -13.38],
      end: [-38.92, -13.39],
    });
    await vi.advanceTimersByTimeAsync(1_999);
    expect(requestRoute).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(requestRoute).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(3_999);
    expect(requestRoute).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);

    await expect(pending).resolves.toMatchObject({
      success: true,
      attempts: 3,
      route: ROUTE,
    });
    expect(onRouteAvailable).toHaveBeenCalledTimes(1);
  });

  it("never applies a successful stale response after session supersession", async () => {
    const session = beginNavigationSession();
    let resolveRoute: ((route: RouteFeatureCollection) => void) | undefined;
    const requestRoute = vi.fn(
      () =>
        new Promise<RouteFeatureCollection>((resolve) => {
          resolveRoute = resolve;
        }),
    );
    const onRouteAvailable = vi.fn();
    const controller = createRouteRecalculationController({
      sessionId: session.id,
      requestRoute,
      onRouteAvailable,
    });

    const pending = controller.recalculate({
      start: [-38.91, -13.38],
      end: [-38.92, -13.39],
    });
    beginNavigationSession();
    resolveRoute?.(ROUTE);

    await expect(pending).resolves.toMatchObject({
      success: false,
      reason: "inactive-session",
      route: null,
    });
    expect(onRouteAvailable).not.toHaveBeenCalled();
  });
});
