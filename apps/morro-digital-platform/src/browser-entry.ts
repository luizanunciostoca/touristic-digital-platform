import { startMorroDigitalBrowser } from "./browser.js";
import { getMorroTourById } from "./config/tour-catalog.js";
import { createMorroTourMarkers } from "./config/tour-markers.js";
import { createMorroTourSelectionController } from "./config/tour-selection.js";
import {
  createLeafletCompatibilitySdk,
  hasLeafletCompatibilitySdk,
} from "./development/leaflet-compatibility-sdk.js";
import { createDevelopmentMapboxSdk } from "./development/mapbox-sdk.js";
import { bootstrapMorroDigitalApplication } from "./main.js";

bootstrapMorroDigitalApplication(document);

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
const browserMapSdk = hasLeafletCompatibilitySdk(window)
  ? createLeafletCompatibilitySdk(window, {
      initialCenter: [-38.9159969, -13.4],
      initialZoom: 13.5,
    })
  : createDevelopmentMapboxSdk(document);

function updateStatus(message: string): void {
  if (status) status.textContent = message;
}

function formatTourStatus(tourId: string, markerCount: number): string {
  const tour = getMorroTourById(tourId);
  const pointLabel = markerCount === 1 ? "parada" : "paradas";
  return `${markerCount} ${pointLabel} de ${tour?.title ?? tourId} carregadas.`;
}

void startMorroDigitalBrowser({
  sdk: browserMapSdk,
  environment: developmentEnvironment,
  document,
  initialMarkers: initialTourMarkers,
})
  .then((result) => {
    updateStatus(
      `Runtime ativo: ${result.startedModules.join(", ")} — provider ${result.geospatialEngine?.providerId ?? "indisponível"} — ${formatTourStatus(initialTourId, result.loadedMarkerCount)}`,
    );

    if (
      !(tourSelect instanceof HTMLSelectElement) ||
      !result.geospatialEngine
    ) {
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
          mapContainer?.setAttribute(
            "data-active-tour",
            selection.activeTourId,
          );
          mapContainer?.setAttribute("data-tour-state", "ready");
          updateStatus(
            `Runtime ativo — ${formatTourStatus(selection.activeTourId, selection.markerCount)}`,
          );
        })
        .catch((error: unknown) => {
          tourSelect.value = controller.activeTourId;
          mapContainer?.setAttribute(
            "data-active-tour",
            controller.activeTourId,
          );
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
  })
  .catch((error: unknown) => {
    const message =
      error instanceof Error ? error.message : "Falha desconhecida no runtime.";
    updateStatus(`Falha ao iniciar o Morro Digital: ${message}`);
  });
