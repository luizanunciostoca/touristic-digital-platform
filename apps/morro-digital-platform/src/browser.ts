import type {
  MapboxGlMapLike,
  MapboxGlModuleLike,
  MapMarker,
} from "@touristic/geospatial";
import { createMorroGeospatialInitializer } from "./bootstrap/geospatial.js";
import {
  bootstrapMorroDigital,
  type BootstrapResult,
} from "./bootstrap/runtime.js";
import {
  loadMorroMapboxRuntimeConfig,
  type RuntimeEnvironment,
} from "./config/mapbox-runtime.js";
import {
  installBrowserNavigationRuntime,
  type BrowserNavigationRuntimeInstall,
} from "./navigation/browser-navigation-runtime-install.js";

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
  readonly onMapCreated?: (map: MapboxGlMapLike) => void;
}

const degradedNavigationByDocument = new WeakMap<
  object,
  BrowserNavigationRuntimeInstall
>();

function asDomDocument(document: BrowserDocument): Document | null {
  const candidate = document as BrowserDocument & Partial<Document>;
  return typeof candidate.createElement === "function" && candidate.body
    ? (candidate as Document)
    : null;
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
  let degradedNavigation: BrowserNavigationRuntimeInstall | null = null;

  try {
    const domDocument = asDomDocument(options.document);
    const onMapCreated =
      options.onMapCreated ??
      (domDocument
        ? (map: MapboxGlMapLike) => {
            degradedNavigationByDocument.get(domDocument)?.destroy();
            degradedNavigation = installBrowserNavigationRuntime({
              map,
              sdk: options.sdk,
              document: domDocument,
            });
            degradedNavigationByDocument.set(
              domDocument,
              degradedNavigation,
            );
          }
        : undefined);

    const result = await bootstrapMorroDigital({
      initializeGeospatial: createMorroGeospatialInitializer({
        sdk: options.sdk,
        ...config,
        ...(options.createMarkerElement
          ? { createMarkerElement: options.createMarkerElement }
          : {}),
        ...(onMapCreated ? { onMapCreated } : {}),
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
    degradedNavigation?.destroy();
    const domDocument = asDomDocument(options.document);
    if (
      domDocument &&
      degradedNavigationByDocument.get(domDocument) === degradedNavigation
    ) {
      degradedNavigationByDocument.delete(domDocument);
    }
    container.setAttribute("data-map-state", "error");
    throw error;
  } finally {
    container.removeAttribute("aria-busy");
  }
}
