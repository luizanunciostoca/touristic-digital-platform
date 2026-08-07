import type { MapboxGlModuleLike } from "@touristic/geospatial";

import { startMorroDigitalBrowser } from "./browser.js";
import type { RuntimeEnvironment } from "./config/mapbox-runtime.js";
import { getMorroTourById } from "./config/tour-catalog.js";
import { createMorroTourMarkers } from "./config/tour-markers.js";
import { createMorroTourSelectionController } from "./config/tour-selection.js";
import {
  createLeafletCompatibilitySdk,
  hasLeafletCompatibilitySdk,
} from "./development/leaflet-compatibility-sdk.js";
import { createDevelopmentMapboxSdk } from "./development/mapbox-sdk.js";
import { bootstrapMorroDigitalApplication } from "./main.js";
import { loadMapboxGlSdk } from "./runtime/mapbox-sdk-loader.js";
import { initializeWeatherWidget } from "./weather/weather-widget.js";

interface MorroRuntimeGlobal {
  readonly __MORRO_RUNTIME_ENV__?: RuntimeEnvironment;
}

interface ResolvedMapProvider {
  readonly sdk: MapboxGlModuleLike;
  readonly environment: RuntimeEnvironment;
  readonly mode: "real" | "leaflet" | "development";
}

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

function updateStatus(message: string): void {
  if (status) status.textContent = message;
}

function formatTourStatus(tourId: string, markerCount: number): string {
  const tour = getMorroTourById(tourId);
  const pointLabel = markerCount === 1 ? "parada" : "paradas";
  return `${markerCount} ${pointLabel} de ${tour?.title ?? tourId} carregadas.`;
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

async function start(): Promise<void> {
  const provider = await resolveMapProvider();
  mapContainer?.setAttribute("data-map-mode", provider.mode);
  mapContainer?.setAttribute(
    "data-map-provider",
    provider.mode === "real" ? "mapbox" : provider.mode,
  );

  const result = await startMorroDigitalBrowser({
    sdk: provider.sdk,
    environment: provider.environment,
    document,
    initialMarkers: initialTourMarkers,
  });

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
      .then((selection) => {
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
