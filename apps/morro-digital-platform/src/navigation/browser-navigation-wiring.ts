import {
  createNavigationMapboxPresenter,
  type MapboxGlMapLike,
  type MapboxGlModuleLike,
  type NavigationMapboxMapLike,
  type NavigationMapboxMarkerLike,
} from "@touristic/geospatial";
import type {
  NavigationInstructionInput,
  NavigationRuntimeSnapshot,
  RouteFeatureCollection,
  RouteRecalculationRequest,
} from "@touristic/navigation";

import {
  createBrowserGeolocationService,
  type BrowserGeolocationDriver,
} from "./browser-geolocation.js";
import {
  createNavigationAppComposition,
  type NavigationAppComposition,
} from "./navigation-composition.js";

interface NativeNavigationMapboxMap extends MapboxGlMapLike {
  easeTo(input: Parameters<NavigationMapboxMapLike["easeTo"]>[0]): void;
  getContainer?(): {
    readonly clientHeight: number;
    readonly clientWidth: number;
  };
}

interface RotatableMapboxMarker {
  setRotation?(bearing: number): unknown;
}

export interface BrowserNavigationWiringOptions {
  readonly map: MapboxGlMapLike;
  readonly sdk: MapboxGlModuleLike;
  readonly routeData: unknown;
  readonly sessionId?: number;
  readonly destination?: {
    readonly longitude: number;
    readonly latitude: number;
  };
  readonly instructions?: readonly NavigationInstructionInput[];
  readonly stepIndex?: number;
  readonly geolocationDriver?: BrowserGeolocationDriver;
  readonly onSnapshot?: (snapshot: NavigationRuntimeSnapshot) => void;
  readonly onArrival?: () => void;
  readonly onAutoEnd?: () => void;
  readonly onRecalculation?: (route: RouteFeatureCollection) => void;
  readonly requestRecalculationRoute?: (
    request: RouteRecalculationRequest,
  ) => Promise<RouteFeatureCollection | null>;
}

export interface BrowserNavigationWiring {
  readonly composition: NavigationAppComposition;
  start(): void;
  stop(): void;
}

function requireNavigationMap(map: MapboxGlMapLike): NativeNavigationMapboxMap {
  const candidate = map as MapboxGlMapLike & Partial<NativeNavigationMapboxMap>;
  if (typeof candidate.easeTo !== "function") {
    throw new Error("Mapbox map does not support navigation camera updates.");
  }
  return candidate as NativeNavigationMapboxMap;
}

function createPresenterMap(
  map: NativeNavigationMapboxMap,
): NavigationMapboxMapLike {
  return {
    easeTo(input) {
      map.easeTo(input);
    },
    ...(map.getContainer
      ? {
          getContainer: () =>
            map.getContainer?.() ?? { clientWidth: 360, clientHeight: 640 },
        }
      : {}),
  };
}

function createPresenterMarker(
  sdk: MapboxGlModuleLike,
  nativeMap: MapboxGlMapLike,
): NavigationMapboxMarkerLike {
  const marker = new sdk.Marker();
  const rotatable = marker as typeof marker & RotatableMapboxMarker;
  const wrapper: NavigationMapboxMarkerLike = {
    setLngLat(position) {
      marker.setLngLat(position);
      return wrapper;
    },
    setRotation(bearing) {
      rotatable.setRotation?.(bearing);
      return wrapper;
    },
    addTo() {
      marker.addTo(nativeMap);
      return wrapper;
    },
    remove() {
      marker.remove();
    },
  };
  return wrapper;
}

export function createBrowserNavigationWiring(
  options: BrowserNavigationWiringOptions,
): BrowserNavigationWiring {
  const nativeNavigationMap = requireNavigationMap(options.map);
  const presenterMap = createPresenterMap(nativeNavigationMap);
  const geolocation = createBrowserGeolocationService(
    options.geolocationDriver ? { driver: options.geolocationDriver } : {},
  );
  const presenter = createNavigationMapboxPresenter({
    map: presenterMap,
    createMarker: () => createPresenterMarker(options.sdk, options.map),
  });
  const composition = createNavigationAppComposition({
    geolocation,
    presenter,
    routeData: options.routeData,
    ...(options.sessionId !== undefined
      ? { sessionId: options.sessionId }
      : {}),
    ...(options.destination ? { destination: options.destination } : {}),
    ...(options.instructions ? { instructions: options.instructions } : {}),
    ...(options.stepIndex !== undefined
      ? { stepIndex: options.stepIndex }
      : {}),
    ...(options.onSnapshot ? { onSnapshot: options.onSnapshot } : {}),
    ...(options.onArrival ? { onArrival: options.onArrival } : {}),
    ...(options.onAutoEnd ? { onAutoEnd: options.onAutoEnd } : {}),
    ...(options.onRecalculation
      ? { onRecalculation: options.onRecalculation }
      : {}),
    ...(options.requestRecalculationRoute
      ? { requestRecalculationRoute: options.requestRecalculationRoute }
      : {}),
  });

  return Object.freeze({
    composition,
    start(): void {
      composition.start();
    },
    stop(): void {
      composition.stop();
    },
  });
}
