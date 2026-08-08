import type {
  MapboxGlMapLike,
  MapboxGlModuleLike,
} from "@touristic/geospatial";

import { startMorroDigitalBrowser } from "./browser.js";
import type { RuntimeEnvironment } from "./config/mapbox-runtime.js";
import {
  getMorroTourById,
  type TourRouteContract,
} from "./config/tour-catalog.js";
import { createMorroTourMarkers } from "./config/tour-markers.js";
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
import { loadMapboxGlSdk } from "./runtime/mapbox-sdk-loader.js";
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

bootstrapMorroDigitalApplication(document);
initializeWeatherWidget({ document });

function setupV1ShellInteractions(): void {
  const assistant = document.getElementById("assistant-messages");
  const assistantButton = document.querySelector<HTMLButtonElement>(
    ".quick-actions .action-button.primary",
  );
  const minimizeButton =
    assistant?.querySelector<HTMLButtonElement>(".minimize-button");
  const globeButton = document.getElementById("toggle-globe-view");

  assistantButton?.addEventListener("click", () => {
    assistant?.classList.remove("hidden");
  });

  minimizeButton?.addEventListener("click", () => {
    assistant?.classList.add("hidden");
  });

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

function setV1MapboxCompatibilityAliases(
  map: MapboxGlMapLike | undefined,
): void {
  const compatibilityGlobal = globalThis as typeof globalThis &
    MorroMapboxCompatibilityGlobal;
  compatibilityGlobal.mapboxPrimaryInstance = map;
  compatibilityGlobal.mapbox3dInstance = map;
}

window.addEventListener("load", () => {
  window.setTimeout(() => {
    document.getElementById("loading-overlay")?.classList.add("fade-out");
  }, 800);
});

const developmentEnvironment = Object.freeze({
  VITE_MAPBOX_ACCESS_TOKEN: "development-only-token",
  VITE_MAPBOX_CONTAINER_ID: "map",
  VITE_MAPBOX_STYLE: "development://morro-digital",
  VITE_MAPBOX_INITIAL_ZOOM: "13.5",
});

const initialTourId = "volta-a-ilha";
const status = document.getElementById("runtime-status");
const mapContainer = document.getElementById("map");
const tourSelect = document.getElementById("tour-select");
const initialTourMarkers = createMorroTourMarkers(initialTourId);
let activeRealMap: MapboxGlMapLike | undefined;
let activeNavigationRuntimeInstall: BrowserNavigationRuntimeInstall | undefined;

function clearBrowserNavigationRuntime(): void {
  activeNavigationRuntimeInstall?.destroy();
  activeNavigationRuntimeInstall = undefined;
}

function updateStatus(message: string): void {
  if (status) status.textContent = message;
}

function formatTourStatus(tourId: string, markerCount: number): string {
  const tour = getMorroTourById(tourId);
  const pointLabel = markerCount === 1 ? "parada" : "paradas";
  return `${markerCount} ${pointLabel} de ${tour?.title ?? tourId} carregadas.`;
}

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
  element.setAttribute("aria-label", input.label ?? stop.title);
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

async function waitForMapStyle(map: MapboxGlMapLike): Promise<void> {
  if (map.isStyleLoaded?.()) return;
  if (!map.once) return;
  await new Promise<void>((resolve) => map.once?.("load", resolve));
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

  await waitForMapStyle(map);
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
        initialCenter: [-38.9159969, -13.4],
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
    const message =
      error instanceof Error ? error.message : "Falha desconhecida no SDK.";
    updateStatus(`Mapbox indisponível; usando fallback da V1: ${message}`);
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
      initialMarkers: initialTourMarkers,
      createMarkerElement: createTourMarkerElement,
      ...(provider.mode === "real"
        ? {
            onMapCreated: (map: MapboxGlMapLike) => {
              clearBrowserNavigationRuntime();
              activeRealMap = map;
              setV1MapboxCompatibilityAliases(map);
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

    const message =
      error instanceof Error
        ? error.message
        : "Falha desconhecida ao inicializar o Mapbox.";
    updateStatus(`Mapbox indisponível; restaurando fallback da V1: ${message}`);
    prepareMapContainerForFallback();

    const fallbackProvider = createFallbackMapProvider();
    mapContainer?.setAttribute("data-map-mode", fallbackProvider.mode);
    mapContainer?.setAttribute("data-map-provider", fallbackProvider.mode);

    return await startMorroDigitalBrowser({
      sdk: fallbackProvider.sdk,
      environment: fallbackProvider.environment,
      document,
      initialMarkers: initialTourMarkers,
      createMarkerElement: createTourMarkerElement,
    });
  }
}

async function start(): Promise<void> {
  const provider = await resolveMapProvider();
  const result = await startBrowserWithProvider(provider);

  if (provider.mode === "real") {
    await presentTourOnRealMap(initialTourId);
  }

  updateStatus(
    `Runtime ativo: ${result.startedModules.join(", ")} — provider ${result.geospatialEngine?.providerId ?? "indisponível"} — ${formatTourStatus(initialTourId, result.loadedMarkerCount)}`,
  );

  if (!(tourSelect instanceof HTMLSelectElement) || !result.geospatialEngine) {
    return;
  }

  const controller = createMorroTourSelectionController({
    engine: result.geospatialEngine,
    events: result.runtime.events,
    initialTourId,
  });
  mapContainer?.setAttribute("data-active-tour", controller.activeTourId);
  mapContainer?.setAttribute("data-tour-state", "ready");
  tourSelect.disabled = false;

  tourSelect.addEventListener("change", () => {
    const requestedTourId = tourSelect.value;
    tourSelect.disabled = true;
    mapContainer?.setAttribute("aria-busy", "true");
    mapContainer?.setAttribute("data-tour-state", "switching");
    updateStatus("Atualizando o roteiro exibido no mapa…");

    void controller
      .selectTour(requestedTourId)
      .then(async (selection) => {
        if (provider.mode === "real") {
          await presentTourOnRealMap(selection.activeTourId);
        }
        mapContainer?.setAttribute(
          "data-map-marker-count",
          String(selection.markerCount),
        );
        mapContainer?.setAttribute("data-active-tour", selection.activeTourId);
        mapContainer?.setAttribute("data-tour-state", "ready");
        updateStatus(
          `Runtime ativo — ${formatTourStatus(selection.activeTourId, selection.markerCount)}`,
        );
      })
      .catch((error: unknown) => {
        tourSelect.value = controller.activeTourId;
        mapContainer?.setAttribute("data-active-tour", controller.activeTourId);
        mapContainer?.setAttribute("data-tour-state", "error");
        const message =
          error instanceof Error
            ? error.message
            : "Falha desconhecida ao trocar o roteiro.";
        updateStatus(`Não foi possível trocar o roteiro: ${message}`);
      })
      .finally(() => {
        tourSelect.disabled = false;
        mapContainer?.removeAttribute("aria-busy");
      });
  });
}

void start().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Falha desconhecida no runtime.";
  updateStatus(`Falha ao iniciar o Morro Digital: ${message}`);
  mapContainer?.setAttribute("data-map-state", "error");
});
