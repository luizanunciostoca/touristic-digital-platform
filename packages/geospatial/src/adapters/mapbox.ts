import type {
  Coordinates,
  MapInitializationOptions,
  MapMarker,
  MapProviderAdapter,
} from "../provider.js";

export interface MapboxMapHandle {
  setCenter(center: [number, number]): void;
  remove(): void;
}

export interface MapboxMarkerHandle {
  setLngLat(position: [number, number]): MapboxMarkerHandle;
  addTo(map: MapboxMapHandle): MapboxMarkerHandle;
  remove(): void;
}

export interface MapboxDriver {
  createMap(input: {
    readonly container: string;
    readonly center: [number, number];
    readonly zoom: number;
    readonly style?: string;
  }): MapboxMapHandle;
  createMarker(input: {
    readonly id: string;
    readonly label?: string;
  }): MapboxMarkerHandle;
}

export interface MapboxAdapterOptions {
  readonly driver: MapboxDriver;
  readonly style?: string;
}

export function createMapboxAdapter(
  options: MapboxAdapterOptions,
): MapProviderAdapter {
  let map: MapboxMapHandle | undefined;
  const markers = new Map<string, MapboxMarkerHandle>();

  function requireMap(): MapboxMapHandle {
    if (!map) throw new Error("Mapbox adapter is not initialized.");
    return map;
  }

  return Object.freeze({
    id: "mapbox",
    initialize(input: MapInitializationOptions): void {
      if (map) throw new Error("Mapbox adapter is already initialized.");
      map = options.driver.createMap({
        container: input.container,
        center: [input.center.longitude, input.center.latitude],
        zoom: input.zoom,
        ...(options.style ? { style: options.style } : {}),
      });
    },
    setCenter(center: Coordinates): void {
      requireMap().setCenter([center.longitude, center.latitude]);
    },
    addMarkers(input: readonly MapMarker[]): void {
      const activeMap = requireMap();
      for (const marker of input) {
        if (markers.has(marker.id)) {
          throw new Error(`Mapbox marker already exists: ${marker.id}`);
        }
        const handle = options.driver
          .createMarker({ id: marker.id, ...(marker.label ? { label: marker.label } : {}) })
          .setLngLat([marker.position.longitude, marker.position.latitude])
          .addTo(activeMap);
        markers.set(marker.id, handle);
      }
    },
    destroy(): void {
      for (const marker of markers.values()) marker.remove();
      markers.clear();
      map?.remove();
      map = undefined;
    },
  });
}
