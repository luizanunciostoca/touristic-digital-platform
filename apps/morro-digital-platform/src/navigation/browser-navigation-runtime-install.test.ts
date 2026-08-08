import { describe, expect, it, vi } from "vitest";

import type {
  MapboxGlMapLike,
  MapboxGlModuleLike,
} from "@touristic/geospatial";

import type { NavigationDomEventBridge } from "./navigation-dom-events.js";
import type { NavigationDomLifecycle } from "./navigation-dom-lifecycle.js";
import type { NavigationRequestPort } from "./navigation-request-port.js";
import type {
  NavigationSessionBootstrap,
  NavigationSessionBootstrapOptions,
} from "./navigation-session-bootstrap.js";
import { installBrowserNavigationRuntime } from "./browser-navigation-runtime-install.js";

function eventBridge(): NavigationDomEventBridge {
  return {
    started: vi.fn(),
    status: vi.fn((input) => ({
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
    })),
    location: vi.fn(),
    runtime: vi.fn(),
    ended: vi.fn(),
    getLastStatus: () => null,
  };
}

describe("browser navigation runtime install", () => {
  it("composes bootstrap, event bridge, DOM lifecycle and navigation request port", () => {
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
    const bootstrap = {
      start: vi.fn(),
      stop: vi.fn(),
      isActive: vi.fn(() => false),
      getActiveSessionId: vi.fn(() => null),
    } as unknown as NavigationSessionBootstrap;
    const lifecycleStop = vi.fn<(reason?: string) => void>();
    const lifecycleDestroy = vi.fn<() => void>();
    const lifecycle = {
      start: vi.fn(),
      stop: lifecycleStop,
      destroy: lifecycleDestroy,
      isActive: vi.fn(() => false),
    } as unknown as NavigationDomLifecycle;
    const requestPortDestroy = vi.fn<() => void>();
    const requestPort = {
      destroy: requestPortDestroy,
    } as NavigationRequestPort;
    const bridge = eventBridge();
    const createBootstrap = vi.fn<
      (options: NavigationSessionBootstrapOptions) => NavigationSessionBootstrap
    >(() => bootstrap);
    const createLifecycle = vi.fn(() => lifecycle);
    const createRequestPort = vi.fn(() => requestPort);
    const createEventBridge = vi.fn(() => bridge);

    const installed = installBrowserNavigationRuntime({
      map,
      sdk,
      document,
      createBootstrap,
      createLifecycle,
      createRequestPort,
      createEventBridge,
    });

    expect(createBootstrap).toHaveBeenCalledTimes(1);
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
  });

  it("publishes real location/runtime callbacks with one session context", () => {
    const bridge = eventBridge();
    const bootstrap = {
      start: vi.fn(),
      stop: vi.fn(),
      isActive: vi.fn(() => true),
      getActiveSessionId: vi.fn(() => 9),
    } as unknown as NavigationSessionBootstrap;
    const createBootstrap = vi.fn<
      (options: NavigationSessionBootstrapOptions) => NavigationSessionBootstrap
    >(() => bootstrap);

    installBrowserNavigationRuntime({
      map: { setCenter: vi.fn(), remove: vi.fn() },
      sdk: {
        accessToken: "token",
        Map: vi.fn(),
        Marker: vi.fn(),
      },
      document: {} as Document,
      createBootstrap,
      createLifecycle: vi.fn(
        () =>
          ({
            start: vi.fn(),
            stop: vi.fn(),
            destroy: vi.fn(),
            isActive: vi.fn(() => true),
          }) as unknown as NavigationDomLifecycle,
      ),
      createRequestPort: vi.fn(
        () => ({ destroy: vi.fn() }) as NavigationRequestPort,
      ),
      createEventBridge: vi.fn(() => bridge),
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
    options?.onSnapshot?.(
      {
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
      },
      context,
    );

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

  it("destroys the request port before the lifecycle exactly once", () => {
    const calls: string[] = [];
    const lifecycleDestroy = vi.fn(() => calls.push("lifecycle"));
    const requestPortDestroy = vi.fn(() => calls.push("request-port"));
    const bootstrap = {
      start: vi.fn(),
      stop: vi.fn(),
      isActive: vi.fn(() => false),
      getActiveSessionId: vi.fn(() => null),
    } as unknown as NavigationSessionBootstrap;
    const lifecycle = {
      start: vi.fn(),
      stop: vi.fn(),
      destroy: lifecycleDestroy,
      isActive: vi.fn(() => false),
    } as unknown as NavigationDomLifecycle;
    const requestPort = {
      destroy: requestPortDestroy,
    } as NavigationRequestPort;

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
    });

    installed.destroy();
    installed.destroy();

    expect(requestPortDestroy).toHaveBeenCalledTimes(1);
    expect(lifecycleDestroy).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(["request-port", "lifecycle"]);
  });
});
