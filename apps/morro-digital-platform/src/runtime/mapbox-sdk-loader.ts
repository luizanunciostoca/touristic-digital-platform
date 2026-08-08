import type { MapboxGlModuleLike } from "@touristic/geospatial";

export const MAPBOX_GL_VERSION = "3.12.0";
export const MAPBOX_GL_SCRIPT_URL = `https://api.mapbox.com/mapbox-gl-js/v${MAPBOX_GL_VERSION}/mapbox-gl.js`;
export const MAPBOX_GL_STYLE_URL = `https://api.mapbox.com/mapbox-gl-js/v${MAPBOX_GL_VERSION}/mapbox-gl.css`;
export const DEFAULT_MAPBOX_SDK_TIMEOUT_MS = 10_000;

export type MapboxLoaderDocument = Pick<
  Document,
  "head" | "createElement" | "querySelector"
>;

export type MapboxLoaderWindow = Pick<Window, "setTimeout" | "clearTimeout"> & {
  mapboxgl?: MapboxGlModuleLike;
};

export interface LoadMapboxGlSdkOptions {
  readonly document: MapboxLoaderDocument;
  readonly window: MapboxLoaderWindow;
  readonly timeoutMs?: number;
}

function ensureStyles(document: MapboxLoaderDocument): void {
  if (document.querySelector('[data-morro-mapbox-style="true"]')) return;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = MAPBOX_GL_STYLE_URL;
  link.dataset.morroMapboxStyle = "true";
  document.head.appendChild(link);
}

export async function loadMapboxGlSdk(
  options: LoadMapboxGlSdkOptions,
): Promise<MapboxGlModuleLike> {
  if (options.window.mapboxgl) return options.window.mapboxgl;

  ensureStyles(options.document);
  const timeoutMs = options.timeoutMs ?? DEFAULT_MAPBOX_SDK_TIMEOUT_MS;

  return await new Promise<MapboxGlModuleLike>((resolve, reject) => {
    const script = options.document.createElement("script");
    script.src = MAPBOX_GL_SCRIPT_URL;
    script.async = true;
    script.dataset.morroMapboxSdk = "true";

    let settled = false;
    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      options.window.clearTimeout(timeoutHandle);
      callback();
    };

    const timeoutHandle = options.window.setTimeout(() => {
      finish(() => {
        script.remove();
        reject(
          new Error(`Mapbox GL JS loading timed out after ${timeoutMs}ms.`),
        );
      });
    }, timeoutMs);

    script.onload = () => {
      finish(() => {
        const sdk = options.window.mapboxgl;
        if (!sdk) {
          reject(new Error("Mapbox GL JS loaded without exposing mapboxgl."));
          return;
        }
        resolve(sdk);
      });
    };

    script.onerror = () => {
      finish(() => {
        script.remove();
        reject(new Error("Mapbox GL JS failed to load."));
      });
    };

    options.document.head.appendChild(script);
  });
}
