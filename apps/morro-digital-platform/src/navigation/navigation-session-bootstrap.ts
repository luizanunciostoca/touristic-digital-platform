import type {
  MapboxGlMapLike,
  MapboxGlModuleLike,
} from "@touristic/geospatial";
import {
  beginNavigationSession,
  cancelNavigationSession,
  requestRoute,
  type NavigationRuntimeSnapshot,
  type NavigationSession,
  type RouteCoordinate,
  type RouteFeatureCollection,
  type RouteRecalculationRequest,
  type RoutingLanguage,
  type RoutingProvider,
} from "@touristic/navigation";

import {
  getRecentBrowserLocation,
  rememberBrowserLocation,
  type BrowserGeolocationDriver,
  type BrowserLocation,
} from "./browser-geolocation.js";
import {
  createBrowserNavigationWiring,
  type BrowserNavigationWiring,
} from "./browser-navigation-wiring.js";

export const NAVIGATION_BOOTSTRAP_MAX_ACCURACY_METERS = 1_500;
export const NAVIGATION_ROUTE_TIMEOUT_MS = 15_000;
export const NAVIGATION_RECALCULATION_SUPPRESSION_MS = 15_000;
export const NAVIGATION_TUTORIAL_RECALCULATION_SUPPRESSION_MS = 120_000;
export const NAVIGATION_BOOTSTRAP_ATTEMPT_TIMEOUTS_MS = Object.freeze([
  15_000, 20_000, 25_000,
] as const);
const NAVIGATION_BOOTSTRAP_MAX_AGE_MS = 10_000;

export interface NavigationDestinationInput {
  readonly longitude: number;
  readonly latitude: number;
}

export interface NavigationStartOptions {
  readonly tutorial?: boolean;
}

export interface NavigationSessionEventContext {
  readonly sessionId: number;
  readonly destination: NavigationDestinationInput;
}

export interface NavigationSessionBootstrapOptions {
  readonly map: MapboxGlMapLike;
  readonly sdk: MapboxGlModuleLike;
  readonly geolocationDriver?: BrowserGeolocationDriver;
  readonly language?: RoutingLanguage;
  readonly routeTimeoutMs?: number;
  readonly routingFallbackProvider?: RoutingProvider | null;
  readonly resolveStartCoordinate?: (
    signal: AbortSignal,
  ) => Promise<RouteCoordinate>;
  readonly requestRouteImpl?: typeof requestRoute;
  readonly createWiring?: typeof createBrowserNavigationWiring;
  readonly onSnapshot?: (
    snapshot: NavigationRuntimeSnapshot,
    context: NavigationSessionEventContext,
  ) => void;
  readonly onLocation?: (
    location: BrowserLocation,
    context: NavigationSessionEventContext,
  ) => void;
  readonly onApproaching?: (context: NavigationSessionEventContext) => void;
  readonly onArrival?: (context: NavigationSessionEventContext) => void;
  readonly onAutoEnd?: () => void;
  readonly onRecalculation?: (route: RouteFeatureCollection) => void;
}

export interface NavigationSessionBootstrap {
  start(
    destination: NavigationDestinationInput,
    startOptions?: NavigationStartOptions,
  ): Promise<RouteFeatureCollection>;
  stop(): void;
  isActive(): boolean;
  getActiveSessionId(): number | null;
}

function validateDestination(
  destination: NavigationDestinationInput,
): RouteCoordinate {
  const longitude = Number(destination.longitude);
  const latitude = Number(destination.latitude);
  if (
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude) ||
    longitude < -180 ||
    longitude > 180 ||
    latitude < -90 ||
    latitude > 90
  ) {
    throw new Error("INVALID_NAVIGATION_DESTINATION");
  }
  return [longitude, latitude];
}

function isBootstrapAccuracyAcceptable(accuracy: unknown): boolean {
  const numeric = Number(accuracy);
  return (
    !Number.isFinite(numeric) ||
    numeric <= NAVIGATION_BOOTSTRAP_MAX_ACCURACY_METERS
  );
}

function coordinateFromLocation(location: BrowserLocation): RouteCoordinate {
  return [location.longitude, location.latitude];
}

function requestBrowserStartCoordinate(
  driver: BrowserGeolocationDriver,
  signal: AbortSignal,
  timeout: number,
): Promise<RouteCoordinate> {
  return new Promise<RouteCoordinate>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Navigation bootstrap cancelled", "AbortError"));
      return;
    }

    let settled = false;
    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      callback();
    };
    const onAbort = (): void => {
      finish(() =>
        reject(
          new DOMException("Navigation bootstrap cancelled", "AbortError"),
        ),
      );
    };
    signal.addEventListener("abort", onAbort, { once: true });

    driver.getCurrentPosition(
      (position) => {
        finish(() => {
          const longitude = Number(position.coords.longitude);
          const latitude = Number(position.coords.latitude);
          if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
            reject(new Error("INVALID_START_LOCATION"));
            return;
          }

          const accuracy = Number(position.coords.accuracy);
          if (!isBootstrapAccuracyAcceptable(accuracy)) {
            reject(new Error("INACCURATE_START_LOCATION"));
            return;
          }

          rememberBrowserLocation({
            latitude,
            longitude,
            accuracy,
            heading: position.coords.heading,
            speed: position.coords.speed,
            timestamp: Number.isFinite(Number(position.timestamp))
              ? Number(position.timestamp)
              : Date.now(),
          });
          resolve([longitude, latitude]);
        });
      },
      (error) => {
        finish(() => {
          if (error.code === 1) {
            reject(new Error("PERMISSION_DENIED"));
            return;
          }
          reject(new Error(error.message || "LOCATION_UNAVAILABLE"));
        });
      },
      {
        enableHighAccuracy: true,
        timeout,
        maximumAge: NAVIGATION_BOOTSTRAP_MAX_AGE_MS,
      },
    );
  });
}

