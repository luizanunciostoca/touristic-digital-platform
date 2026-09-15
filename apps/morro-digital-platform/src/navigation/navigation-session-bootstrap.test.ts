import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  MapboxGlMapLike,
  MapboxGlModuleLike,
} from "@touristic/geospatial";
import {
  resetNavigationSessionManagerForTests,
  type RouteCoordinate,
  type RouteFeatureCollection,
} from "@touristic/navigation";

import {
  clearRecentBrowserLocation,
  rememberBrowserLocation,
  type BrowserGeolocationDriver,
} from "./browser-geolocation.js";
import type {
  BrowserNavigationWiring,
  BrowserNavigationWiringOptions,
} from "./browser-navigation-wiring.js";
import {
  NAVIGATION_BOOTSTRAP_ATTEMPT_TIMEOUTS_MS,
  NAVIGATION_RECALCULATION_SUPPRESSION_MS,
  NAVIGATION_ROUTE_TIMEOUT_MS,
  NAVIGATION_TUTORIAL_RECALCULATION_SUPPRESSION_MS,
  createNavigationSessionBootstrap,
  type NavigationSessionEventContext,
} from "./navigation-session-bootstrap.js";

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
        properties: { distance: 100, duration: 80 },
      },
    ],
  };
}

function setup(onArrival?: (context: NavigationSessionEventContext) => void) {
  const map: MapboxGlMapLike = { setCenter: vi.fn(), remove: vi.fn() };
  const sdk = {
    accessToken: "token",
    Map: vi.fn(),
    Marker: vi.fn(),
  } as unknown as MapboxGlModuleLike;
  const geolocationDriver = {
    watchPosition: vi.fn(),
    getCurrentPosition: vi.fn(),
    clearWatch: vi.fn(),
  } as unknown as BrowserGeolocationDriver;
  const wiringStart = vi.fn<() => void>();
  const wiringStop = vi.fn<() => void>();
  const wiring: BrowserNavigationWiring = {
    composition: {} as BrowserNavigationWiring["composition"],
    start: wiringStart,
    stop: wiringStop,
  };
  const createWiring = vi.fn<
    (options: BrowserNavigationWiringOptions) => BrowserNavigationWiring
  >(() => wiring);
  const requestRouteImpl = vi.fn(async () => routeData());
  const resolveStartCoordinate = vi.fn<
    (signal: AbortSignal) => Promise<RouteCoordinate>
  >(async (signal) => {
    void signal;
    return [-38.917, -13.376];
  });

  const bootstrap = createNavigationSessionBootstrap({
    map,
    sdk,
    geolocationDriver,
    resolveStartCoordinate,
    requestRouteImpl,
    createWiring,
    ...(onArrival ? { onArrival } : {}),
  });

  return {
    bootstrap,
    map,
    sdk,
    geolocationDriver,
    createWiring,
    requestRouteImpl,
    resolveStartCoordinate,
    wiringStart,
    wiringStop,
  };
}

function browserPosition(
  longitude = -38.917,
  latitude = -13.376,
  accuracy = 8,
): GeolocationPosition {
  return {
    coords: {
      longitude,
      latitude,
      accuracy,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: 1,
      toJSON: () => ({}),
    },
    timestamp: Date.now(),
    toJSON: () => ({}),
  } as GeolocationPosition;
}

function setupBrowserAcquisition() {
  const map: MapboxGlMapLike = { setCenter: vi.fn(), remove: vi.fn() };
  const sdk = {
    accessToken: "token",
    Map: vi.fn(),
    Marker: vi.fn(),
  } as unknown as MapboxGlModuleLike;
  const geolocationDriver = {
    watchPosition: vi.fn(),
    getCurrentPosition: vi.fn(),
    clearWatch: vi.fn(),
  } as unknown as BrowserGeolocationDriver;
  const wiring: BrowserNavigationWiring = {
    composition: {} as BrowserNavigationWiring["composition"],
    start: vi.fn(),
    stop: vi.fn(),
  };
  const createWiring = vi.fn<
    (options: BrowserNavigationWiringOptions) => BrowserNavigationWiring
  >(() => wiring);
  const requestRouteImpl = vi.fn(async () => routeData());
  const bootstrap = createNavigationSessionBootstrap({
    map,
    sdk,
    geolocationDriver,
    requestRouteImpl,
    createWiring,
  });
  return {
    bootstrap,
    geolocationDriver,
    requestRouteImpl,
    createWiring,
  };
}

