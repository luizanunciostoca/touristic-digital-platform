import type {
  MapboxGlMapLike,
  MapboxGlModuleLike,
} from "@touristic/geospatial";

import { installAssistantShellUi } from "./assistant/assistant-shell-ui.js";
import { startMorroDigitalBrowser } from "./browser.js";
import { morroDeSaoPauloDestination } from "./config/destination.js";
import type { RuntimeEnvironment } from "./config/mapbox-runtime.js";
import {
  getMorroTourById,
  type TourRouteContract,
} from "./config/tour-catalog.js";
import { createMorroTourSelectionController } from "./config/tour-selection.js";
import {
  createLeafletCompatibilitySdk,
  hasLeafletCompatibilitySdk,
} from "./development/leaflet-compatibility-sdk.js";
import { createDevelopmentMapboxSdk } from "./development/mapbox-sdk.js";
import { bootstrapMorroDigitalApplication } from "./main.js";
import {
  installBrowserNavigationRuntime,
  type BrowserNavigationRuntimeInstall,
} from "./navigation/browser-navigation-runtime-install.js";
import { installPublicOnboarding } from "./onboarding/public-onboarding.js";
import {
  installGlobalViewControl,
  type GlobalViewControl,
} from "./map/global-view-control.js";
import { loadMapboxGlSdk } from "./runtime/mapbox-sdk-loader.js";
import { waitForMapStyleReady } from "./runtime/map-style-readiness.js";
import {
  applyRuntimeAccessibilityPresentation,
  formatRuntimeStatus,
  localizedTourStopLabel,
  type RuntimeStatusDescriptor,
} from "./runtime/runtime-accessibility-i18n.js";
import { initializeWeatherWidget } from "./weather/weather-widget.js";

interface MorroRuntimeGlobal {
  readonly __MORRO_RUNTIME_ENV__?: RuntimeEnvironment;
}

interface MorroMapboxCompatibilityGlobal {
  mapboxPrimaryInstance: MapboxGlMapLike | undefined;
  mapbox3dInstance: MapboxGlMapLike | undefined;
}

interface ResolvedMapProvider {
  readonly sdk: MapboxGlModuleLike;
  readonly environment: RuntimeEnvironment;
  readonly mode: "real" | "leaflet" | "development";
}

const TOUR_ROUTE_SOURCE = "tour-route-source";
const TOUR_ROUTE_LAYER = "tour-route-layer";
const TOUR_ROUTE_OUTLINE = "tour-route-outline";
const TOUR_CAMERA_DURATION_MS = 2000;
const TOUR_CAMERA_TIMEOUT_MS = 3500;
const SPLASH_VISIBLE_MS = 800;
const SPLASH_FADE_MS = 550;

const application = bootstrapMorroDigitalApplication(document);
initializeWeatherWidget({ document });

function setupV1ShellInteractions(): void {
  installAssistantShellUi({ document });

  const globeButton = document.getElementById("toggle-globe-view");
  globeButton?.addEventListener("click", () => {
    const active = globeButton.classList.toggle("active");
    globeButton.setAttribute("aria-pressed", String(active));
  });

  document
    .querySelectorAll<HTMLButtonElement>(".assistant-option-btn")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const value = button.dataset.value || button.textContent?.trim() || "";
        document.dispatchEvent(
          new CustomEvent("morro:assistant-option-selected", {
            detail: { value },
          }),
        );
      });
    });
}

setupV1ShellInteractions();
const publicOnboarding = installPublicOnboarding({ document });

function setV1MapboxCompatibilityAliases(
  map: MapboxGlMapLike | undefined,
): void {
  const compatibilityGlobal = globalThis as typeof globalThis &
    MorroMapboxCompatibilityGlobal;
  compatibilityGlobal.mapboxPrimaryInstance = map;
  compatibilityGlobal.mapbox3dInstance = map;
}

let pageLoadSettled = false;
let homeRuntimeReady = false;
let onboardingRevealScheduled = false;

function maybeRevealPublicOnboarding(): void {
  if (!pageLoadSettled || !homeRuntimeReady || onboardingRevealScheduled)
    return;
  onboardingRevealScheduled = true;
  window.setTimeout(() => {
    publicOnboarding.showIfNeeded();
  }, SPLASH_FADE_MS);
}

