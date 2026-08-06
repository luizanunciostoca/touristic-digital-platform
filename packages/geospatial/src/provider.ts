export interface Coordinates {
  readonly latitude: number;
  readonly longitude: number;
}

export interface MapInitializationOptions {
  readonly containerId: string;
  readonly center: Coordinates;
  readonly zoom: number;
}

export interface MapMarker {
  readonly id: string;
  readonly position: Coordinates;
  readonly label?: string;
}

export interface MapProviderAdapter {
  readonly id: string;
  initialize(options: MapInitializationOptions): Promise<void>;
  setCenter(center: Coordinates): Promise<void>;
  addMarkers(markers: readonly MapMarker[]): Promise<void>;
  replaceMarkers(markers: readonly MapMarker[]): Promise<void>;
  destroy(): Promise<void>;
}

export interface GeospatialEngine {
  readonly providerId: string;
  readonly initialized: boolean;
  initialize(options: MapInitializationOptions): Promise<void>;
  setCenter(center: Coordinates): Promise<void>;
  addMarkers(markers: readonly MapMarker[]): Promise<void>;
  replaceMarkers(markers: readonly MapMarker[]): Promise<void>;
  destroy(): Promise<void>;
}

function assertCoordinates(coordinates: Coordinates): void {
  if (
    !Number.isFinite(coordinates.latitude) ||
    coordinates.latitude < -90 ||
    coordinates.latitude > 90
  ) {
    throw new Error("Latitude must be between -90 and 90.");
  }
  if (
    !Number.isFinite(coordinates.longitude) ||
    coordinates.longitude < -180 ||
    coordinates.longitude > 180
  ) {
    throw new Error("Longitude must be between -180 and 180.");
  }
}

function normalizeMarkers(markers: readonly MapMarker[]): readonly MapMarker[] {
  const ids = new Set<string>();
  const normalized = markers.map((marker) => {
    if (!marker.id.trim()) throw new Error("Marker id is required.");
    if (ids.has(marker.id)) {
      throw new Error(`Duplicate marker id: ${marker.id}`);
    }
    ids.add(marker.id);
    assertCoordinates(marker.position);
    return Object.freeze({
      ...marker,
      position: Object.freeze({ ...marker.position }),
    });
  });

  return Object.freeze(normalized);
}

export function createGeospatialEngine(
  provider: MapProviderAdapter,
): GeospatialEngine {
  let initialized = false;

  return {
    providerId: provider.id,
    get initialized() {
      return initialized;
    },
    async initialize(options) {
      if (!options.containerId.trim()) {
        throw new Error("Map container id is required.");
      }
      if (
        !Number.isFinite(options.zoom) ||
        options.zoom < 0 ||
        options.zoom > 24
      ) {
        throw new Error("Map zoom must be between 0 and 24.");
      }
      assertCoordinates(options.center);
      await provider.initialize(
        Object.freeze({
          ...options,
          center: Object.freeze({ ...options.center }),
        }),
      );
      initialized = true;
    },
    async setCenter(center) {
      if (!initialized) {
        throw new Error("Geospatial engine is not initialized.");
      }
      assertCoordinates(center);
      await provider.setCenter(Object.freeze({ ...center }));
    },
    async addMarkers(markers) {
      if (!initialized) {
        throw new Error("Geospatial engine is not initialized.");
      }
      await provider.addMarkers(normalizeMarkers(markers));
    },
    async replaceMarkers(markers) {
      if (!initialized) {
        throw new Error("Geospatial engine is not initialized.");
      }
      await provider.replaceMarkers(normalizeMarkers(markers));
    },
    async destroy() {
      await provider.destroy();
      initialized = false;
    },
  };
}
