import { startMorroDigitalBrowser } from "./browser.js";
import { createMorroTourMarkers } from "./config/tour-markers.js";
import { createDevelopmentMapboxSdk } from "./development/mapbox-sdk.js";

const developmentEnvironment = Object.freeze({
  VITE_MAPBOX_ACCESS_TOKEN: "development-only-token",
  VITE_MAPBOX_CONTAINER_ID: "map",
  VITE_MAPBOX_STYLE: "development://morro-digital",
  VITE_MAPBOX_INITIAL_ZOOM: "14",
});

const status = document.getElementById("runtime-status");
const initialTourMarkers = createMorroTourMarkers("volta-a-ilha");

function updateStatus(message: string): void {
  if (status) status.textContent = message;
}

void startMorroDigitalBrowser({
  sdk: createDevelopmentMapboxSdk(document),
  environment: developmentEnvironment,
  document,
  initialMarkers: initialTourMarkers,
})
  .then((result) => {
    const pointLabel = result.loadedMarkerCount === 1 ? "parada" : "paradas";
    updateStatus(
      `Runtime ativo: ${result.startedModules.join(", ")} — provider ${result.geospatialEngine?.providerId ?? "indisponível"} — ${result.loadedMarkerCount} ${pointLabel} do Passeio Volta à Ilha carregadas.`,
    );
  })
  .catch((error: unknown) => {
    const message =
      error instanceof Error ? error.message : "Falha desconhecida no runtime.";
    updateStatus(`Falha ao iniciar o Morro Digital: ${message}`);
  });
