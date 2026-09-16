import { describe, expect, it, vi } from "vitest";

import type { MapboxGlMapLike } from "@touristic/geospatial";

import {
  clearNavigationRoute,
  NAVIGATION_ROUTE_LAYER,
  NAVIGATION_ROUTE_OUTLINE,
  NAVIGATION_ROUTE_SOURCE,
  presentNavigationRoute,
} from "./navigation-route-presentation.js";

function routeData() {
  return {
    type: "NavigationRouteCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: [
            [-38.917, -13.376],
            [-38.916, -13.375],
          ],
        },
      },
    ],
  };
}

function setupMap() {
  const sources = new Set<string>();
  const layers = new Set<string>();
  const sourceInputs: Array<
    Readonly<{ id: string; source: unknown }>
  > = [];
  const addSource = vi.fn((id: string, source: unknown) => {
    sourceInputs.push(Object.freeze({ id, source }));
    sources.add(id);
  });
  const addLayer = vi.fn((layer: unknown) => {
    const id = (layer as Readonly<{ id?: unknown }>).id;
    if (typeof id === "string") layers.add(id);
  });
  const removeSource = vi.fn((id: string) => sources.delete(id));
  const removeLayer = vi.fn((id: string) => layers.delete(id));
  const map: MapboxGlMapLike = {
    setCenter: vi.fn(),
    remove: vi.fn(),
    addSource,
    addLayer,
    getSource: (id) => (sources.has(id) ? {} : undefined),
    getLayer: (id) => (layers.has(id) ? {} : undefined),
    removeSource,
    removeLayer,
  };
  return {
    map,
    addSource,
    addLayer,
    removeSource,
    removeLayer,
    sourceInputs,
  };
}

describe("navigation route presentation", () => {
  it("normalizes navigation route data into valid Mapbox GeoJSON", () => {
    const fixture = setupMap();
    const route = routeData();

    expect(presentNavigationRoute(fixture.map, route)).toBe(true);
    expect(fixture.addSource).toHaveBeenCalledOnce();

    const source = fixture.sourceInputs[0]?.source as
      | Readonly<{ type?: unknown; data?: unknown }>
      | undefined;
    const data = source?.data as
      | Readonly<{ type?: unknown; features?: unknown }>
      | undefined;

    expect(source?.type).toBe("geojson");
    expect(data?.type).toBe("FeatureCollection");
    expect(data?.features).toEqual(route.features);
  });

  it("adds the V1 route outline then route as the topmost new layers", () => {
    const fixture = setupMap();

    expect(presentNavigationRoute(fixture.map, routeData())).toBe(true);
    expect(
      fixture.addLayer.mock.calls.map(
        ([layer]) => (layer as Readonly<{ id?: unknown }>).id,
      ),
    ).toEqual([NAVIGATION_ROUTE_OUTLINE, NAVIGATION_ROUTE_LAYER]);
  });

  it("removes active route layers and source during navigation teardown", () => {
    const fixture = setupMap();
    presentNavigationRoute(fixture.map, routeData());

    clearNavigationRoute(fixture.map);

    expect(fixture.removeLayer).toHaveBeenCalledWith(NAVIGATION_ROUTE_LAYER);
    expect(fixture.removeLayer).toHaveBeenCalledWith(NAVIGATION_ROUTE_OUTLINE);
    expect(fixture.removeSource).toHaveBeenCalledWith(NAVIGATION_ROUTE_SOURCE);
  });

  it("keeps non-Mapbox fallback providers operational", () => {
    const map: MapboxGlMapLike = { setCenter: vi.fn(), remove: vi.fn() };
    expect(presentNavigationRoute(map, routeData())).toBe(false);
    expect(() => clearNavigationRoute(map)).not.toThrow();
  });
});
