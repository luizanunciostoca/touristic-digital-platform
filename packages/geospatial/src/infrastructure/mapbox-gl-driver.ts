import type {
  MapboxDriver,
  MapboxMapHandle,
  MapboxMarkerHandle,
} from "../adapters/mapbox.js";

export interface MapboxGlMapLike {
  setCenter(center: readonly [number, number]): void;
  remove(): void;
}

export interface MapboxGlMarkerLike {
  setLngLat(coordinates: readonly [number, number]): MapboxGlMarkerLike;
  addTo(map: MapboxGlMapLike): MapboxGlMarkerLike;
  remove(): void;
}

export interface MapboxGlModuleLike {
  accessToken: string;
  Map: new (options: {
    readonly container: string;
    readonly style: string;
    readonly center: readonly [number, number];
    readonly zoom: number;
  }) => MapboxGlMapLike;
  Marker: new (options?: {
    readonly element?: HTMLElement;
  }) => MapboxGlMarkerLike;
}

export interface MapboxGlDriverOptions {
  readonly sdk: MapboxGlModuleLike;
  readonly accessToken: string;
  readonly createMarkerElement?: (input: {
    readonly id: string;
    readonly label?: string;
  }) => HTMLElement | undefined;
}

function requireAccessToken(token: string): string {
  const normalized = token.trim();
  if (!normalized) throw new Error("Mapbox access token is required.");
  return normalized;
}

export function createMapboxGlDriver(
  options: MapboxGlDriverOptions,
): MapboxDriver {
  const accessToken = requireAccessToken(options.accessToken);
  options.sdk.accessToken = accessToken;

  return Object.freeze({
    createMap(input): MapboxMapHandle {
      const map = new options.sdk.Map({
        container: input.container,
        style: input.style,
        center: input.center,
        zoom: input.zoom,
      });

      return Object.freeze({
        setCenter(center): void {
          map.setCenter(center);
        },
        remove(): void {
          map.remove();
        },
      });
    },

    createMarker(input): MapboxMarkerHandle {
      const element = options.createMarkerElement?.({
        id: input.id,
        ...(input.label ? { label: input.label } : {}),
      });
      const marker = new options.sdk.Marker(element ? { element } : undefined);

      return Object.freeze({
        addTo(map): void {
          marker.setLngLat(input.coordinates).addTo(map as MapboxGlMapLike);
        },
        remove(): void {
          marker.remove();
        },
      });
    },
  });
}
