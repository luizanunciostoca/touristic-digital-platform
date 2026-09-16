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
  RoutingLanguage,
} from "@touristic/navigation";

import {
  createBrowserGeolocationService,
  type BrowserGeolocationDriver,
  type BrowserLocation,
} from "./browser-geolocation.js";
import {
  createNavigationAppComposition,
  type NavigationAppComposition,
} from "./navigation-composition.js";
import {
  clearNavigationRoute,
  presentNavigationRoute,
} from "./navigation-route-presentation.js";

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
  readonly language?: RoutingLanguage;
  readonly sessionId?: number;
  readonly destination?: {
    readonly longitude: number;
    readonly latitude: number;
  };
  readonly instructions?: readonly NavigationInstructionInput[];
  readonly stepIndex?: number;
  readonly recalculationSuppressionMs?: number;
  readonly geolocationDriver?: BrowserGeolocationDriver;
  readonly onSnapshot?: (snapshot: NavigationRuntimeSnapshot) => void;
  readonly onLocation?: (location: BrowserLocation) => void;
  readonly onApproaching?: () => void;
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

function createNavigationUserMarkerElement(): HTMLElement | undefined {
  if (typeof document === "undefined") return undefined;

  const element = document.createElement("div");
  element.className =
    "mapbox-user-marker user-location-arrow navigation-user-location-marker";
  element.dataset.navigationUserMarker = "true";
  element.setAttribute("role", "img");
  element.setAttribute("aria-label", "Sua localização");

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 56 56");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");

  const halo = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  halo.setAttribute("cx", "28");
  halo.setAttribute("cy", "28");
  halo.setAttribute("r", "22");
  halo.setAttribute("fill", "#ffffff");
  halo.setAttribute("stroke", "#0f4c81");
  halo.setAttribute("stroke-width", "3");

  const arrow = document.createElementNS("http://www.w3.org/2000/svg", "path");
  arrow.setAttribute("d", "M28 6 L44 46 L28 38 L12 46 Z");
  arrow.setAttribute("fill", "#06b6d4");
  arrow.setAttribute("stroke", "#0f4c81");
  arrow.setAttribute("stroke-width", "2");
  arrow.setAttribute("stroke-linejoin", "round");

  svg.append(halo, arrow);
  element.appendChild(svg);
  return element;
}

function createPresenterMarker(
  sdk: MapboxGlModuleLike,
  nativeMap: MapboxGlMapLike,
): NavigationMapboxMarkerLike {
  const element = createNavigationUserMarkerElement();
  const marker = new sdk.Marker(
    element ? { element, anchor: "center" } : undefined,
  );
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

  let routePresentationRevision = 0;
  const presentRouteWhenReady = (routeData: unknown): void => {
    const revision = ++routePresentationRevision;
    const present = (): void => {
      if (revision !== routePresentationRevision) return;
      presentNavigationRoute(options.map, routeData);
    };

    if (options.map.isStyleLoaded?.() === false && options.map.once) {
      options.map.once("load", present);
      return;
    }
    present();
  };

  const composition = createNavigationAppComposition({
    geolocation,
    presenter,
    routeData: options.routeData,
    ...(options.language ? { language: options.language } : {}),
    ...(options.sessionId !== undefined
      ? { sessionId: options.sessionId }
      : {}),
    ...(options.destination ? { destination: options.destination } : {}),
    ...(options.instructions ? { instructions: options.instructions } : {}),
    ...(options.stepIndex !== undefined
      ? { stepIndex: options.stepIndex }
      : {}),
    ...(options.recalculationSuppressionMs !== undefined
      ? { recalculationSuppressionMs: options.recalculationSuppressionMs }
      : {}),
    ...(options.onSnapshot ? { onSnapshot: options.onSnapshot } : {}),
    ...(options.onLocation ? { onLocation: options.onLocation } : {}),
    ...(options.onApproaching ? { onApproaching: options.onApproaching } : {}),
    ...(options.onArrival ? { onArrival: options.onArrival } : {}),
    ...(options.onAutoEnd ? { onAutoEnd: options.onAutoEnd } : {}),
    onRecalculation(route) {
      presentRouteWhenReady(route);
      options.onRecalculation?.(route);
    },
    ...(options.requestRecalculationRoute
      ? { requestRecalculationRoute: options.requestRecalculationRoute }
      : {}),
  });

  return Object.freeze({
    composition,
    start(): void {
      presentRouteWhenReady(options.routeData);
      composition.start();
    },
    stop(): void {
      routePresentationRevision += 1;
      composition.stop();
      clearNavigationRoute(options.map);
    },
  });
}
