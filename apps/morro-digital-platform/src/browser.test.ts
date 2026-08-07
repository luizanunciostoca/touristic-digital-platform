import type { MapboxGlModuleLike, MapMarker } from "@touristic/geospatial";
import { describe, expect, it, vi } from "vitest";
import {
  startMorroDigitalBrowser,
  type BrowserMapContainer,
} from "./browser.js";

const environment = Object.freeze({
  VITE_MAPBOX_ACCESS_TOKEN: "public-token",
  VITE_MAPBOX_CONTAINER_ID: "map",
  VITE_MAPBOX_STYLE: "mapbox://styles/example/morro",
  VITE_MAPBOX_INITIAL_ZOOM: "14",
});

const marker: MapMarker = Object.freeze({
  id: "fonte-grande",
  label: "Fonte Grande",
  position: Object.freeze({
    latitude: -13.376543,
    longitude: -38.918765,
  }),
});

function createContainer(): BrowserMapContainer & {
  readonly attributes: Map<string, string>;
} {
  const attributes = new Map<string, string>();
  return {
    attributes,
    setAttribute(name, value) {
      attributes.set(name, value);
    },
    removeAttribute(name) {
      attributes.delete(name);
    },
  };
}

function createSdk(options: { readonly failMap?: boolean } = {}) {
  const mapOptions: unknown[] = [];
  const markerPositions: Array<[number, number]> = [];
  const addMarkerToMap = vi.fn();

  class Map {
    constructor(input: unknown) {
      if (options.failMap) throw new Error("Mapbox map failed to initialize.");
      mapOptions.push(input);
    }
    setCenter = vi.fn();
    remove = vi.fn();
  }

  class Marker {
    setLngLat(position: [number, number]) {
      markerPositions.push(position);
      return this;
    }
    addTo(map: InstanceType<typeof Map>) {
      addMarkerToMap(map);
      return this;
    }
    remove = vi.fn();
  }

  const sdk = {
    accessToken: "",
    Map,
    Marker,
  } as unknown as MapboxGlModuleLike;

  return { sdk, mapOptions, markerPositions, addMarkerToMap };
}

describe("startMorroDigitalBrowser", () => {
  it("starts the runtime, loads markers and marks the container as ready", async () => {
    const fixture = createSdk();
    const container = createContainer();

    const result = await startMorroDigitalBrowser({
      sdk: fixture.sdk,
      environment,
      initialMarkers: [marker],
      document: {
        getElementById(id) {
          return id === "map" ? container : null;
        },
      },
    });

    expect(result.startedModules).toEqual(["geospatial", "marketplace"]);
    expect(result.geospatialEngine?.providerId).toBe("mapbox");
    expect(result.loadedMarkerCount).toBe(1);
    expect(container.attributes.get("data-map-state")).toBe("ready");
    expect(container.attributes.get("data-map-provider")).toBe("mapbox");
    expect(container.attributes.get("data-map-marker-count")).toBe("1");
    expect(container.attributes.has("aria-busy")).toBe(false);
    expect(fixture.mapOptions).toHaveLength(1);
    expect(fixture.markerPositions).toEqual([[-38.918765, -13.376543]]);
    expect(fixture.addMarkerToMap).toHaveBeenCalledOnce();
  });

  it("fails before starting the SDK when the map container is missing", async () => {
    const fixture = createSdk();

    await expect(
      startMorroDigitalBrowser({
        sdk: fixture.sdk,
        environment,
        document: { getElementById: () => null },
      }),
    ).rejects.toThrow("Map container was not found: map.");

    expect(fixture.mapOptions).toHaveLength(0);
  });

  it("marks the container as error and clears busy state on SDK failure", async () => {
    const fixture = createSdk({ failMap: true });
    const container = createContainer();

    await expect(
      startMorroDigitalBrowser({
        sdk: fixture.sdk,
        environment,
        document: { getElementById: () => container },
      }),
    ).rejects.toThrow("Mapbox map failed to initialize.");

    expect(container.attributes.get("data-map-state")).toBe("error");
    expect(container.attributes.has("aria-busy")).toBe(false);
  });
});