afterEach(() => {
  clearRecentBrowserLocation();
  resetNavigationSessionManagerForTests();
});

describe("navigation session bootstrap", () => {
  it("resolves one start location, requests route and starts concrete wiring", async () => {
    const context = setup();
    const result = await context.bootstrap.start({
      longitude: -38.916,
      latitude: -13.375,
    });

    expect(result).toEqual(routeData());
    expect(context.resolveStartCoordinate).toHaveBeenCalledTimes(1);
    expect(context.requestRouteImpl).toHaveBeenCalledWith(
      expect.objectContaining({
        start: [-38.917, -13.376],
        end: [-38.916, -13.375],
        language: "pt",
        timeoutMs: NAVIGATION_ROUTE_TIMEOUT_MS,
      }),
    );
    expect(context.createWiring).toHaveBeenCalledTimes(1);
    const wiringOptions = context.createWiring.mock.calls[0]?.[0];
    expect(wiringOptions).toBeDefined();
    expect(wiringOptions?.map).toBe(context.map);
    expect(wiringOptions?.sdk).toBe(context.sdk);
    expect(wiringOptions?.routeData).toBe(result);
    expect(wiringOptions?.geolocationDriver).toBe(context.geolocationDriver);
    expect(wiringOptions?.destination).toEqual({
      longitude: -38.916,
      latitude: -13.375,
    });
    expect(wiringOptions?.recalculationSuppressionMs).toBe(
      NAVIGATION_RECALCULATION_SUPPRESSION_MS,
    );
    expect(typeof wiringOptions?.sessionId).toBe("number");
    expect(typeof wiringOptions?.requestRecalculationRoute).toBe("function");
    expect(context.wiringStart).toHaveBeenCalledTimes(1);
    expect(context.bootstrap.isActive()).toBe(true);
  });

  it("uses the V1 tutorial recalculation suppression window", async () => {
    const context = setup();
    await context.bootstrap.start(
      { longitude: -38.916, latitude: -13.375 },
      { tutorial: true },
    );

    expect(
      context.createWiring.mock.calls[0]?.[0].recalculationSuppressionMs,
    ).toBe(NAVIGATION_TUTORIAL_RECALCULATION_SUPPRESSION_MS);
  });

  it("reuses the active routing provider for recalculation requests", async () => {
    const context = setup();
    await context.bootstrap.start({ longitude: -38.916, latitude: -13.375 });
    const wiringOptions = context.createWiring.mock.calls[0]?.[0];
    const signal = new AbortController().signal;

    await expect(
      wiringOptions?.requestRecalculationRoute?.({
        start: [-38.918, -13.377],
        end: [-38.916, -13.375],
        signal,
        attempt: 1,
      }),
    ).resolves.toEqual(routeData());

    expect(context.requestRouteImpl).toHaveBeenCalledTimes(2);
    expect(context.requestRouteImpl).toHaveBeenLastCalledWith(
      expect.objectContaining({
        start: [-38.918, -13.377],
        end: [-38.916, -13.375],
        language: "pt",
        timeoutMs: NAVIGATION_ROUTE_TIMEOUT_MS,
        signal,
      }),
    );
  });

  it("retries initial GPS acquisition with the V1 15s/20s/25s policy", async () => {
    const context = setupBrowserAcquisition();
    let attempt = 0;
    context.geolocationDriver.getCurrentPosition = vi.fn(
      (success, error, options) => {
        attempt += 1;
        if (attempt < 3) {
          error({ code: 2, message: "temporarily unavailable" } as GeolocationPositionError);
          return;
        }
        success(browserPosition());
        void options;
      },
    );

    await expect(
      context.bootstrap.start({ longitude: -38.916, latitude: -13.375 }),
    ).resolves.toEqual(routeData());

    expect(context.geolocationDriver.getCurrentPosition).toHaveBeenCalledTimes(3);
    expect(
      vi.mocked(context.geolocationDriver.getCurrentPosition).mock.calls.map(
        (call) => call[2]?.timeout,
      ),
    ).toEqual([...NAVIGATION_BOOTSTRAP_ATTEMPT_TIMEOUTS_MS]);
  });

  it("reuses a recent acceptable location without repeating GPS acquisition", async () => {
    rememberBrowserLocation({
      latitude: -13.376,
      longitude: -38.917,
      accuracy: 9,
      heading: null,
      speed: 1,
      timestamp: Date.now(),
    });
    const context = setupBrowserAcquisition();

    await expect(
      context.bootstrap.start({ longitude: -38.916, latitude: -13.375 }),
    ).resolves.toEqual(routeData());

    expect(context.geolocationDriver.getCurrentPosition).not.toHaveBeenCalled();
    expect(context.requestRouteImpl).toHaveBeenCalledWith(
      expect.objectContaining({ start: [-38.917, -13.376] }),
    );
  });

  it("stops the active wiring exactly once per active session", async () => {
    const context = setup();
    await context.bootstrap.start({ longitude: -38.916, latitude: -13.375 });
    context.bootstrap.stop();
    context.bootstrap.stop();

    expect(context.wiringStop).toHaveBeenCalledTimes(1);
    expect(context.bootstrap.isActive()).toBe(false);
  });

  it("suppresses an arrival callback after its session is stopped", async () => {
    const onArrival = vi.fn<(context: NavigationSessionEventContext) => void>();
    const context = setup(onArrival);
    await context.bootstrap.start({ longitude: -38.916, latitude: -13.375 });
    const staleOnArrival = context.createWiring.mock.calls[0]?.[0].onArrival;

    expect(staleOnArrival).toBeTypeOf("function");
    context.bootstrap.stop();
    staleOnArrival?.();

    expect(onArrival).not.toHaveBeenCalled();
  });

  it("cancels an in-flight start when a newer session begins", async () => {
    const context = setup();
    let firstResolve: ((value: RouteCoordinate) => void) | null = null;
    context.resolveStartCoordinate
      .mockImplementationOnce(
        (signal: AbortSignal) =>
          new Promise<RouteCoordinate>((resolve, reject) => {
            firstResolve = resolve;
            signal.addEventListener(
              "abort",
              () => reject(new DOMException("cancelled", "AbortError")),
              { once: true },
            );
          }),
      )
      .mockResolvedValueOnce([-38.918, -13.377]);

    const first = context.bootstrap.start({
      longitude: -38.916,
      latitude: -13.375,
    });
    const second = context.bootstrap.start({
      longitude: -38.915,
      latitude: -13.374,
    });

    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    await expect(second).resolves.toEqual(routeData());
    expect(firstResolve).not.toBeNull();
    expect(context.requestRouteImpl).toHaveBeenCalledTimes(1);
    expect(context.wiringStart).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid destination before requesting location or route", async () => {
    const context = setup();

    await expect(
      context.bootstrap.start({ longitude: 200, latitude: -13.375 }),
    ).rejects.toThrow("INVALID_NAVIGATION_DESTINATION");
    expect(context.resolveStartCoordinate).not.toHaveBeenCalled();
    expect(context.requestRouteImpl).not.toHaveBeenCalled();
    expect(context.wiringStart).not.toHaveBeenCalled();
  });
});