function settlePageLoad(): void {
  window.setTimeout(() => {
    document.getElementById("loading-overlay")?.classList.add("fade-out");
    pageLoadSettled = true;
    maybeRevealPublicOnboarding();
  }, SPLASH_VISIBLE_MS);
}

if (document.readyState === "complete") {
  settlePageLoad();
} else {
  window.addEventListener("load", settlePageLoad, { once: true });
}

const developmentEnvironment = Object.freeze({
  VITE_MAPBOX_ACCESS_TOKEN: "development-only-token",
  VITE_MAPBOX_CONTAINER_ID: "map",
  VITE_MAPBOX_STYLE: "development://morro-digital",
  VITE_MAPBOX_INITIAL_ZOOM: "13.5",
});

const status = document.getElementById("runtime-status");
const mapContainer = document.getElementById("map");
const tourSelect = document.getElementById("tour-select");
let activeRealMap: MapboxGlMapLike | undefined;
let activeNavigationRuntimeInstall: BrowserNavigationRuntimeInstall | undefined;
let activeGlobalViewControl: GlobalViewControl | undefined;

function clearBrowserNavigationRuntime(): void {
  activeGlobalViewControl?.destroy();
  activeGlobalViewControl = undefined;
  activeNavigationRuntimeInstall?.destroy();
  activeNavigationRuntimeInstall = undefined;
}

let runtimeStatusDescriptor: RuntimeStatusDescriptor = Object.freeze({
  kind: "initializing",
});

function renderRuntimeAccessibility(): void {
  applyRuntimeAccessibilityPresentation(document);
  if (status?.dataset.statusOwner === "explore") return;
  if (status) {
    status.dataset.statusOwner = "runtime";
    status.textContent = formatRuntimeStatus(
      runtimeStatusDescriptor,
      document.documentElement.lang,
    );
  }
}

function updateStatus(descriptor: RuntimeStatusDescriptor): void {
  runtimeStatusDescriptor = Object.freeze(descriptor);
  if (status) status.dataset.statusOwner = "runtime";
  renderRuntimeAccessibility();
}

const onRuntimeStatusRefresh = (): void => {
  if (status) status.dataset.statusOwner = "runtime";
  renderRuntimeAccessibility();
};
document.addEventListener(
  "morro:runtime-status-refresh",
  onRuntimeStatusRefresh,
);

const runtimeAccessibilityLocaleObserver = new MutationObserver(() => {
  renderRuntimeAccessibility();
});
runtimeAccessibilityLocaleObserver.observe(document.documentElement, {
  attributes: true,
  attributeFilter: ["lang"],
});
renderRuntimeAccessibility();

