import { describe, expect, it, vi } from "vitest";

import type { NavigationMapboxPresenter } from "@touristic/geospatial";
import type {
  NavigationRuntimeCoordinator,
  NavigationRuntimeSnapshot,
  NavigationRuntimeUpdateInput,
} from "@touristic/navigation";

import type {
  BrowserGeolocationService,
  BrowserLocation,
} from "./browser-geolocation.js";
import { createNavigationAppComposition } from "./navigation-composition.js";

function location(
  latitude = -13.376,
  longitude = -38.917,
): BrowserLocation {
  return {
    latitude,
    longitude,
    accuracy: 7,
    heading: null,
    speed: 1,
    timestamp: 1_000,
  };
}

function runtimeSnapshot(): NavigationRuntimeSnapshot {
  return {
    progress: 0.2,
    progressPercent: 20,
    traveledDistance: 20,
    remainingDistance: 80,
    remainingDuration: 64,
    offRouteDistance: 2,
    projectedCoordinate: [-38.917, -13.376],
    closestSegmentIndex: 0,
    distanceToNextManeuver: 30,
    bearing: 90,
    rawBearing: 90,
    visualLocation: { latitude: -13.376, longitude: -38.917 },
    visualDeadZoneMeters: 2,
    visualHeldByDeadZone: false,
    visualHeldByBackwardGuard: false,
    visualRouteSnapped: true,
    visualIgnoredStaleUpdate: false,
    guidance: {
      instruction: "Continue pela rota",
      original: "Continue pela rota",
      formattedDistance: "30 m",
      remainingDistance: "80 m",
      estimatedTime: "1 min",
      progress: 20,
      stepIndex: 0,
    },
  };
}

function setup(current: BrowserLocation | null = null) {
  let locationSubscriber: ((value: BrowserLocation) => void) | null = null;
  const geolocationStart = vi.fn<() => void>();
  const geolocationStop = vi.fn<() => void>();
  const unsubscribe = vi.fn<() => void>();
  const getCurrentLocation = vi.fn<() => BrowserLocation | null>(() => current);
  const geolocation: BrowserGeolocationService = {
    start: geolocationStart,
    stop: geolocationStop,
    getLocation: vi.fn(),
    getCurrentLocation,
    subscribe(listener) {
      locationSubscriber = listener;
      return unsubscribe;
    },
  };

  const presenterUpdate = vi.fn<NavigationMapboxPresenter["update"]>(() => true);
  const presenterReset = vi.fn<() => void>();
  const presenterDestroy = vi.fn<() => void>();
  const presenter: NavigationMapboxPresenter = {
    update: presenterUpdate,
    reset: presenterReset,
    destroy: presenterDestroy,
  };

  const runtimeUpdate = vi.fn<(input: NavigationRuntimeUpdateInput) => NavigationRuntimeSnapshot | null>();
  const runtimeReset = vi.fn<() => void>();
  let snapshot: NavigationRuntimeSnapshot | null = null;
  let emitSnapshot: ((value: NavigationRuntimeSnapshot) => void) | null = null;
  const createRuntime = vi.fn(
    (onSnapshot: (value: NavigationRuntimeSnapshot) => void): NavigationRuntimeCoordinator => {
      emitSnapshot = (value) => {
        snapshot = value;
        onSnapshot(value);
      };
      return {
        update: runtimeUpdate,
        getSnapshot: () => snapshot,
        getTracker: () => null,
        reset: runtimeReset,
      };
    },
  );

  const onSnapshot = vi.fn<(value: NavigationRuntimeSnapshot) => void>();
  const composition = createNavigationAppComposition({
    geolocation,
    presenter,
    routeData: { route: "A" },
    instructions: [{ instruction: "Siga em frente" }],
    createRuntime,
    onSnapshot,
  });

  return {
    composition,
    geolocationStart,
    geolocationStop,
    getCurrentLocation,
    unsubscribe,
    presenterUpdate,
    presenterReset,
    presenterDestroy,
    runtimeUpdate,
    runtimeReset,
    onSnapshot,
    emitLocation(value: BrowserLocation) {
      if (!locationSubscriber) throw new Error("location subscriber not registered");
      locationSubscriber(value);
    },
    emitRuntimeSnapshot(value = runtimeSnapshot()) {
      if (!emitSnapshot) throw new Error("runtime not created");
      emitSnapshot(value);
    },
  };
}

describe("navigation app composition", () => {
  it("starts geolocation once and routes location updates into runtime", () => {
    const context = setup();
    context.composition.start();
    context.composition.start();
    context.emitLocation(location());

    expect(context.geolocationStart).toHaveBeenCalledTimes(1);
    expect(context.runtimeUpdate).toHaveBeenCalledTimes(1);
    expect(context.runtimeUpdate).toHaveBeenCalledWith({
      routeData: { route: "A" },
      location: location(),
      instructions: [{ instruction: "Siga em frente" }],
      stepIndex: 0,
    });
  });

  it("uses a fresh current location immediately on start", () => {
    const current = location(-13.38, -38.91);
    const context = setup(current);
    context.composition.start();

    expect(context.getCurrentLocation).toHaveBeenCalledTimes(1);
    expect(context.runtimeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ location: current }),
    );
  });

  it("forwards runtime snapshots to presenter and consumer only while started", () => {
    const context = setup();
    context.composition.start();
    const snapshot = runtimeSnapshot();
    context.emitRuntimeSnapshot(snapshot);

    expect(context.presenterUpdate).toHaveBeenCalledWith(snapshot);
    expect(context.onSnapshot).toHaveBeenCalledWith(snapshot);

    context.composition.stop();
    context.emitRuntimeSnapshot(snapshot);
    expect(context.presenterUpdate).toHaveBeenCalledTimes(1);
    expect(context.onSnapshot).toHaveBeenCalledTimes(1);
  });

  it("resets runtime/presenter when route changes and reevaluates current location", () => {
    const current = location();
    const context = setup(current);
    context.composition.start();
    context.runtimeUpdate.mockClear();

    context.composition.setRoute(
      { route: "B" },
      [{ instruction: "Vire à direita" }],
    );

    expect(context.runtimeReset).toHaveBeenCalledTimes(1);
    expect(context.presenterReset).toHaveBeenCalledTimes(1);
    expect(context.runtimeUpdate).toHaveBeenCalledWith({
      routeData: { route: "B" },
      location: current,
      instructions: [{ instruction: "Vire à direita" }],
      stepIndex: 0,
    });
  });

  it("updates step index without restarting navigation", () => {
    const current = location();
    const context = setup(current);
    context.composition.start();
    context.runtimeUpdate.mockClear();

    context.composition.setStepIndex(3.8);

    expect(context.runtimeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ stepIndex: 3 }),
    );
    expect(context.geolocationStart).toHaveBeenCalledTimes(1);
  });

  it("stops every owned resource exactly once", () => {
    const context = setup();
    context.composition.start();
    context.composition.stop();
    context.composition.stop();

    expect(context.unsubscribe).toHaveBeenCalledTimes(1);
    expect(context.geolocationStop).toHaveBeenCalledTimes(1);
    expect(context.presenterDestroy).toHaveBeenCalledTimes(1);
    expect(context.runtimeReset).toHaveBeenCalledTimes(1);
    expect(context.composition.isStarted()).toBe(false);
  });
});
