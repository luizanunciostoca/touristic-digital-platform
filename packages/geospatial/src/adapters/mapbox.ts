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

function assertUniqueMarkerIds(markers: readonly MapMarker[]): void {
  const ids = new Set<string>();
  for (const marker of markers) {
    if (ids.has(marker.id)) {
      throw new Error(`Duplicate Mapbox marker id: ${marker.id}`);
    }
    ids.add(marker.id);
  }
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

  function createMarkerHandles(
    input: readonly MapMarker[],
    activeMap: MapboxMapHandle,
  ): Map<string, MapboxMarkerHandle> {
    const created = new Map<string, MapboxMarkerHandle>();

    try {
      for (const marker of input) {
        const handle = options.driver
          .createMarker({
            id: marker.id,
            ...(marker.label ? { label: marker.label } : {}),
          })
          .setLngLat([marker.position.longitude, marker.position.latitude])
          .addTo(activeMap);
        created.set(marker.id, handle);
      }
      return created;
    } catch (error) {
      for (const handle of created.values()) handle.remove();
      throw error;
    }
  }

  return Object.freeze({
    id: "mapbox",
    async initialize(input: MapInitializationOptions): Promise<void> {
      if (map) throw new Error("Mapbox adapter is already initialized.");
      map = options.driver.createMap({
        container: input.containerId,
        center: [input.center.longitude, input.center.latitude],
        zoom: input.zoom,
        ...(options.style ? { style: options.style } : {}),
      });
    },
    async setCenter(center: Coordinates): Promise<void> {
      requireMap().setCenter([center.longitude, center.latitude]);
    },
    async addMarkers(input: readonly MapMarker[]): Promise<void> {
      const activeMap = requireMap();
      assertUniqueMarkerIds(input);

      for (const marker of input) {
        if (markers.has(marker.id)) {
          throw new Error(`Mapbox marker already exists: ${marker.id}`);
        }
      }

      const created = createMarkerHandles(input, activeMap);
      for (const [id, handle] of created) markers.set(id, handle);
    },
    async replaceMarkers(input: readonly MapMarker[]): Promise<void> {
      const activeMap = requireMap();
      assertUniqueMarkerIds(input);
      const replacement = createMarkerHandles(input, activeMap);

      for (const handle of markers.values()) handle.remove();
      markers.clear();
      for (const [id, handle] of replacement) markers.set(id, handle);
    },
    async destroy(): Promise<void> {
      for (const marker of markers.values()) marker.remove();
      markers.clear();
      map?.remove();
      map = undefined;
    },
  });
}
