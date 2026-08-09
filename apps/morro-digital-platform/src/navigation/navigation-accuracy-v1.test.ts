import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  MapboxGlMapLike,
  MapboxGlModuleLike,
  NavigationMapboxPresenter,
} from "@touristic/geospatial";
import {
  resetNavigationSessionManagerForTests,
  type NavigationRuntimeCoordinator,
  type NavigationRuntimeSnapshot,
  type NavigationRuntimeUpdateInput,
  type RouteFeatureCollection,
} from "@touristic/navigation";

import type {
  BrowserGeolocationDriver,
  BrowserGeolocationService,
  BrowserLocation,
} from "./browser-geolocation.js";
import {
  NAVIGATION_GUIDANCE_MAX_ACCURACY_METERS,
  createNavigationAppComposition,
} from "./navigation-composition.js";
import type {
  BrowserNavigationWiring,
  BrowserNavigationWiringOptions,
} from "./browser-navigation-wiring.js";
import {
  NAVIGATION_BOOTSTRAP_MAX_ACCURACY_METERS,
  createNavigationSessionBootstrap,
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

function geolocationPosition(accuracy: number): GeolocationPosition {
  return {
    coords: {
      latitude: -13.376,
      longitude: -38.917,
      accuracy,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
      toJSON: () => ({}),
    },
    timestamp: 1_000,
    toJSON: () => ({}),
  };
}

function bootstrapForAccuracy(accuracy: number) {
  const getCurrentPosition = vi.fn<
    BrowserGeolocationDriver["getCurrentPosition"]
  >((success) => success(geolocationPosition(accuracy)));
  const geolocationDriver: BrowserGeolocationDriver = {
    watchPosition: vi.fn(() => 7),
    getCurrentPosition,
    clearWatch: vi.fn(),
  };
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
    map: { setCenter: vi.fn(), remove: vi.fn() } as MapboxGlMapLike,
    sdk: {
      accessToken: "token",
      Map: vi.fn(),
      Marker: vi.fn(),
    } as unknown as MapboxGlModuleLike,
    geolocationDriver,
    requestRouteImpl,
    createWiring,
  });

  return { bootstrap, getCurrentPosition, requestRouteImpl, createWiring };
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
      stepIndex: 0,
    },
  };
}

function guidanceAccuracyHarness() {
  let subscriber: ((location: BrowserLocation) => void) | null = null;
  const geolocation: BrowserGeolocationService = {
    start: vi.fn(),
    stop: vi.fn(),
    getLocation: vi.fn(),
    getCurrentLocation: vi.fn(() => null),
    subscribe(listener) {
      subscriber = listener;
      return vi.fn();
    },
  };
  const presenter: NavigationMapboxPresenter = {
    update: vi.fn(() => true),
    reset: vi.fn(),
    destroy: vi.fn(),
  };
  const runtimeUpdate = vi.fn<
    (input: NavigationRuntimeUpdateInput) => NavigationRuntimeSnapshot | null
  >(() => runtimeSnapshot());
  const runtime: NavigationRuntimeCoordinator = {
    update: runtimeUpdate,
    getSnapshot: () => null,
    getTracker: () => null,
    reset: vi.fn(),
  };
  const onLocation = vi.fn<(location: BrowserLocation) => void>();
  const composition = createNavigationAppComposition({
    geolocation,
    presenter,
    routeData: routeData(),
    instructions: [{ instruction: "Continue" }],
    onLocation,
    createRuntime: () => runtime,
  });
  composition.start();

  return {
    runtimeUpdate,
    onLocation,
    emit(accuracy: number) {
      if (!subscriber) throw new Error("location subscriber not installed");
      subscriber({
        latitude: -13.376,
        longitude: -38.917,
        accuracy,
        heading: null,
        speed: 1,
        timestamp: 1_000,
      });
    },
  };
}

afterEach(() => {
  resetNavigationSessionManagerForTests();
});

describe("V1 navigation accuracy contract", () => {
  it("pins the frozen V1 bootstrap and guidance thresholds", () => {
    expect(NAVIGATION_BOOTSTRAP_MAX_ACCURACY_METERS).toBe(1_500);
    expect(NAVIGATION_GUIDANCE_MAX_ACCURACY_METERS).toBe(300);
  });

  it("accepts bootstrap accuracy at 1500 meters", async () => {
    const context = bootstrapForAccuracy(1_500);

    await expect(
      context.bootstrap.start({ longitude: -38.916, latitude: -13.375 }),
    ).resolves.toEqual(routeData());

    expect(context.getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(context.requestRouteImpl).toHaveBeenCalledTimes(1);
    expect(context.createWiring).toHaveBeenCalledTimes(1);
  });

  it("rejects bootstrap accuracy above 1500 meters before routing", async () => {
    const context = bootstrapForAccuracy(1_500.01);

    await expect(
      context.bootstrap.start({ longitude: -38.916, latitude: -13.375 }),
    ).rejects.toThrow("INACCURATE_START_LOCATION");

    expect(context.requestRouteImpl).not.toHaveBeenCalled();
    expect(context.createWiring).not.toHaveBeenCalled();
  });

  it("allows 300 meter guidance and blocks less accurate samples from runtime", () => {
    const context = guidanceAccuracyHarness();

    context.emit(300);
    context.emit(300.01);

    expect(context.onLocation).toHaveBeenCalledTimes(2);
    expect(context.runtimeUpdate).toHaveBeenCalledTimes(1);
    expect(context.runtimeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        location: expect.objectContaining({ accuracy: 300 }),
      }),
    );
  });
});
