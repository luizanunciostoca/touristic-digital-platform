export type MapProvider = "mapbox" | "leaflet";
export type RoutingProvider = "mapbox-directions" | "openrouteservice";

export interface GeospatialPolicy {
  readonly mapProvider: MapProvider;
  readonly routingPrimary: RoutingProvider;
  readonly routingFallback: RoutingProvider;
  readonly legacyFallbackEnabled: boolean;
}

export const defaultGeospatialPolicy: GeospatialPolicy = {
  mapProvider: "mapbox",
  routingPrimary: "mapbox-directions",
  routingFallback: "openrouteservice",
  legacyFallbackEnabled: true,
};

export {
  createMapboxAdapter,
  type MapboxAdapterOptions,
  type MapboxDriver,
  type MapboxMapHandle,
  type MapboxMarkerHandle,
} from "./adapters/mapbox.js";

export {
  createMapboxGlDriver,
  type MapboxGlDriverOptions,
  type MapboxGlMapLike,
  type MapboxGlMarkerLike,
  type MapboxGlModuleLike,
} from "./infrastructure/mapbox-gl-driver.js";

export {
  createGeospatialEngine,
  type Coordinates,
  type GeospatialEngine,
  type MapInitializationOptions,
  type MapMarker,
  type MapProviderAdapter,
} from "./provider.js";
