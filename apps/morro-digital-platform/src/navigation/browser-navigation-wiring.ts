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
  readonly instructions?: readonly NavigationInstructionInput[];
  readonly stepIndex?: number;
  readonly geolocationDriver?: BrowserGeolocationDriver;
  readonly onSnapshot?: (snapshot: NavigationRuntimeSnapshot) => void;
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
    ...(options.instructions ? { instructions: options.instructions } : {}),
    ...(options.stepIndex !== undefined
      ? { stepIndex: options.stepIndex }
      : {}),
    ...(options.onSnapshot ? { onSnapshot: options.onSnapshot } : {}),
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
