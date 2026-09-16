import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  MapboxGlMapLike,
  MapboxGlMarkerLike,
  MapboxGlModuleLike,
} from "@touristic/geospatial";

import type { BrowserGeolocationDriver } from "./browser-geolocation.js";
import { createBrowserNavigationWiring } from "./browser-navigation-wiring.js";

class FakeElement {
  readonly attributes = new Map<string, string>();
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  className = "";

  constructor(readonly tagName: string) {}

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  append(...children: FakeElement[]): void {
    this.children.push(...children);
  }

  appendChild(child: FakeElement): FakeElement {
    this.children.push(child);
    return child;
  }
}

function installFakeDocument(): void {
  vi.stubGlobal("document", {
    createElement(tagName: string) {
      return new FakeElement(tagName);
    },
    createElementNS(_namespace: string, tagName: string) {
      return new FakeElement(tagName);
    },
  });
}

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

function position(): GeolocationPosition {
  return {
    coords: {
      latitude: -13.376,
      longitude: -38.917,
      accuracy: 5,
      altitude: null,
      altitudeAccuracy: null,
      heading: 90,
      speed: 1,
      toJSON: () => ({}),
    },
    timestamp: 1_000,
    toJSON: () => ({}),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("V1 navigation user marker parity", () => {
  it("uses the V1 red 56px arrow and map-aligned first-person behavior", () => {
    installFakeDocument();

    let emitLocation: (value: GeolocationPosition) => void = () => {
      throw new Error("watchPosition was not started");
    };
    const geolocationDriver: BrowserGeolocationDriver = {
      watchPosition(success) {
        emitLocation = success;
        return 7;
      },
      getCurrentPosition: vi.fn(),
      clearWatch: vi.fn(),
    };

    const map: MapboxGlMapLike & {
      easeTo: ReturnType<typeof vi.fn>;
      getContainer: () => { clientWidth: number; clientHeight: number };
    } = {
      setCenter: vi.fn(),
      remove: vi.fn(),
      easeTo: vi.fn(),
      getContainer: () => ({ clientWidth: 390, clientHeight: 844 }),
    };

    let markerOptions: unknown;
    class Marker implements MapboxGlMarkerLike {
      constructor(options?: {
        readonly element?: HTMLElement;
        readonly anchor?: string;
      }) {
        markerOptions = options;
      }
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

    const wiring = createBrowserNavigationWiring({
      map,
      sdk,
      routeData: routeData(),
      geolocationDriver,
    });

    wiring.start();
    emitLocation(position());

    const options = markerOptions as {
      element?: FakeElement;
      anchor?: string;
      rotationAlignment?: string;
      pitchAlignment?: string;
    };
    expect(options.anchor).toBe("center");
    expect(options.rotationAlignment).toBe("map");
    expect(options.pitchAlignment).toBe("viewport");

    const root = options.element;
    expect(root?.className).toContain("mapbox-user-marker");
    expect(root?.className).toContain("navigation-user-location-marker");
    expect(root?.dataset.navigationUserMarker).toBe("true");

    const dot = root?.children[0];
    const svg = dot?.children[0];
    const circle = svg?.children[1];
    const arrow = svg?.children[2];

    expect(dot?.className).toBe("user-marker-dot");
    expect(svg?.attributes.get("viewBox")).toBe("0 0 56 56");
    expect(circle?.tagName).toBe("circle");
    expect(circle?.attributes.get("fill")).toBe("#e53e3e");
    expect(circle?.attributes.get("stroke")).toBe("#ffffff");
    expect(circle?.attributes.get("stroke-width")).toBe("3.5");
    expect(arrow?.tagName).toBe("polygon");
    expect(arrow?.attributes.get("points")).toBe("28,6 38,34 28,27 18,34");
    expect(arrow?.attributes.get("fill")).toBe("#ffffff");

    wiring.stop();
  });
});
