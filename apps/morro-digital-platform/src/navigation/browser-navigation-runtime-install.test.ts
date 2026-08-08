import { describe, expect, it, vi } from "vitest";

import type {
  MapboxGlMapLike,
  MapboxGlModuleLike,
} from "@touristic/geospatial";
import {
  createNavigationHealthSnapshot,
  type NavigationRuntimeSnapshot,
} from "@touristic/navigation";

import type { NavigationDomEventBridge } from "./navigation-dom-events.js";
import type { NavigationDomLifecycle } from "./navigation-dom-lifecycle.js";
import type { NavigationGuidanceUi } from "./navigation-guidance-ui.js";
import type { NavigationRequestPort } from "./navigation-request-port.js";
import type {
  NavigationSessionBootstrap,
  NavigationSessionBootstrapOptions,
} from "./navigation-session-bootstrap.js";
import { installBrowserNavigationRuntime } from "./browser-navigation-runtime-install.js";

function eventBridge(): NavigationDomEventBridge {
  return {
    started: vi.fn(),
    status: vi.fn<NavigationDomEventBridge["status"]>((input) =>
      createNavigationHealthSnapshot(input),
    ),
    location: vi.fn(),
    runtime: vi.fn(),
    ended: vi.fn(),
    getLastStatus: () => null,
  };
}

function bootstrapStub(active = false): NavigationSessionBootstrap {
  return {
    start: vi.fn(),
    stop: vi.fn(),
    isActive: vi.fn(() => active),
    getActiveSessionId: vi.fn(() => (active ? 9 : null)),
  };
}

function lifecycleStub(
  overrides: Partial<NavigationDomLifecycle> = {},
): NavigationDomLifecycle {
  return {
    start: vi.fn(),
    stop: vi.fn(),
    destroy: vi.fn(),
    isActive: vi.fn(() => false),
    ...overrides,
  };
}

function requestPortStub(destroy: () => void = vi.fn()): NavigationRequestPort {
  return { destroy };
}

function guidanceUiStub(): NavigationGuidanceUi {
  return {
    start: vi.fn(),
    update: vi.fn(),
    stop: vi.fn(),
    destroy: vi.fn(),
  };
}

function runtimeSnapshot(): NavigationRuntimeSnapshot {
  return {
    routeIdentity: "route-a",
    projectedCoordinate: [-38.917, -13.376],
    segmentIndex: 0,
    offRouteDistance: 2,
    totalDistance: 100,
    totalDuration: 80,
    completedDistance: 20,
    remainingDistance: 80,
    remainingDuration: 64,
    progress: 0.2,
    progressPercent: 20,
    rawBearing: 90,
    bearing: 90,
    distanceToNextManeuver: 30,
    visualLocation: { latitude: -13.376, longitude: -38.917 },
    visualDeadZoneMeters: 2,
    visualHeldByDeadZone: false,
    visualHeldByBackwardGuard: false,
    visualRouteSnapped: true,
    visualIgnoredStaleUpdate: false,
    guidance: {
      instruction: "Continue",
      original: "Continue",
      formattedDistance: "30 m",
      remainingDistance: "80 m",
      estimatedTime: "1 min",
      progress: 20,
      stepIndex: 1,
      totalSteps: 4,
    },
  };
}

