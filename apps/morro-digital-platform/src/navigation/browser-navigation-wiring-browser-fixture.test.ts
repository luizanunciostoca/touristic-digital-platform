import { describe, expect, it, vi } from "vitest";

import type {
  MapboxGlMapLike,
  MapboxGlMarkerLike,
  MapboxGlModuleLike,
} from "@touristic/geospatial";
import type { NavigationRuntimeSnapshot } from "@touristic/navigation";

import type { BrowserGeolocationDriver } from "./browser-geolocation.js";
import { createBrowserNavigationWiring } from "./browser-navigation-wiring.js";

const ROUTE = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {
        summary: { distance: 390, duration: 290 },
        segments: [
          {
            distance: 390,
            duration: 290,
            steps: [
              {
                distance: 92,
                duration: 68,
                instruction: "Continue em frente",
                name: "Caminho principal",
                way_points: [0, 1],
                maneuver: {
                  instruction: "Continue em frente",
                  type: "continue",
                },
              },
              {
                distance: 126,
                duration: 94,
                instruction: "Vire à direita",
                name: "Rua da Fonte",
                way_points: [1, 2],
                maneuver: {
                  instruction: "Vire à direita",
                  type: "turn-right",
                },
              },
              {
                distance: 172,
                duration: 128,
                instruction: "Continue até o destino",
                name: "Destino",
                way_points: [2, 3],
                maneuver: {
                  instruction: "Continue até o destino",
                  type: "arrive",
                },
              },
            ],
          },
        ],
      },
      geometry: {
        type: "LineString",
        coordinates: [
          [-38.9172, -13.3762],
          [-38.91655, -13.37565],
          [-38.91575, -13.37485],
          [-38.9148, -13.374],
        ],
      },
    },
  ],
} as const;

function browserPosition(): GeolocationPosition {
  return {
    coords: {
      latitude: -13.37615,
      longitude: -38.91715,
      accuracy: 0,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: 0,
      toJSON: () => ({}),
    },
    timestamp: 1_000,
    toJSON: () => ({}),
  };
}

describe("browser navigation wiring deterministic browser fixture", () => {
  it("publishes a snapshot and drives the V1 camera contract", () => {
    let watchSuccess: ((position: GeolocationPosition) => void) | null = null;
    const geolocationDriver: BrowserGeolocationDriver = {
      watchPosition(success) {
        watchSuccess = success;
        return 7;
      },
      getCurrentPosition: vi.fn(),
      clearWatch: vi.fn(),
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
    class Marker implements MapboxGlMarkerLike {
      setLngLat(): MapboxGlMarkerLike {
        return this;
      }
      setRotation(): this {
        return this;
      }
      addTo(): MapboxGlMarkerLike {
        return this;
      }
      remove(): void {}
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
    const onSnapshot = vi.fn<(snapshot: NavigationRuntimeSnapshot) => void>();
    const wiring = createBrowserNavigationWiring({
      map,
      sdk,
      routeData: ROUTE,
      sessionId: 1,
      destination: { longitude: -38.9148, latitude: -13.374 },
      geolocationDriver,
      onSnapshot,
    });

    wiring.start();
    const emitLocation = watchSuccess;
    if (!emitLocation) throw new Error("watchPosition was not started");
    emitLocation(browserPosition());

    expect(onSnapshot).toHaveBeenCalledTimes(1);
    const snapshot = onSnapshot.mock.calls[0]?.[0];
    expect(snapshot?.totalDistance).toBe(390);
    expect(snapshot?.totalDuration).toBe(290);
    expect(snapshot?.guidance.instruction).toBe("Continue em frente");
    expect(snapshot?.guidance.totalSteps).toBe(3);
    expect(easeTo).toHaveBeenCalledWith(
      expect.objectContaining({
        pitch: 68,
        duration: 650,
        retainPadding: false,
        essential: true,
      }),
    );
  });
});
