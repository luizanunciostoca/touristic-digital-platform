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
  type RoutingLanguage,
} from "@touristic/navigation";

import type {
  BrowserGeolocationService,
  BrowserLocation,
} from "./browser-geolocation.js";

export const NAVIGATION_GUIDANCE_MAX_ACCURACY_METERS = 300;
export const NAVIGATION_MANEUVER_ADVANCE_METERS = 20;

export interface NavigationAppCompositionOptions {
  readonly geolocation: BrowserGeolocationService;
  readonly presenter: NavigationMapboxPresenter;
  readonly routeData: unknown;
  readonly language?: RoutingLanguage;
  readonly sessionId?: number;
  readonly destination?: {
    readonly longitude: number;
    readonly latitude: number;
  };
  readonly instructions?: readonly NavigationInstructionInput[];
  readonly stepIndex?: number;
  readonly recalculationSuppressionMs?: number;
  readonly now?: () => number;
  readonly onSnapshot?: (snapshot: NavigationRuntimeSnapshot) => void;
  readonly onLocation?: (location: BrowserLocation) => void;
  readonly onApproaching?: () => void;
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

function normalizeDelay(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
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

function isGuidanceAccuracyAcceptable(location: BrowserLocation): boolean {
  const accuracy = Number(location.accuracy);
  return (
    !Number.isFinite(accuracy) ||
    accuracy <= NAVIGATION_GUIDANCE_MAX_ACCURACY_METERS
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function routeInstructions(
  routeData: unknown,
): readonly NavigationInstructionInput[] {
  if (!isRecord(routeData)) return [];
  const features: unknown = routeData["features"];
  if (!Array.isArray(features)) return [];
  const feature: unknown = features[0];
  if (!isRecord(feature)) return [];
  const properties: unknown = feature["properties"];
  if (!isRecord(properties)) return [];
  const segments: unknown = properties["segments"];
  if (!Array.isArray(segments)) return [];

  const normalized: NavigationInstructionInput[] = [];
  for (const segment of segments) {
    if (!isRecord(segment)) continue;
    const steps: unknown = segment["steps"];
    if (!Array.isArray(steps)) continue;
    for (const step of steps) {
      if (isRecord(step)) normalized.push(step);
    }
  }
  return normalized;
}

export function createNavigationAppComposition(
  options: NavigationAppCompositionOptions,
): NavigationAppComposition {
  let routeData = options.routeData;
  let instructions = options.instructions ?? routeInstructions(routeData);
  let stepIndex = normalizeStepIndex(options.stepIndex);
  let started = false;
  let unsubscribeLocation: (() => void) | null = null;
  let latestLocation: BrowserLocation | null = null;
  let recalculation: RouteRecalculationController | null = null;
  let recalculationSuppressedUntil = 0;
  const now = options.now ?? (() => Date.now());
  const recalculationSuppressionMs = normalizeDelay(
    options.recalculationSuppressionMs,
  );

  const arrival =
    options.sessionId !== undefined && options.destination
      ? createArrivalLifecycle({
          sessionId: options.sessionId,
          destination: options.destination,
          ports: {
            ...(options.onApproaching
              ? { onApproaching: () => options.onApproaching?.() }
              : {}),
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
      now() < recalculationSuppressedUntil ||
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
      hasInstructions: instructions.length > 0,
      inProgress: recalculation.isInProgress(),
    });
    if (!eligibility.eligible) return;

    void recalculation.recalculate({
      start: [latestLocation.longitude, latestLocation.latitude],
      end: [options.destination.longitude, options.destination.latitude],
    });
  }

  function updateRuntime(location: BrowserLocation): void {
    runtime.update({
      routeData,
      location: runtimeLocationFromBrowser(location),
      instructions,
      stepIndex,
      ...(options.language ? { language: options.language } : {}),
    });
  }

  function maybeAdvanceStep(snapshot: NavigationRuntimeSnapshot): boolean {
    if (instructions.length < 2 || stepIndex >= instructions.length - 1) {
      return false;
    }

    const stepEnds = runtime.getTracker()?.model.stepEnds ?? [];
    let nextStepIndex = stepIndex;

    if (stepEnds.length > 0) {
      while (nextStepIndex < instructions.length - 1) {
        const stepEnd = stepEnds[nextStepIndex];
        if (!stepEnd) break;
        const distanceToManeuver =
          stepEnd.alongDistance - snapshot.completedDistance;
        if (
          !Number.isFinite(distanceToManeuver) ||
          distanceToManeuver > NAVIGATION_MANEUVER_ADVANCE_METERS
        ) {
          break;
        }
        nextStepIndex += 1;
      }
    } else if (
      Number.isFinite(snapshot.distanceToNextManeuver) &&
      snapshot.distanceToNextManeuver <= NAVIGATION_MANEUVER_ADVANCE_METERS
    ) {
      // Without per-step geometry the snapshot distance belongs only to the
      // current maneuver. Consume at most one step so the same measurement is
      // never reused to skip subsequent instructions.
      nextStepIndex += 1;
    }

    if (nextStepIndex === stepIndex) return false;
    stepIndex = nextStepIndex;
    if (!latestLocation) return false;
    updateRuntime(latestLocation);
    return true;
  }

  const handleSnapshot = (snapshot: NavigationRuntimeSnapshot): void => {
    if (!started) return;
    if (maybeAdvanceStep(snapshot)) return;
    options.presenter.update(snapshot);
    options.onSnapshot?.(snapshot);
    maybeRecalculate(snapshot);
  };

  const runtime =
    options.createRuntime?.(handleSnapshot) ??
    createNavigationRuntimeCoordinator({ onSnapshot: handleSnapshot });

  function updateFromLocation(location: BrowserLocation): void {
    if (!started) return;
    options.onLocation?.(location);
    if (!isGuidanceAccuracyAcceptable(location)) return;

    latestLocation = location;
    arrival?.update({
      latitude: location.latitude,
      longitude: location.longitude,
    });
    updateRuntime(location);
  }

  function applyRoute(
    nextRouteData: unknown,
    nextInstructions?: readonly NavigationInstructionInput[],
  ): void {
    routeData = nextRouteData;
    instructions = nextInstructions ?? routeInstructions(nextRouteData);
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
      recalculationSuppressedUntil = now() + recalculationSuppressionMs;
      unsubscribeLocation = options.geolocation.subscribe(updateFromLocation);
      options.geolocation.start();
      const current = options.geolocation.getCurrentLocation();
      if (current) updateFromLocation(current);
    },
    stop(): void {
      if (!started) return;
      started = false;
      latestLocation = null;
      recalculationSuppressedUntil = 0;
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
      nextInstructions?: readonly NavigationInstructionInput[],
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