async function resolveBrowserStartCoordinate(
  driver: BrowserGeolocationDriver,
  signal: AbortSignal,
): Promise<RouteCoordinate> {
  const recent = getRecentBrowserLocation({
    maxAge: NAVIGATION_BOOTSTRAP_MAX_AGE_MS,
  });
  if (recent && isBootstrapAccuracyAcceptable(recent.accuracy)) {
    return coordinateFromLocation(recent);
  }

  let lastError: unknown = new Error("LOCATION_UNAVAILABLE");
  for (const timeout of NAVIGATION_BOOTSTRAP_ATTEMPT_TIMEOUTS_MS) {
    try {
      return await requestBrowserStartCoordinate(driver, signal, timeout);
    } catch (error) {
      if (signal.aborted || error instanceof DOMException) throw error;
      if (error instanceof Error && error.message === "PERMISSION_DENIED") {
        throw error;
      }
      lastError = error;
    }
  }
  throw lastError;
}

export function createNavigationSessionBootstrap(
  options: NavigationSessionBootstrapOptions,
): NavigationSessionBootstrap {
  const geolocationDriver = options.geolocationDriver ?? navigator.geolocation;
  const requestRouteImpl = options.requestRouteImpl ?? requestRoute;
  const createWiring = options.createWiring ?? createBrowserNavigationWiring;
  const routeTimeoutMs = options.routeTimeoutMs ?? NAVIGATION_ROUTE_TIMEOUT_MS;
  const resolveStartCoordinate =
    options.resolveStartCoordinate ??
    ((signal: AbortSignal) =>
      resolveBrowserStartCoordinate(geolocationDriver, signal));

  let activeSession: NavigationSession | null = null;
  let activeWiring: BrowserNavigationWiring | null = null;

  function stop(): void {
    const sessionId = activeSession?.id ?? null;
    if (sessionId !== null) cancelNavigationSession(sessionId, "stopped");
    activeSession = null;
    activeWiring?.stop();
    activeWiring = null;
  }

  return Object.freeze({
    async start(
      destination: NavigationDestinationInput,
      startOptions: NavigationStartOptions = {},
    ): Promise<RouteFeatureCollection> {
      stop();
      const destinationCoordinate = validateDestination(destination);
      const session = beginNavigationSession({ source: "browser-bootstrap" });
      activeSession = session;
      const eventContext: NavigationSessionEventContext = Object.freeze({
        sessionId: session.id,
        destination: Object.freeze({
          longitude: destinationCoordinate[0],
          latitude: destinationCoordinate[1],
        }),
      });

      try {
        const startCoordinate = await resolveStartCoordinate(session.signal);
        session.assertActive();

        const routeData = await requestRouteImpl({
          start: startCoordinate,
          end: destinationCoordinate,
          language: options.language ?? "pt",
          timeoutMs: routeTimeoutMs,
          fallbackProvider: options.routingFallbackProvider ?? null,
          signal: session.signal,
        });
        session.assertActive();

        const requestRecalculationRoute = async (
          request: RouteRecalculationRequest,
        ): Promise<RouteFeatureCollection | null> => {
          session.assertActive();
          const recalculated = await requestRouteImpl({
            start: request.start,
            end: request.end,
            language: options.language ?? "pt",
            timeoutMs: routeTimeoutMs,
            fallbackProvider: options.routingFallbackProvider ?? null,
            signal: request.signal,
          });
          session.assertActive();
          return recalculated;
        };

        const wiring = createWiring({
          map: options.map,
          sdk: options.sdk,
          routeData,
          destination: eventContext.destination,
          sessionId: session.id,
          geolocationDriver,
          requestRecalculationRoute,
          recalculationSuppressionMs: startOptions.tutorial
            ? NAVIGATION_TUTORIAL_RECALCULATION_SUPPRESSION_MS
            : NAVIGATION_RECALCULATION_SUPPRESSION_MS,
          ...(options.onSnapshot
            ? {
                onSnapshot: (snapshot) =>
                  options.onSnapshot?.(snapshot, eventContext),
              }
            : {}),
          ...(options.onLocation
            ? {
                onLocation: (location) =>
                  options.onLocation?.(location, eventContext),
              }
            : {}),
          ...(options.onApproaching
            ? {
                onApproaching: () => {
                  if (activeSession?.id !== session.id || !session.isActive()) {
                    return;
                  }
                  options.onApproaching?.(eventContext);
                },
              }
            : {}),
          ...(options.onArrival
            ? {
                onArrival: () => {
                  if (activeSession?.id !== session.id || !session.isActive()) {
                    return;
                  }
                  options.onArrival?.(eventContext);
                },
              }
            : {}),
          ...(options.onAutoEnd ? { onAutoEnd: options.onAutoEnd } : {}),
          ...(options.onRecalculation
            ? { onRecalculation: options.onRecalculation }
            : {}),
        });
        activeWiring = wiring;
        wiring.start();
        return routeData;
      } catch (error) {
        const wasAbortedBeforeCleanup = session.signal.aborted;
        if (activeSession?.id === session.id) {
          cancelNavigationSession(session.id, "start_failed");
          activeSession = null;
          activeWiring?.stop();
          activeWiring = null;
        }
        if (wasAbortedBeforeCleanup && !(error instanceof DOMException)) {
          throw new DOMException(
            "Navigation bootstrap cancelled",
            "AbortError",
          );
        }
        throw error;
      }
    },
    stop,
    isActive(): boolean {
      return activeSession?.isActive() === true && activeWiring !== null;
    },
    getActiveSessionId(): number | null {
      return activeSession?.isActive() === true ? activeSession.id : null;
    },
  });
}
