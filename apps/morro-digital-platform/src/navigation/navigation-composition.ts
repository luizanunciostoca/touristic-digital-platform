import type { NavigationMapboxPresenter } from "@touristic/geospatial";
import {
  createArrivalLifecycle,
  createNavigationRuntimeCoordinator,
  createRouteRecalculationController,
  evaluateRouteRecalculation,
  type NavigationInstructionInput,
  type NavigationRuntimeCoordinator,
  type NavigationRuntimeSnapshot,
  type NavigationRuntimeUpdateInput,
  type RouteFeatureCollection,
  type RouteRecalculationController,
  type RouteRecalculationRequest,
} from "@touristic/navigation";

import type {
  BrowserGeolocationService,
  BrowserLocation,
} from "./browser-geolocation.js";

export interface NavigationAppCompositionOptions {
  readonly geolocation: BrowserGeolocationService;
  readonly presenter: NavigationMapboxPresenter;
  readonly routeData: unknown;
  readonly sessionId?: number;
  readonly destination?: {
    readonly longitude: number;
    readonly latitude: number;
  };
  readonly instructions?: readonly NavigationInstructionInput[];
  readonly stepIndex?: number;
  readonly onSnapshot?: (snapshot: NavigationRuntimeSnapshot) => void;
  readonly onArrival?: () => void;
  readonly onAutoEnd?: () => void;
  readonly onRecalculation?: (route: RouteFeatureCollection) => void;
  readonly requestRecalculationRoute?: (
    request: RouteRecalculationRequest,
  ) => Promise<RouteFeatureCollection | null>;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function routeHasInstructions(routeData: unknown): boolean {
  if (!isRecord(routeData)) return false;
  const features: unknown = routeData["features"];
  if (!Array.isArray(features)) return false;
  const feature: unknown = features[0];
  if (!isRecord(feature)) return false;
  const properties: unknown = feature["properties"];
  if (!isRecord(properties)) return false;
  const segments: unknown = properties["segments"];
  if (!Array.isArray(segments)) return false;
  const firstSegment: unknown = segments[0];
  if (!isRecord(firstSegment)) return false;
  const steps: unknown = firstSegment["steps"];
  return Array.isArray(steps) && steps.length > 0;
}

export function createNavigationAppComposition(
  options: NavigationAppCompositionOptions,
): NavigationAppComposition {
  let routeData = options.routeData;
  let instructions = options.instructions ?? [];
  let stepIndex = normalizeStepIndex(options.stepIndex);
  let started = false;
  let unsubscribeLocation: (() => void) | null = null;
  let latestLocation: BrowserLocation | null = null;
  let recalculation: RouteRecalculationController | null = null;

  const arrival =
    options.sessionId !== undefined && options.destination
      ? createArrivalLifecycle({
          sessionId: options.sessionId,
          destination: options.destination,
          ports: {
            ...(options.onArrival
              ? { onArrived: () => options.onArrival?.() }
              : {}),
            ...(options.onAutoEnd
              ? { onAutoEnd: () => options.onAutoEnd?.() }
              : {}),
          },
        })
      : null;

  function maybeRecalculate(snapshot: NavigationRuntimeSnapshot): void {
    if (
      !started ||
      !recalculation ||
      !latestLocation ||
      options.sessionId === undefined ||
      !options.destination
    ) {
      return;
    }

    const eligibility = evaluateRouteRecalculation({
      sessionId: options.sessionId,
      offRouteDistance: snapshot.offRouteDistance,
      accuracy: latestLocation.accuracy,
      speed: latestLocation.speed,
      hasInstructions:
        instructions.length > 0 || routeHasInstructions(routeData),
      inProgress: recalculation.isInProgress(),
    });
    if (!eligibility.eligible) return;

    void recalculation.recalculate({
      start: [latestLocation.longitude, latestLocation.latitude],
      end: [options.destination.longitude, options.destination.latitude],
    });
  }

  const handleSnapshot = (snapshot: NavigationRuntimeSnapshot): void => {
    if (!started) return;
    options.presenter.update(snapshot);
    options.onSnapshot?.(snapshot);
    maybeRecalculate(snapshot);
  };

  const runtime =
    options.createRuntime?.(handleSnapshot) ??
    createNavigationRuntimeCoordinator({ onSnapshot: handleSnapshot });

  function updateFromLocation(location: BrowserLocation): void {
    if (!started) return;
    latestLocation = location;
    arrival?.update({
      latitude: location.latitude,
      longitude: location.longitude,
    });
    runtime.update({
      routeData,
      location: runtimeLocationFromBrowser(location),
      instructions,
      stepIndex,
    });
  }

  function applyRoute(
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
  }

  recalculation =
    options.sessionId !== undefined &&
    options.destination &&
    options.requestRecalculationRoute
      ? createRouteRecalculationController({
          sessionId: options.sessionId,
          requestRoute: options.requestRecalculationRoute,
          onRouteAvailable(route) {
            if (!started) return;
            applyRoute(route);
            options.onRecalculation?.(route);
          },
        })
      : null;

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
      latestLocation = null;
      unsubscribeLocation?.();
      unsubscribeLocation = null;
      options.geolocation.stop();
      options.presenter.destroy();
      runtime.reset();
      arrival?.reset();
      recalculation?.resetCooldown();
    },
    isStarted(): boolean {
      return started;
    },
    setRoute(
      nextRouteData: unknown,
      nextInstructions: readonly NavigationInstructionInput[] = [],
    ): void {
      applyRoute(nextRouteData, nextInstructions);
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
