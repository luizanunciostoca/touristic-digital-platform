import { startMorroDigitalBrowser } from "./browser.js";
import { morroInitialMapMarkers } from "./config/map-markers.js";
import { createDevelopmentMapboxSdk } from "./development/mapbox-sdk.js";

const developmentEnvironment = Object.freeze({
  VITE_MAPBOX_ACCESS_TOKEN: "development-only-token",
  VITE_MAPBOX_CONTAINER_ID: "map",
  VITE_MAPBOX_STYLE: "development://morro-digital",
  VITE_MAPBOX_INITIAL_ZOOM: "14",
});

const status = document.getElementById("runtime-status");

function updateStatus(message: string): void {
  if (status) status.textContent = message;
}

void startMorroDigitalBrowser({
  sdk: createDevelopmentMapboxSdk(document),
  environment: developmentEnvironment,
  document,
  initialMarkers: morroInitialMapMarkers,
})
  .then((result) => {
    const pointLabel = result.loadedMarkerCount === 1 ? "ponto" : "pontos";
    updateStatus(
      `Runtime ativo: ${result.startedModules.join(", ")} — provider ${result.geospatialEngine?.providerId ?? "indisponível"} — ${result.loadedMarkerCount} ${pointLabel} da V1 carregados.`,
    );
  })
  .catch((error: unknown) => {
    const message =
      error instanceof Error ? error.message : "Falha desconhecida no runtime.";
    updateStatus(`Falha ao iniciar o Morro Digital: ${message}`);
  });
