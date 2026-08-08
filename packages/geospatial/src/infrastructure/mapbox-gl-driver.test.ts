import { describe, expect, it, vi } from "vitest";

import {
  createMapboxGlDriver,
  type MapboxGlModuleLike,
} from "./mapbox-gl-driver.js";

function createSdk() {
  const setCenter = vi.fn();
  const removeMap = vi.fn();
  const setLngLat = vi.fn();
  const addTo = vi.fn();
  const removeMarker = vi.fn();
  const mapInstances: unknown[] = [];

  class Map {
    constructor(readonly options: unknown) {
      mapInstances.push(this);
    }
    setCenter = setCenter;
    remove = removeMap;
  }

  class Marker {
    constructor(readonly options?: unknown) {}
    setLngLat(position: [number, number]) {
      setLngLat(position);
      return this;
    }
    addTo(map: InstanceType<typeof Map>) {
      addTo(map);
      return this;
    }
    remove = removeMarker;
  }

  const sdk = { accessToken: "", Map, Marker } as unknown as MapboxGlModuleLike;
  return {
    sdk,
    setCenter,
    removeMap,
    setLngLat,
    addTo,
    removeMarker,
    mapInstances,
  };
}

describe("createMapboxGlDriver", () => {
  it("configures the access token and forwards map operations", () => {
    const fixture = createSdk();
    const driver = createMapboxGlDriver({
      sdk: fixture.sdk,
      accessToken: "token-123",
    });

    const map = driver.createMap({
      container: "map",
      center: [-38.9167, -13.3833],
      zoom: 14,
      style: "mapbox://styles/mapbox/streets-v12",
    });

    expect(fixture.sdk.accessToken).toBe("token-123");
    map.setCenter([-38.91, -13.38]);
    map.remove();
    expect(fixture.setCenter).toHaveBeenCalledWith([-38.91, -13.38]);
    expect(fixture.removeMap).toHaveBeenCalledOnce();
  });

  it("forwards native visual options to the Mapbox constructor", () => {
    const fixture = createSdk();
    const driver = createMapboxGlDriver({
      sdk: fixture.sdk,
      accessToken: "token-123",
      mapOptions: {
        pitch: 0,
        bearing: 0,
        antialias: true,
        attributionControl: false,
        minZoom: 0,
        maxZoom: 20,
        projection: "globe",
      },
    });

    driver.createMap({
      container: "map",
      center: [-38.9159969, -13.4],
      zoom: 13.5,
      style: "mapbox://styles/mapbox/streets-v12",
    });

    const nativeMap = fixture.mapInstances[0] as { options: unknown };
    expect(nativeMap.options).toEqual({
      container: "map",
      center: [-38.9159969, -13.4],
      zoom: 13.5,
      style: "mapbox://styles/mapbox/streets-v12",
      pitch: 0,
      bearing: 0,
      antialias: true,
      attributionControl: false,
      minZoom: 0,
      maxZoom: 20,
      projection: "globe",
    });
  });

  it("forwards marker lifecycle to the native SDK map", () => {
    const fixture = createSdk();
    const driver = createMapboxGlDriver({
      sdk: fixture.sdk,
      accessToken: "token-123",
    });
    const map = driver.createMap({
      container: "map",
      center: [-38.9167, -13.3833],
      zoom: 14,
    });

    driver
      .createMarker({ id: "poi-1", label: "Farol" })
      .setLngLat([-38.914, -13.377])
      .addTo(map)
      .remove();

    expect(fixture.setLngLat).toHaveBeenCalledWith([-38.914, -13.377]);
    expect(fixture.addTo).toHaveBeenCalledWith(fixture.mapInstances[0]);
    expect(fixture.removeMarker).toHaveBeenCalledOnce();
  });

  it("rejects unknown or already removed map handles", () => {
    const fixture = createSdk();
    const driver = createMapboxGlDriver({
      sdk: fixture.sdk,
      accessToken: "token-123",
    });
    const map = driver.createMap({
      container: "map",
      center: [0, 0],
      zoom: 10,
    });
    const marker = driver.createMarker({ id: "poi-1" });

    map.remove();

    expect(() => marker.addTo(map)).toThrow("Unknown Mapbox map handle.");
  });

  it("rejects empty access tokens", () => {
    const fixture = createSdk();
    expect(() =>
      createMapboxGlDriver({ sdk: fixture.sdk, accessToken: "   " }),
    ).toThrow("Mapbox access token is required.");
  });
});
