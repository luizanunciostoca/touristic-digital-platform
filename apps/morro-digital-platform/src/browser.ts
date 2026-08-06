import type { MapboxGlModuleLike, MapMarker } from "@touristic/geospatial";
import { createMorroGeospatialInitializer } from "./bootstrap/geospatial.js";
import {
  bootstrapMorroDigital,
  type BootstrapResult,
} from "./bootstrap/runtime.js";
import {
  loadMorroMapboxRuntimeConfig,
  type RuntimeEnvironment,
} from "./config/mapbox-runtime.js";

export interface BrowserMapContainer {
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
}

export interface BrowserDocument {
  getElementById(id: string): BrowserMapContainer | null;
}

export interface StartMorroDigitalBrowserOptions {
  readonly sdk: MapboxGlModuleLike;
  readonly environment: RuntimeEnvironment;
  readonly document: BrowserDocument;
  readonly initialMarkers?: readonly MapMarker[];
  readonly createMarkerElement?: (input: {
    readonly id: string;
    readonly label?: string;
  }) => HTMLElement | undefined;
}

export async function startMorroDigitalBrowser(
  options: StartMorroDigitalBrowserOptions,
): Promise<BootstrapResult> {
  const config = loadMorroMapboxRuntimeConfig(options.environment);
  const container = options.document.getElementById(config.containerId);

  if (!container) {
    throw new Error(`Map container was not found: ${config.containerId}.`);
  }

  container.setAttribute("aria-busy", "true");
  container.setAttribute("data-map-state", "initializing");

  try {
    const result = await bootstrapMorroDigital({
      initializeGeospatial: createMorroGeospatialInitializer({
        sdk: options.sdk,
        ...config,
        ...(options.createMarkerElement
          ? { createMarkerElement: options.createMarkerElement }
          : {}),
      }),
      ...(options.initialMarkers
        ? { initialMarkers: options.initialMarkers }
        : {}),
    });

    container.setAttribute(
      "data-map-provider",
      result.geospatialEngine?.providerId ?? "unknown",
    );
    container.setAttribute(
      "data-map-marker-count",
      String(result.loadedMarkerCount),
    );
    container.setAttribute("data-map-state", "ready");
    return result;
  } catch (error) {
    container.setAttribute("data-map-state", "error");
    throw error;
  } finally {
    container.removeAttribute("aria-busy");
  }
}
