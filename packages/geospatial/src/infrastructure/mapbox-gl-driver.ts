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
  const nativeMaps = new WeakMap<MapboxMapHandle, MapboxGlMapLike>();

  return Object.freeze({
    createMap(input): MapboxMapHandle {
      const map = new options.sdk.Map({
        container: input.container,
        ...(input.style ? { style: input.style } : {}),
        center: input.center,
        zoom: input.zoom,
      });

      let handle: MapboxMapHandle;
      handle = Object.freeze({
        setCenter(center): void {
          map.setCenter(center);
        },
        remove(): void {
          nativeMaps.delete(handle);
          map.remove();
        },
      });
      nativeMaps.set(handle, map);
      return handle;
    },

    createMarker(input): MapboxMarkerHandle {
      const element = options.createMarkerElement?.({
        id: input.id,
        ...(input.label ? { label: input.label } : {}),
      });
      const marker = new options.sdk.Marker(element ? { element } : undefined);

      let handle: MapboxMarkerHandle;
      handle = Object.freeze({
        setLngLat(position): MapboxMarkerHandle {
          marker.setLngLat(position);
          return handle;
        },
        addTo(mapHandle): MapboxMarkerHandle {
          const nativeMap = nativeMaps.get(mapHandle);
          if (!nativeMap) throw new Error("Unknown Mapbox map handle.");
          marker.addTo(nativeMap);
          return handle;
        },
        remove(): void {
          marker.remove();
        },
      });
      return handle;
    },
  });
}
