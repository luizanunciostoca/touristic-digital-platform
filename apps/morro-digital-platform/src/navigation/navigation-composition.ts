import type { NavigationMapboxPresenter } from "@touristic/geospatial";
import {
  createNavigationRuntimeCoordinator,
  type NavigationInstructionInput,
  type NavigationRuntimeCoordinator,
  type NavigationRuntimeSnapshot,
  type NavigationRuntimeUpdateInput,
} from "@touristic/navigation";

import type {
  BrowserGeolocationService,
  BrowserLocation,
} from "./browser-geolocation.js";

export interface NavigationAppCompositionOptions {
  readonly geolocation: BrowserGeolocationService;
  readonly presenter: NavigationMapboxPresenter;
  readonly routeData: unknown;
  readonly instructions?: readonly NavigationInstructionInput[];
  readonly stepIndex?: number;
  readonly onSnapshot?: (snapshot: NavigationRuntimeSnapshot) => void;
  readonly createRuntime?: (
    onSnapshot: (snapshot: NavigationRuntimeSnapshot) => void,
  ) => NavigationRuntimeCoordinator;
}

export interface NavigationAppComposition {
  start(): void;
  stop(): void;
  isStarted(): boolean;
  setRoute(
    routeData: unknown,
    instructions?: readonly NavigationInstructionInput[],
  ): void;
  setStepIndex(stepIndex: number): void;
  getSnapshot(): NavigationRuntimeSnapshot | null;
}

function normalizeStepIndex(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

function runtimeLocationFromBrowser(
  location: BrowserLocation,
): NonNullable<NavigationRuntimeUpdateInput["location"]> {
  return {
    latitude: location.latitude,
    longitude: location.longitude,
    accuracy: location.accuracy,
    speed: location.speed,
    timestamp: location.timestamp,
  };
}

export function createNavigationAppComposition(
  options: NavigationAppCompositionOptions,
): NavigationAppComposition {
  let routeData = options.routeData;
  let instructions = options.instructions ?? [];
  let stepIndex = normalizeStepIndex(options.stepIndex);
  let started = false;
  let unsubscribeLocation: (() => void) | null = null;

  const handleSnapshot = (snapshot: NavigationRuntimeSnapshot): void => {
    if (!started) return;
    options.presenter.update(snapshot);
    options.onSnapshot?.(snapshot);
  };

  const runtime =
    options.createRuntime?.(handleSnapshot) ??
    createNavigationRuntimeCoordinator({ onSnapshot: handleSnapshot });

  function updateFromLocation(location: BrowserLocation): void {
    if (!started) return;
    runtime.update({
      routeData,
      location: runtimeLocationFromBrowser(location),
      instructions,
      stepIndex,
    });
  }

  return Object.freeze({
    start(): void {
      if (started) return;
      started = true;
      unsubscribeLocation = options.geolocation.subscribe(updateFromLocation);
      options.geolocation.start();
      const current = options.geolocation.getCurrentLocation();
      if (current) updateFromLocation(current);
    },
    stop(): void {
      if (!started) return;
      started = false;
      unsubscribeLocation?.();
      unsubscribeLocation = null;
      options.geolocation.stop();
      options.presenter.destroy();
      runtime.reset();
    },
    isStarted(): boolean {
      return started;
    },
    setRoute(
      nextRouteData: unknown,
      nextInstructions: readonly NavigationInstructionInput[] = [],
    ): void {
      routeData = nextRouteData;
      instructions = nextInstructions;
      stepIndex = 0;
      runtime.reset();
      options.presenter.reset();
      if (started) {
        const current = options.geolocation.getCurrentLocation();
        if (current) updateFromLocation(current);
      }
    },
    setStepIndex(nextStepIndex: number): void {
      stepIndex = normalizeStepIndex(nextStepIndex);
      if (started) {
        const current = options.geolocation.getCurrentLocation();
        if (current) updateFromLocation(current);
      }
    },
    getSnapshot(): NavigationRuntimeSnapshot | null {
      return runtime.getSnapshot();
    },
  });
}
