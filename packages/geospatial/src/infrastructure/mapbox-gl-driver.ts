import type {
  MapboxDriver,
  MapboxMapHandle,
  MapboxMarkerHandle,
} from "../adapters/mapbox.js";

export interface MapboxGlMapLike {
  setCenter(center: [number, number]): void;
  remove(): void;
  isStyleLoaded?(): boolean;
  once?(event: string, listener: () => void): void;
  getLayer?(id: string): unknown;
  removeLayer?(id: string): void;
  getSource?(id: string): unknown;
  removeSource?(id: string): void;
  addSource?(id: string, source: unknown): void;
  addLayer?(layer: unknown): void;
  fitBounds?(
    bounds: [[number, number], [number, number]],
    options?: {
      readonly padding?:
        | number
        | Readonly<{
            top: number;
            bottom: number;
            left: number;
            right: number;
          }>;
      readonly pitch?: number;
      readonly bearing?: number;
      readonly duration?: number;
      readonly essential?: boolean;
    },
  ): void;
}

export interface MapboxGlMarkerLike {
  setLngLat(coordinates: [number, number]): MapboxGlMarkerLike;
  addTo(map: MapboxGlMapLike): MapboxGlMarkerLike;
  remove(): void;
}

export interface MapboxGlNativeMapOptions {
  readonly pitch?: number;
  readonly bearing?: number;
  readonly antialias?: boolean;
  readonly attributionControl?: boolean;
  readonly minZoom?: number;
  readonly maxZoom?: number;
  readonly projection?: string;
}

export interface MapboxGlModuleLike {
  accessToken: string;
  readonly version?: string;
  Map: new (options: {
    readonly container: string;
    readonly style?: string;
    readonly center: [number, number];
    readonly zoom: number;
    readonly pitch?: number;
    readonly bearing?: number;
    readonly antialias?: boolean;
    readonly attributionControl?: boolean;
    readonly minZoom?: number;
    readonly maxZoom?: number;
    readonly projection?: string;
  }) => MapboxGlMapLike;
  Marker: new (options?: {
    readonly element?: HTMLElement;
    readonly anchor?: string;
  }) => MapboxGlMarkerLike;
}

export interface MapboxGlDriverOptions {
  readonly sdk: MapboxGlModuleLike;
  readonly accessToken: string;
  readonly mapOptions?: MapboxGlNativeMapOptions;
  readonly createMarkerElement?: (input: {
    readonly id: string;
    readonly label?: string;
  }) => HTMLElement | undefined;
  readonly onMapCreated?: (map: MapboxGlMapLike) => void;
}

type MapboxCreateMapInput = Parameters<MapboxDriver["createMap"]>[0];
type MapboxCreateMarkerInput = Parameters<MapboxDriver["createMarker"]>[0];

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
    createMap(input: MapboxCreateMapInput): MapboxMapHandle {
      const map = new options.sdk.Map({
        container: input.container,
        ...(input.style ? { style: input.style } : {}),
        center: input.center,
        zoom: input.zoom,
        ...options.mapOptions,
      });
      options.onMapCreated?.(map);

      const handle: MapboxMapHandle = Object.freeze({
        setCenter(center: [number, number]): void {
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

    createMarker(input: MapboxCreateMarkerInput): MapboxMarkerHandle {
      const element = options.createMarkerElement?.({
        id: input.id,
        ...(input.label ? { label: input.label } : {}),
      });
      const marker = new options.sdk.Marker(
        element ? { element, anchor: "bottom" } : undefined,
      );

      const handle: MapboxMarkerHandle = Object.freeze({
        setLngLat(position: [number, number]): MapboxMarkerHandle {
          marker.setLngLat(position);
          return handle;
        },
        addTo(mapHandle: MapboxMapHandle): MapboxMarkerHandle {
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