function createTourMarkerElement(input: {
  readonly id: string;
  readonly label?: string;
}): HTMLElement | undefined {
  const separatorIndex = input.id.indexOf(":");
  if (separatorIndex <= 0) return undefined;

  const tourId = input.id.slice(0, separatorIndex);
  const stopId = input.id.slice(separatorIndex + 1);
  const tour = getMorroTourById(tourId);
  const stopIndex = tour?.stops.findIndex((stop) => stop.id === stopId) ?? -1;
  if (!tour || stopIndex < 0) return undefined;

  const stop = tour.stops[stopIndex];
  if (!stop) return undefined;

  const isFirst = stopIndex === 0;
  const isLast = stopIndex === tour.stops.length - 1;
  const element = document.createElement("div");
  element.className = "tour-stop-marker";
  element.dataset.stopIndex = String(stopIndex);
  element.dataset.tourId = tourId;
  element.dataset.stopId = stopId;
  element.setAttribute(
    "aria-label",
    localizedTourStopLabel(tourId, stopId, document.documentElement.lang) ??
      input.label ??
      stop.title,
  );
  element.style.cursor = "pointer";
  element.style.zIndex = "10";

  const pin = document.createElement("div");
  pin.className = `tour-stop-pin${
    isFirst ? " tour-stop-start" : isLast ? " tour-stop-end" : ""
  }`;
  pin.style.width = "38px";
  pin.style.height = "38px";
  pin.style.borderRadius = "50% 50% 50% 0";
  pin.style.transform = "rotate(-45deg)";
  pin.style.background = isFirst
    ? "linear-gradient(135deg, #10b981, #059669)"
    : isLast
      ? "linear-gradient(135deg, #f59e0b, #d97706)"
      : "linear-gradient(135deg, #06b6d4, #0891b2)";
  pin.style.border = "3px solid white";
  pin.style.boxShadow = isFirst
    ? "0 3px 12px rgba(16, 185, 129, 0.5), 0 1px 4px rgba(0,0,0,0.3)"
    : isLast
      ? "0 3px 12px rgba(245, 158, 11, 0.5), 0 1px 4px rgba(0,0,0,0.3)"
      : "0 3px 12px rgba(6, 182, 212, 0.5), 0 1px 4px rgba(0,0,0,0.3)";
  pin.style.display = "flex";
  pin.style.alignItems = "center";
  pin.style.justifyContent = "center";
  pin.style.position = "relative";

  const number = document.createElement("span");
  number.className = "tour-stop-number";
  number.textContent = isFirst ? "🚩" : isLast ? "🏁" : String(stop.order);
  number.style.transform = "rotate(45deg)";
  number.style.fontSize = "13px";
  number.style.fontWeight = "700";
  number.style.color = "white";
  number.style.lineHeight = "1";
  number.style.display = "block";

  pin.appendChild(number);
  element.appendChild(pin);
  return element;
}

function clearTourRoute(map: MapboxGlMapLike): void {
  if (map.getLayer?.(TOUR_ROUTE_LAYER)) map.removeLayer?.(TOUR_ROUTE_LAYER);
  if (map.getLayer?.(TOUR_ROUTE_OUTLINE)) map.removeLayer?.(TOUR_ROUTE_OUTLINE);
  if (map.getSource?.(TOUR_ROUTE_SOURCE)) map.removeSource?.(TOUR_ROUTE_SOURCE);
}

function routeBounds(
  tour: TourRouteContract,
): [[number, number], [number, number]] {
  const longitudes = tour.stops.map((stop) => stop.position.longitude);
  const latitudes = tour.stops.map((stop) => stop.position.latitude);
  return [
    [Math.min(...longitudes), Math.min(...latitudes)],
    [Math.max(...longitudes), Math.max(...latitudes)],
  ];
}

async function fitTourBoundsAndWait(
  map: MapboxGlMapLike,
  tour: TourRouteContract,
): Promise<void> {
  if (!map.fitBounds) return;

  const options = {
    padding: { top: 120, bottom: 260, left: 60, right: 60 },
    pitch: 50,
    bearing: 0,
    duration: TOUR_CAMERA_DURATION_MS,
    essential: true,
  } as const;

  if (!map.once) {
    map.fitBounds(routeBounds(tour), options);
    return;
  }

  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      resolve();
    };
    const timeoutId = window.setTimeout(finish, TOUR_CAMERA_TIMEOUT_MS);
    map.once?.("moveend", finish);
    map.fitBounds?.(routeBounds(tour), options);
  });
}

async function presentTourOnRealMap(tourId: string): Promise<void> {
  const map = activeRealMap;
  const tour = getMorroTourById(tourId);
  if (!map || !tour) return;
  if (!map.addSource || !map.addLayer || !map.fitBounds) return;

  await waitForMapStyleReady(map);
  clearTourRoute(map);

  const coordinates = tour.stops.map(
    (stop) =>
      [stop.position.longitude, stop.position.latitude] as [number, number],
  );

  map.addSource(TOUR_ROUTE_SOURCE, {
    type: "geojson",
    data: {
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates,
      },
    },
  });
  map.addLayer({
    id: TOUR_ROUTE_OUTLINE,
    type: "line",
    source: TOUR_ROUTE_SOURCE,
    layout: { "line-join": "round", "line-cap": "round" },
    paint: {
      "line-color": "#0f4c81",
      "line-width": 9,
      "line-opacity": 0.35,
      "line-dasharray": [2, 2],
    },
  });
  map.addLayer({
    id: TOUR_ROUTE_LAYER,
    type: "line",
    source: TOUR_ROUTE_SOURCE,
    layout: { "line-join": "round", "line-cap": "round" },
    paint: {
      "line-color": "#06b6d4",
      "line-width": 5,
      "line-opacity": 0.9,
      "line-dasharray": [2, 1.5],
    },
  });
  await fitTourBoundsAndWait(map, tour);
}

