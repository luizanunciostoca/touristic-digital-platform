import { describe, expect, it, vi } from "vitest";

import type { RouteFeatureCollection } from "@touristic/navigation";

import type { NavigationDomEventBridge } from "./navigation-dom-events.js";
import type { NavigationSessionBootstrap } from "./navigation-session-bootstrap.js";
import { createNavigationDomLifecycle } from "./navigation-dom-lifecycle.js";

function routeData(): RouteFeatureCollection {
  return {
    type: "FeatureCollection",
    features: [
      {
        geometry: {
          type: "LineString",
          coordinates: [
            [-38.917, -13.376],
            [-38.916, -13.375],
          ],
        },
      },
    ],
  };
}

function setup(
  options: {
    failStart?: boolean;
    start?: NavigationSessionBootstrap["start"];
  } = {},
) {
  const records: Array<{ type: string; detail: unknown }> = [];
  const bridge: NavigationDomEventBridge = {
    started(detail) {
      records.push({ type: "navigationStarted", detail });
    },
    status(input) {
      const detail = {
        phase: input.phase ?? "idle",
        hasRoute: input.hasRoute === true,
        hasInstructions: input.hasInstructions === true,
        hasUserLocation: input.hasUserLocation === true,
        isActive: input.isActive === true,
        isPaused: input.isPaused === true,
        currentStepIndex: input.currentStepIndex ?? 0,
        totalSteps: input.totalSteps ?? 0,
        routeDistance: input.routeDistance ?? 0,
        routeDuration: input.routeDuration ?? 0,
        routeProgress: input.routeProgress ?? 0,
        navigationSessionId: input.navigationSessionId ?? null,
        recalculations: input.recalculations ?? 0,
        destination: input.destination ?? "",
        timestamp: input.timestamp ?? 0,
      };
      records.push({ type: "navigationStatusChanged", detail });
      return detail;
    },
    location: vi.fn(),
    runtime: vi.fn(),
    ended(detail) {
      records.push({ type: "navigationEnded", detail });
    },
    getLastStatus: () => null,
  };

  const bootstrap: NavigationSessionBootstrap = {
    start:
      options.start ??
      (options.failStart
        ? vi.fn(async () => {
            throw new Error("route failed");
          })
        : vi.fn(async () => routeData())),
    stop: vi.fn(),
    isActive: () => false,
    getActiveSessionId: () => 7,
  };

  const lifecycle = createNavigationDomLifecycle({
    document: {
      body: { classList: { add() {}, remove() {} } },
      getElementById: () => null,
    } as unknown as Document,
    bootstrap,
    eventBridge: bridge,
  });

  return { lifecycle, records };
}

function compact(records: Array<{ type: string; detail: unknown }>) {
  return records.map(({ type, detail }) => ({
    type,
    ...(type === "navigationStatusChanged"
      ? {
          phase: (detail as { phase: string }).phase,
          isActive: (detail as { isActive: boolean }).isActive,
          hasRoute: (detail as { hasRoute: boolean }).hasRoute,
          sessionId: (detail as { navigationSessionId: number | null })
            .navigationSessionId,
        }
      : type === "navigationEnded"
        ? { reason: (detail as { reason: string }).reason }
        : { sessionId: (detail as { sessionId: number }).sessionId }),
  }));
}

describe("navigation V1 event/state snapshot", () => {
  it("freezes start -> active -> manual end sequence", async () => {
    const context = setup();

    await context.lifecycle.start({ longitude: -38.916, latitude: -13.375 });
    context.lifecycle.stop("cancelled");

    expect(compact(context.records)).toEqual([
      { type: "navigationStarted", sessionId: 7 },
      {
        type: "navigationStatusChanged",
        phase: "active",
        isActive: true,
        hasRoute: true,
        sessionId: 7,
      },
      { type: "navigationEnded", reason: "cancelled" },
      {
        type: "navigationStatusChanged",
        phase: "ended",
        isActive: false,
        hasRoute: false,
        sessionId: null,
      },
    ]);
  });

  it("freezes arrival sequence", async () => {
    const context = setup();

    await context.lifecycle.start({ longitude: -38.916, latitude: -13.375 });
    context.lifecycle.stop("arrived");

    expect(compact(context.records).slice(-2)).toEqual([
      { type: "navigationEnded", reason: "arrived" },
      {
        type: "navigationStatusChanged",
        phase: "arrived",
        isActive: false,
        hasRoute: false,
        sessionId: null,
      },
    ]);
  });

  it("freezes bootstrap error as an observable failed state", async () => {
    const context = setup({ failStart: true });

    await expect(
      context.lifecycle.start({ longitude: -38.916, latitude: -13.375 }),
    ).rejects.toThrow("route failed");

    expect(compact(context.records)).toEqual([
      {
        type: "navigationStatusChanged",
        phase: "failed",
        isActive: false,
        hasRoute: false,
        sessionId: null,
      },
    ]);
  });

  it("does not publish failed state from a bootstrap rejected after stop", async () => {
    let rejectStart!: (reason: Error) => void;
    const pendingStart = new Promise<RouteFeatureCollection>(
      (_resolve, reject) => {
        rejectStart = reject;
      },
    );
    const context = setup({ start: vi.fn(() => pendingStart) });

    const startPromise = context.lifecycle.start({
      longitude: -38.916,
      latitude: -13.375,
    });
    context.lifecycle.stop("cancelled");
    rejectStart(new Error("late route failed"));

    await expect(startPromise).rejects.toThrow("late route failed");
    expect(compact(context.records)).toEqual([]);
  });
});
