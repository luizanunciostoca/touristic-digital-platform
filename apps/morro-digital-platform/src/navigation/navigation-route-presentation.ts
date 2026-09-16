import type { MapboxGlMapLike } from "@touristic/geospatial";

export const NAVIGATION_ROUTE_SOURCE = "navigation-route-source";
export const NAVIGATION_ROUTE_OUTLINE = "navigation-route-outline";
export const NAVIGATION_ROUTE_LAYER = "navigation-route-layer";

export const NAVIGATION_ROUTE_OUTLINE_PAINT = Object.freeze({
  "line-color": "#0f4c81",
  "line-width": 9,
  "line-opacity": 0.35,
  "line-dasharray": Object.freeze([2, 2] as const),
});

export const NAVIGATION_ROUTE_PAINT = Object.freeze({
  "line-color": "#06b6d4",
  "line-width": 5,
  "line-opacity": 0.9,
  "line-dasharray": Object.freeze([2, 1.5] as const),
});

function hasRouteFeatures(routeData: unknown): routeData is Readonly<{
  type?: string;
  features: readonly unknown[];
}> {
  if (!routeData || typeof routeData !== "object") return false;
  const features = Reflect.get(routeData, "features");
  return Array.isArray(features) && features.length > 0;
}

export function clearNavigationRoute(map: MapboxGlMapLike): void {
  if (map.getLayer?.(NAVIGATION_ROUTE_LAYER)) {
    map.removeLayer?.(NAVIGATION_ROUTE_LAYER);
  }
  if (map.getLayer?.(NAVIGATION_ROUTE_OUTLINE)) {
    map.removeLayer?.(NAVIGATION_ROUTE_OUTLINE);
  }
  if (map.getSource?.(NAVIGATION_ROUTE_SOURCE)) {
    map.removeSource?.(NAVIGATION_ROUTE_SOURCE);
  }
}

export function presentNavigationRoute(
  map: MapboxGlMapLike,
  routeData: unknown,
): boolean {
  if (!map.addSource || !map.addLayer || !hasRouteFeatures(routeData)) {
    return false;
  }

  clearNavigationRoute(map);

  try {
    map.addSource(NAVIGATION_ROUTE_SOURCE, {
      type: "geojson",
      data: routeData,
    });
    map.addLayer({
      id: NAVIGATION_ROUTE_OUTLINE,
      type: "line",
      source: NAVIGATION_ROUTE_SOURCE,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: NAVIGATION_ROUTE_OUTLINE_PAINT,
    });
    map.addLayer({
      id: NAVIGATION_ROUTE_LAYER,
      type: "line",
      source: NAVIGATION_ROUTE_SOURCE,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: NAVIGATION_ROUTE_PAINT,
    });
    return true;
  } catch (error) {
    clearNavigationRoute(map);
    throw error;
  }
}