function createFallbackMapProvider(): ResolvedMapProvider {
  if (hasLeafletCompatibilitySdk(window)) {
    return Object.freeze({
      sdk: createLeafletCompatibilitySdk(window, {
        initialCenter: [
          morroDeSaoPauloDestination.center.longitude,
          morroDeSaoPauloDestination.center.latitude,
        ],
        initialZoom: 13.5,
      }),
      environment: developmentEnvironment,
      mode: "leaflet" as const,
    });
  }

  return Object.freeze({
    sdk: createDevelopmentMapboxSdk(document),
    environment: developmentEnvironment,
    mode: "development" as const,
  });
}

function hasRealMapboxToken(
  environment?: RuntimeEnvironment,
): environment is RuntimeEnvironment {
  return Boolean(environment?.VITE_MAPBOX_ACCESS_TOKEN?.trim());
}

function normalizeRealMapboxEnvironment(
  environment: RuntimeEnvironment,
): RuntimeEnvironment {
  return Object.freeze({
    ...environment,
    VITE_MAPBOX_CONTAINER_ID:
      environment.VITE_MAPBOX_CONTAINER_ID?.trim() || "map",
    VITE_MAPBOX_STYLE:
      environment.VITE_MAPBOX_STYLE?.trim() ||
      "mapbox://styles/mapbox/streets-v12",
    VITE_MAPBOX_INITIAL_ZOOM:
      environment.VITE_MAPBOX_INITIAL_ZOOM?.trim() || "13.5",
  });
}

