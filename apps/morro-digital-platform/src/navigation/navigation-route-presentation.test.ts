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
    type: "FeatureCollection",
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
  const addSource = vi.fn((id: string) => sources.add(id));
  const addLayer = vi.fn((layer: unknown) => {
    const id = Reflect.get(layer as object, "id");
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
  return { map, addSource, addLayer, removeSource, removeLayer };
}

describe("navigation route presentation", () => {
  it("adds the V1 route outline then route as the topmost new layers", () => {
    const fixture = setupMap();

    expect(presentNavigationRoute(fixture.map, routeData())).toBe(true);
    expect(fixture.addSource).toHaveBeenCalledWith(
      NAVIGATION_ROUTE_SOURCE,
      expect.objectContaining({ type: "geojson" }),
    );
    expect(
      fixture.addLayer.mock.calls.map(([layer]) =>
        Reflect.get(layer as object, "id"),
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
