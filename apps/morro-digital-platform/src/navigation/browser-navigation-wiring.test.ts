import { describe, expect, it, vi } from "vitest";

import type {
  MapboxGlMapLike,
  MapboxGlMarkerLike,
  MapboxGlModuleLike,
} from "@touristic/geospatial";

import type { BrowserGeolocationDriver } from "./browser-geolocation.js";
import { createBrowserNavigationWiring } from "./browser-navigation-wiring.js";

function routeData() {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { distance: 100, duration: 80 },
        geometry: {
          type: "LineString",
          coordinates: [
            [-38.917, -13.376],
            [-38.9165, -13.3755],
          ],
        },
      },
    ],
  };
}

function position(
  latitude = -13.376,
  longitude = -38.917,
): GeolocationPosition {
  return {
    coords: {
      latitude,
      longitude,
      accuracy: 5,
      altitude: null,
      altitudeAccuracy: null,
      heading: 90,
      speed: 1,
      toJSON: () => ({}),
    },
    timestamp: Date.now(),
    toJSON: () => ({}),
  };
}

function setup() {
  let watchSuccess: ((value: GeolocationPosition) => void) | null = null;
  const clearWatch = vi.fn<(id: number) => void>();
  const geolocationDriver: BrowserGeolocationDriver = {
    watchPosition(success) {
      watchSuccess = success;
      return 7;
    },
    getCurrentPosition: vi.fn(),
    clearWatch,
  };

  const easeTo = vi.fn();
  const map: MapboxGlMapLike & {
    easeTo: typeof easeTo;
    getContainer: () => { clientWidth: number; clientHeight: number };
  } = {
    setCenter: vi.fn(),
    remove: vi.fn(),
    easeTo,
    getContainer: () => ({ clientWidth: 390, clientHeight: 844 }),
  };

  const markerSetLngLat = vi.fn();
  const markerSetRotation = vi.fn();
  const markerAddTo = vi.fn();
  const markerRemove = vi.fn();

  class Marker implements MapboxGlMarkerLike {
    setLngLat(coordinates: [number, number]): MapboxGlMarkerLike {
      markerSetLngLat(coordinates);
      return this;
    }
    setRotation(bearing: number): this {
      markerSetRotation(bearing);
      return this;
    }
    addTo(input: MapboxGlMapLike): MapboxGlMarkerLike {
      markerAddTo(input);
      return this;
    }
    remove(): void {
      markerRemove();
    }
  }

  const sdk: MapboxGlModuleLike = {
    accessToken: "token",
    Map: class {
      constructor() {
        return map;
      }
    } as unknown as MapboxGlModuleLike["Map"],
    Marker,
  };

  const wiring = createBrowserNavigationWiring({
    map,
    sdk,
    routeData: routeData(),
    geolocationDriver,
  });

  return {
    wiring,
    map,
    easeTo,
    clearWatch,
    markerSetLngLat,
    markerSetRotation,
    markerAddTo,
    markerRemove,
    emitLocation(value = position()) {
      if (!watchSuccess) throw new Error("watch not started");
      watchSuccess(value);
    },
  };
}

describe("browser navigation wiring", () => {
  it("rejects maps that cannot perform navigation camera updates", () => {
    const map: MapboxGlMapLike = { setCenter: vi.fn(), remove: vi.fn() };
    const sdk = {
      accessToken: "token",
      Map: vi.fn(),
      Marker: vi.fn(),
    } as unknown as MapboxGlModuleLike;

    expect(() =>
      createBrowserNavigationWiring({ map, sdk, routeData: routeData() }),
    ).toThrow("Mapbox map does not support navigation camera updates.");
  });

  it("connects geolocation updates to marker and first-person camera", () => {
    const context = setup();
    context.wiring.start();
    context.emitLocation();

    expect(context.markerAddTo).toHaveBeenCalledWith(context.map);
    expect(context.markerSetLngLat).toHaveBeenCalledWith([-38.917, -13.376]);
    expect(context.markerSetRotation).toHaveBeenCalled();
    expect(context.easeTo).toHaveBeenCalledWith(
      expect.objectContaining({ pitch: 68, essential: true }),
    );
  });

  it("tears down geolocation and marker through composition stop", () => {
    const context = setup();
    context.wiring.start();
    context.emitLocation();
    context.wiring.stop();

    expect(context.clearWatch).toHaveBeenCalledWith(7);
    expect(context.markerRemove).toHaveBeenCalledTimes(1);
  });
});