describe("browser navigation runtime install", () => {
  it("composes bootstrap, event bridge, guidance UI, DOM lifecycle and request port", () => {
    const map = {
      setCenter: vi.fn(),
      remove: vi.fn(),
    } as MapboxGlMapLike;
    const sdk = {
      accessToken: "token",
      Map: vi.fn(),
      Marker: vi.fn(),
    } as unknown as MapboxGlModuleLike;
    const document = {} as Document;
    const bootstrap = bootstrapStub();
    const lifecycleStop = vi.fn<(reason?: string) => void>();
    const lifecycleDestroy = vi.fn<() => void>();
    const lifecycle = lifecycleStub({
      stop: lifecycleStop,
      destroy: lifecycleDestroy,
    });
    const requestPortDestroy = vi.fn<() => void>();
    const requestPort = requestPortStub(requestPortDestroy);
    const bridge = eventBridge();
    const guidanceUi = guidanceUiStub();
    const createBootstrap = vi.fn<
      (options: NavigationSessionBootstrapOptions) => NavigationSessionBootstrap
    >(() => bootstrap);
    const createLifecycle = vi.fn(() => lifecycle);
    const createRequestPort = vi.fn(() => requestPort);
    const createEventBridge = vi.fn(() => bridge);
    const createGuidanceUi = vi.fn(() => guidanceUi);

    const installed = installBrowserNavigationRuntime({
      map,
      sdk,
      document,
      createBootstrap,
      createLifecycle,
      createRequestPort,
      createEventBridge,
      createGuidanceUi,
    });

    expect(createBootstrap).toHaveBeenCalledTimes(1);
    expect(createGuidanceUi).toHaveBeenCalledWith(document);
    const bootstrapOptions = createBootstrap.mock.calls[0]?.[0];
    expect(bootstrapOptions).toBeDefined();
    expect(bootstrapOptions?.map).toBe(map);
    expect(bootstrapOptions?.sdk).toBe(sdk);
    expect(typeof bootstrapOptions?.onAutoEnd).toBe("function");
    bootstrapOptions?.onAutoEnd?.();
    expect(lifecycleStop).toHaveBeenCalledWith("arrived");
    expect(createLifecycle).toHaveBeenCalledWith({
      document,
      bootstrap,
      eventBridge: bridge,
    });
    expect(createRequestPort).toHaveBeenCalledWith({ document, lifecycle });
    expect(installed.bootstrap).toBe(bootstrap);
    expect(installed.lifecycle).toBe(lifecycle);
    expect(installed.requestPort).toBe(requestPort);
    expect(installed.eventBridge).toBe(bridge);
    expect(installed.guidanceUi).toBe(guidanceUi);
  });

  it("publishes runtime callbacks and updates guidance with the same snapshot", () => {
    const bridge = eventBridge();
    const guidanceUi = guidanceUiStub();
    const bootstrap = bootstrapStub(true);
    const createBootstrap = vi.fn<
      (options: NavigationSessionBootstrapOptions) => NavigationSessionBootstrap
    >(() => bootstrap);
    const lifecycle = lifecycleStub({ isActive: vi.fn(() => true) });
    const requestPort = requestPortStub();

    installBrowserNavigationRuntime({
      map: { setCenter: vi.fn(), remove: vi.fn() },
      sdk: {
        accessToken: "token",
        Map: vi.fn(),
        Marker: vi.fn(),
      },
      document: {} as Document,
      createBootstrap,
      createLifecycle: vi.fn(() => lifecycle),
      createRequestPort: vi.fn(() => requestPort),
      createEventBridge: vi.fn(() => bridge),
      createGuidanceUi: vi.fn(() => guidanceUi),
    });

    const options = createBootstrap.mock.calls[0]?.[0];
    const context = {
      sessionId: 9,
      destination: { longitude: -38.916, latitude: -13.375 },
    };
    options?.onLocation?.(
      {
        latitude: -13.376,
        longitude: -38.917,
        accuracy: 7,
        heading: null,
        speed: 1.2,
        timestamp: 100,
      },
      context,
    );
    const snapshot = runtimeSnapshot();
    options?.onSnapshot?.(snapshot, context);

    expect(guidanceUi.update).toHaveBeenCalledWith(snapshot);
    expect(bridge.location).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 9, speed: 1.2 }),
    );
    expect(bridge.runtime).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 9, routeIdentity: "route-a" }),
    );
    expect(bridge.status).toHaveBeenLastCalledWith(
      expect.objectContaining({
        navigationSessionId: 9,
        hasInstructions: true,
        totalSteps: 4,
        currentStepIndex: 1,
        routeProgress: 0.2,
      }),
    );
  });

  it("destroys request port, lifecycle and guidance UI exactly once", () => {
    const calls: string[] = [];
    const lifecycleDestroy = vi.fn(() => calls.push("lifecycle"));
    const requestPortDestroy = vi.fn(() => calls.push("request-port"));
    const guidanceDestroy = vi.fn(() => calls.push("guidance-ui"));
    const bootstrap = bootstrapStub();
    const lifecycle = lifecycleStub({ destroy: lifecycleDestroy });
    const requestPort = requestPortStub(requestPortDestroy);
    const guidanceUi = guidanceUiStub();
    guidanceUi.destroy = guidanceDestroy;

    const installed = installBrowserNavigationRuntime({
      map: { setCenter: vi.fn(), remove: vi.fn() },
      sdk: {
        accessToken: "token",
        Map: vi.fn(),
        Marker: vi.fn(),
      },
      document: {} as Document,
      createBootstrap: vi.fn(() => bootstrap),
      createLifecycle: vi.fn(() => lifecycle),
      createRequestPort: vi.fn(() => requestPort),
      createEventBridge: vi.fn(() => eventBridge()),
      createGuidanceUi: vi.fn(() => guidanceUi),
    });

    installed.destroy();
    installed.destroy();

    expect(requestPortDestroy).toHaveBeenCalledTimes(1);
    expect(lifecycleDestroy).toHaveBeenCalledTimes(1);
    expect(guidanceDestroy).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(["request-port", "lifecycle", "guidance-ui"]);
  });
});
