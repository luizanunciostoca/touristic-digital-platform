export type MapProviderId = "mapbox" | "leaflet";
export type RoutingProvider = "mapbox-directions" | "openrouteservice";

export interface GeoPoint {
  readonly latitude: number;
  readonly longitude: number;
}

export interface MapCamera {
  readonly center: GeoPoint;
  readonly zoom: number;
  readonly bearing?: number;
  readonly pitch?: number;
}

export interface MapBounds {
  readonly southWest: GeoPoint;
  readonly northEast: GeoPoint;
}

export interface MapMarker {
  readonly id: string;
  readonly position: GeoPoint;
  readonly label?: string;
  readonly category?: string;
  readonly icon?: string;
  readonly priority?: number;
  readonly selected?: boolean;
}

export interface MapLayer {
  readonly id: string;
  readonly type: "base" | "poi" | "business" | "event" | "route" | "heatmap";
  readonly visible: boolean;
}

export interface MapProvider {
  initialize(container: HTMLElement, camera: MapCamera): void;
  destroy(): void;
  setCamera(camera: MapCamera): void;
  getCamera(): MapCamera;
  fitBounds(bounds: MapBounds): void;
  addLayer(layer: MapLayer): void;
  removeLayer(layerId: string): void;
  addMarker(marker: MapMarker): void;
  removeMarker(markerId: string): void;
  clearMarkers(): void;
}

export interface GeospatialPolicy {
  readonly mapProvider: MapProviderId;
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

export function isValidGeoPoint(point: GeoPoint): boolean {
  return (
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    point.latitude >= -90 &&
    point.latitude <= 90 &&
    point.longitude >= -180 &&
    point.longitude <= 180
  );
}
