import { EventBus } from "@touristic/platform-runtime";
import { describe, expect, it, vi } from "vitest";
import type { MapboxGlModuleLike } from "@touristic/geospatial";
import { createMorroGeospatialInitializer } from "./geospatial.js";

function createSdk() {
  const mapOptions: unknown[] = [];

  class Map {
    constructor(options: unknown) {
      mapOptions.push(options);
    }
    setCenter = vi.fn();
    remove = vi.fn();
  }

  class Marker {
    setLngLat() {
      return this;
    }
    addTo() {
      return this;
    }
    remove = vi.fn();
  }

  const sdk = {
    accessToken: "",
    Map,
    Marker,
  } as unknown as MapboxGlModuleLike;

  return { sdk, mapOptions };
}

describe("createMorroGeospatialInitializer", () => {
  it("initializes Morro de São Paulo and publishes map lifecycle events", async () => {
    const fixture = createSdk();
    const events = new EventBus();
    const lifecycle: string[] = [];

    events.subscribe("MapInitialized", (event) => {
      lifecycle.push(event.type);
    });
    events.subscribe("MapReady", (event) => {
      lifecycle.push(event.type);
    });

    const initialize = createMorroGeospatialInitializer({
      sdk: fixture.sdk,
      accessToken: "runtime-token",
      containerId: "map",
      style: "mapbox://styles/example/morro",
      zoom: 14,
    });
    const engine = await initialize(events);

    expect(engine.initialized).toBe(true);
    expect(engine.providerId).toBe("mapbox");
    expect(fixture.sdk.accessToken).toBe("runtime-token");
    expect(fixture.mapOptions).toEqual([
      {
        container: "map",
        style: "mapbox://styles/example/morro",
        center: [-38.9167, -13.3833],
        zoom: 14,
      },
    ]);
    expect(lifecycle).toEqual(["MapInitialized", "MapReady"]);
  });

  it("does not publish MapReady when initialization fails", async () => {
    const fixture = createSdk();
    const events = new EventBus();
    const ready = vi.fn();
    events.subscribe("MapReady", ready);

    const initialize = createMorroGeospatialInitializer({
      sdk: fixture.sdk,
      accessToken: "runtime-token",
      containerId: " ",
      style: "mapbox://styles/example/morro",
      zoom: 14,
    });

    await expect(initialize(events)).rejects.toThrow(
      "Map container id is required.",
    );
    expect(ready).not.toHaveBeenCalled();
  });
});
