import type {
  MapboxGlMapLike,
  MapboxGlModuleLike,
} from "@touristic/geospatial";
import {
  beginNavigationSession,
  cancelNavigationSession,
  requestRoute,
  type NavigationSession,
  type RouteCoordinate,
  type RouteFeatureCollection,
  type RoutingLanguage,
} from "@touristic/navigation";

import type { BrowserGeolocationDriver } from "./browser-geolocation.js";
import {
  createBrowserNavigationWiring,
  type BrowserNavigationWiring,
} from "./browser-navigation-wiring.js";

export interface NavigationDestinationInput {
  readonly longitude: number;
  readonly latitude: number;
}

export interface NavigationSessionBootstrapOptions {
  readonly map: MapboxGlMapLike;
  readonly sdk: MapboxGlModuleLike;
  readonly geolocationDriver?: BrowserGeolocationDriver;
  readonly language?: RoutingLanguage;
  readonly routeTimeoutMs?: number;
  readonly resolveStartCoordinate?: (
    signal: AbortSignal,
  ) => Promise<RouteCoordinate>;
  readonly requestRouteImpl?: typeof requestRoute;
  readonly createWiring?: typeof createBrowserNavigationWiring;
  readonly onArrival?: () => void;
  readonly onAutoEnd?: () => void;
}

export interface NavigationSessionBootstrap {
  start(
    destination: NavigationDestinationInput,
  ): Promise<RouteFeatureCollection>;
  stop(): void;
  isActive(): boolean;
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

function resolveBrowserStartCoordinate(
  driver: BrowserGeolocationDriver,
  signal: AbortSignal,
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
        timeout: 15_000,
        maximumAge: 10_000,
      },
    );
  });
}

export function createNavigationSessionBootstrap(
  options: NavigationSessionBootstrapOptions,
): NavigationSessionBootstrap {
  const geolocationDriver = options.geolocationDriver ?? navigator.geolocation;
  const requestRouteImpl = options.requestRouteImpl ?? requestRoute;
  const createWiring = options.createWiring ?? createBrowserNavigationWiring;
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
    ): Promise<RouteFeatureCollection> {
      stop();
      const destinationCoordinate = validateDestination(destination);
      const session = beginNavigationSession({ source: "browser-bootstrap" });
      activeSession = session;

      try {
        const startCoordinate = await resolveStartCoordinate(session.signal);
        session.assertActive();

        const routeData = await requestRouteImpl({
          start: startCoordinate,
          end: destinationCoordinate,
          language: options.language ?? "pt",
          ...(options.routeTimeoutMs !== undefined
            ? { timeoutMs: options.routeTimeoutMs }
            : {}),
          signal: session.signal,
        });
        session.assertActive();

        const wiring = createWiring({
          map: options.map,
          sdk: options.sdk,
          routeData,
          destination: {
            longitude: destinationCoordinate[0],
            latitude: destinationCoordinate[1],
          },
          sessionId: session.id,
          geolocationDriver,
          ...(options.onArrival ? { onArrival: options.onArrival } : {}),
          ...(options.onAutoEnd ? { onAutoEnd: options.onAutoEnd } : {}),
        });
        activeWiring = wiring;
        wiring.start();
        return routeData;
      } catch (error) {
        if (activeSession?.id === session.id) {
          cancelNavigationSession(session.id, "start_failed");
          activeSession = null;
          activeWiring?.stop();
          activeWiring = null;
        }
        if (session.signal.aborted && !(error instanceof DOMException)) {
          throw new DOMException("Navigation bootstrap cancelled", "AbortError");
        }
        throw error;
      }
    },
    stop,
    isActive(): boolean {
      return activeSession?.isActive() === true && activeWiring !== null;
    },
  });
}