async function resolveMapProvider(): Promise<ResolvedMapProvider> {
  const runtimeEnvironment = (
    globalThis as typeof globalThis & MorroRuntimeGlobal
  ).__MORRO_RUNTIME_ENV__;

  if (!hasRealMapboxToken(runtimeEnvironment)) {
    return createFallbackMapProvider();
  }

  try {
    const sdk = await loadMapboxGlSdk({ document, window });
    return Object.freeze({
      sdk,
      environment: normalizeRealMapboxEnvironment(runtimeEnvironment),
      mode: "real" as const,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : undefined;
    updateStatus({
      kind: "map-fallback",
      mode: "using",
      ...(detail ? { detail } : {}),
    });
    mapContainer?.setAttribute("data-map-fallback", "leaflet");
    return createFallbackMapProvider();
  }
}

function prepareMapContainerForFallback(): void {
  clearBrowserNavigationRuntime();
  activeRealMap = undefined;
  setV1MapboxCompatibilityAliases(undefined);
  if (!mapContainer) return;
  mapContainer.replaceChildren();
  mapContainer.classList.remove("mapboxgl-map");
  mapContainer.removeAttribute("style");
  mapContainer.removeAttribute("aria-busy");
  mapContainer.setAttribute("data-map-fallback", "leaflet");
}

async function startBrowserWithProvider(provider: ResolvedMapProvider) {
  mapContainer?.setAttribute("data-map-mode", provider.mode);
  mapContainer?.setAttribute(
    "data-map-provider",
    provider.mode === "real" ? "mapbox" : provider.mode,
  );

  try {
    return await startMorroDigitalBrowser({
      sdk: provider.sdk,
      environment: provider.environment,
      document,
      createMarkerElement: createTourMarkerElement,
      ...(provider.mode === "real"
        ? {
            onMapCreated: (map: MapboxGlMapLike) => {
              clearBrowserNavigationRuntime();
              activeRealMap = map;
              setV1MapboxCompatibilityAliases(map);
              activeGlobalViewControl = installGlobalViewControl({
                document,
                map,
                homeCenter: [
                  morroDeSaoPauloDestination.center.longitude,
                  morroDeSaoPauloDestination.center.latitude,
                ],
                homeZoom: Number(
                  provider.environment.VITE_MAPBOX_INITIAL_ZOOM || "13.5",
                ),
              });
              activeNavigationRuntimeInstall = installBrowserNavigationRuntime({
                map,
                sdk: provider.sdk,
                document,
              });
            },
          }
        : {}),
    });
  } catch (error) {
    if (provider.mode !== "real") throw error;

    const detail = error instanceof Error ? error.message : undefined;
    updateStatus({
      kind: "map-fallback",
      mode: "restoring",
      ...(detail ? { detail } : {}),
    });
    prepareMapContainerForFallback();

    const fallbackProvider = createFallbackMapProvider();
    mapContainer?.setAttribute("data-map-mode", fallbackProvider.mode);
    mapContainer?.setAttribute("data-map-provider", fallbackProvider.mode);

    return await startMorroDigitalBrowser({
      sdk: fallbackProvider.sdk,
      environment: fallbackProvider.environment,
      document,
      createMarkerElement: createTourMarkerElement,
    });
  }
}

async function start(): Promise<void> {
  const provider = await resolveMapProvider();
  const result = await startBrowserWithProvider(provider);
  application.exploreLocations.setGeospatialEngine(result.geospatialEngine);

  mapContainer?.removeAttribute("data-active-tour");
  mapContainer?.setAttribute("data-tour-state", "idle");
  mapContainer?.setAttribute("data-home-state", "ready");
  mapContainer?.setAttribute("data-map-marker-count", "0");
  const providerId = result.geospatialEngine?.providerId;
  updateStatus({
    kind: "runtime-ready",
    modules: result.startedModules,
    ...(providerId ? { providerId } : {}),
  });

  homeRuntimeReady = true;
  maybeRevealPublicOnboarding();

  if (!(tourSelect instanceof HTMLSelectElement) || !result.geospatialEngine) {
    return;
  }

  const controller = createMorroTourSelectionController({
    engine: result.geospatialEngine,
    events: result.runtime.events,
    initialTourId: null,
  });

  tourSelect.selectedIndex = -1;
  tourSelect.disabled = false;

  tourSelect.addEventListener("change", () => {
    const requestedTourId = tourSelect.value;
    if (!requestedTourId || !getMorroTourById(requestedTourId)) {
      tourSelect.selectedIndex = -1;
      return;
    }

    tourSelect.disabled = true;
    mapContainer?.setAttribute("aria-busy", "true");
    mapContainer?.setAttribute("data-tour-state", "switching");
    updateStatus({ kind: "tour-switching" });

    void controller
      .selectTour(requestedTourId)
      .then(async (selection) => {
        await presentTourOnRealMap(selection.activeTourId);
        mapContainer?.setAttribute(
          "data-map-marker-count",
          String(selection.markerCount),
        );
        mapContainer?.setAttribute("data-active-tour", selection.activeTourId);
        mapContainer?.setAttribute("data-tour-state", "ready");
        updateStatus({
          kind: "tour-ready",
          tourId: selection.activeTourId,
          markerCount: selection.markerCount,
        });
      })
      .catch((error: unknown) => {
        const activeTourId = controller.activeTourId;
        if (activeTourId) {
          tourSelect.value = activeTourId;
          mapContainer?.setAttribute("data-active-tour", activeTourId);
        } else {
          tourSelect.selectedIndex = -1;
          mapContainer?.removeAttribute("data-active-tour");
          mapContainer?.setAttribute("data-map-marker-count", "0");
        }
        mapContainer?.setAttribute("data-tour-state", "error");
        const detail = error instanceof Error ? error.message : undefined;
        updateStatus({
          kind: "tour-error",
          ...(detail ? { detail } : {}),
        });
      })
      .finally(() => {
        tourSelect.disabled = false;
        mapContainer?.removeAttribute("aria-busy");
      });
  });
}

void start().catch((error: unknown) => {
  application.exploreLocations.setGeospatialEngine(undefined);
  const detail = error instanceof Error ? error.message : undefined;
  updateStatus({
    kind: "runtime-error",
    ...(detail ? { detail } : {}),
  });
  mapContainer?.setAttribute("data-map-state", "error");
});
