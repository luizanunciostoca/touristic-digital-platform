import type {
  MapboxDriver,
  MapboxMapHandle,
  MapboxMarkerHandle,
} from "../adapters/mapbox.js";

export interface MapboxGlMapLike {
  setCenter(center: [number, number]): void;
  remove(): void;
}

export interface MapboxGlMarkerLike {
  setLngLat(coordinates: [number, number]): MapboxGlMarkerLike;
  addTo(map: MapboxGlMapLike): MapboxGlMarkerLike;
  remove(): void;
}

export interface MapboxGlModuleLike {
  accessToken: string;
  Map: new (options: {
    readonly container: string;
    readonly style?: string;
    readonly center: [number, number];
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
  options.sdk.accessToken = requireAccessToken(options.accessToken);

  return Object.freeze({
    createMap(input): MapboxMapHandle {
      const map = new options.sdk.Map({
        container: input.container,
        ...(input.style ? { style: input.style } : {}),
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
        setLngLat(position): MapboxMarkerHandle {
          marker.setLngLat(position);
          return this;
        },
        addTo(map): MapboxMarkerHandle {
          marker.addTo(map as unknown as MapboxGlMapLike);
          return this;
        },
        remove(): void {
          marker.remove();
        },
      });
    },
  });
}
