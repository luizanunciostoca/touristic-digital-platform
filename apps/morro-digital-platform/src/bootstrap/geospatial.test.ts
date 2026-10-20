import {
  EventBus,
  type DestinationConfig,
  type DestinationId,
} from "@touristic/core";
import type {
  MapboxGlMapLike,
  MapboxGlModuleLike,
} from "@touristic/geospatial";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDestinationMapReadiness,
  createMorroGeospatialInitializer,
} from "./geospatial.js";

function createSdk() {
  const mapOptions: unknown[] = [];
  const removeMap = vi.fn();

  class Map {
    constructor(options: unknown) {
      mapOptions.push(options);
    }
    setCenter = vi.fn();
    remove = removeMap;
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

  return { sdk, mapOptions, removeMap };
}

describe("createMorroGeospatialInitializer", () => {
  it("initializes the clean Home at the canonical Morro center with the audited visual contract", async () => {
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
      style: "mapbox://styles/mapbox/streets-v12",
      zoom: 13.5,
    });
    const engine = await initialize(events);

    expect(engine.initialized).toBe(true);
    expect(engine.providerId).toBe("mapbox");
    expect(fixture.sdk.accessToken).toBe("runtime-token");
    expect(fixture.mapOptions).toEqual([
      {
        container: "map",
        style: "mapbox://styles/mapbox/streets-v12",
        center: [-38.9167, -13.3833],
        zoom: 13.5,
        pitch: 0,
        bearing: 0,
        antialias: true,
        attributionControl: false,
        minZoom: 0,
        maxZoom: 20,
        projection: "globe",
      },
    ]);
    expect(lifecycle).toEqual(["MapInitialized", "MapReady"]);
  });

  it("publishes failure and does not publish ready when validation fails", async () => {
    const fixture = createSdk();
    const events = new EventBus();
    const ready = vi.fn();
    const failed = vi.fn();
    events.subscribe("MapReady", ready);
    events.subscribe("MapInitializationFailed", failed);

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
    expect(failed).toHaveBeenCalledOnce();
    expect(failed.mock.calls[0]?.[0].payload).toMatchObject({
      providerId: "mapbox",
      reason: "Map container id is required.",
    });
  });

  it("destroys the map when a lifecycle observer rejects", async () => {
    const fixture = createSdk();
    const events = new EventBus();
    const failed = vi.fn();
    events.subscribe("MapReady", () => {
      throw new Error("Map observer failed.");
    });
    events.subscribe("MapInitializationFailed", failed);

    const initialize = createMorroGeospatialInitializer({
      sdk: fixture.sdk,
      accessToken: "runtime-token",
      containerId: "map",
      style: "mapbox://styles/example/morro",
      zoom: 14,
    });

    await expect(initialize(events)).rejects.toThrow("Map observer failed.");
    expect(fixture.removeMap).toHaveBeenCalledOnce();
    expect(failed.mock.calls[0]?.[0].payload).toMatchObject({
      providerId: "mapbox",
      reason: "Map observer failed.",
    });
  });
});

describe("destination-configured Mapbox identity", () => {
  it("initializes Itacare coordinates and emits Itacare destination metadata", async () => {
    const destination = {
      id: "itacare" as DestinationId,
      name: "Itacaré",
      countryCode: "BR",
      timezone: "America/Bahia",
      currency: "BRL",
      center: { latitude: -14.278, longitude: -39.0 },
      radiusMeters: 35000,
      modules: { marketplace: true, map: true },
    } satisfies DestinationConfig;
    const fixture = createSdk();
    const events = new EventBus();
    const observed: string[] = [];
    events.subscribe("MapInitialized", (event) => {
      observed.push(event.destinationId);
    });
    const initialize = createMorroGeospatialInitializer({
      sdk: fixture.sdk,
      destination,
      attributionControl: true,
      accessToken: "runtime-token",
      containerId: "map",
      style: "mapbox://styles/mapbox/streets-v12",
      zoom: 13,
    });
    await initialize(events);
    expect(fixture.mapOptions[0]).toMatchObject({
      center: [-39.0, -14.278],
      attributionControl: true,
    });
    expect(observed).toEqual(["itacare"]);
  });
});

describe("destination-page native readiness", () => {
  afterEach(() => vi.useRealTimers());

  const fixture = () => {
    const listeners = new Map<string, Set<() => void>>();
    const map: MapboxGlMapLike = {
      setCenter: vi.fn(),
      remove: vi.fn(),
      isStyleLoaded: () => false,
      on(event, listener) {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event)!.add(listener);
      },
      off(event, listener) {
        listeners.get(event)?.delete(listener);
      },
    };
    return {
      map,
      listeners,
      emit(event: string) {
        for (const listener of [...(listeners.get(event) ?? [])]) listener();
      },
      count: () =>
        [...listeners.values()].reduce((sum, set) => sum + set.size, 0),
    };
  };

  it("requires native load and observes a later error", () => {
    vi.useFakeTimers();
    const native = fixture();
    const states = vi.fn();
    const readiness = createDestinationMapReadiness(states);
    readiness.onMapCreated(native.map);
    expect(states).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);
    native.emit("load");
    expect(states.mock.calls).toEqual([["ready"]]);
    expect(vi.getTimerCount()).toBe(0);
    expect(native.count()).toBe(1);
    native.emit("error");
    expect(states.mock.calls).toEqual([["ready"], ["unavailable"]]);
    expect(readiness.active).toBe(false);
    expect(native.count()).toBe(0);
  });

  it.each(["error", "timeout", "failure", "dispose"] as const)(
    "retires %s without allowing a queued load to revive the map",
    (ending) => {
      vi.useFakeTimers();
      const native = fixture();
      const states = vi.fn();
      const readiness = createDestinationMapReadiness(states);
      readiness.onMapCreated(native.map);
      const queuedLoad = [...native.listeners.get("load")!][0]!;
      if (ending === "error") native.emit("error");
      if (ending === "timeout") vi.advanceTimersByTime(15_000);
      if (ending === "failure") readiness.fail();
      if (ending === "dispose") readiness.dispose();
      queuedLoad();
      native.emit("load");
      native.emit("error");
      readiness.dispose();
      expect(states.mock.calls).toEqual(
        ending === "dispose" ? [] : [["unavailable"]],
      );
      expect(readiness.active).toBe(false);
      expect(native.count()).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("does not accumulate listeners or timers across ready-map disposal", () => {
    vi.useFakeTimers();
    const native = fixture();
    for (let run = 0; run < 3; run++) {
      const states = vi.fn();
      const readiness = createDestinationMapReadiness(states);
      readiness.onMapCreated(native.map);
      native.emit("load");
      expect(native.count()).toBe(1);
      readiness.dispose();
      native.emit("error");
      expect(states.mock.calls).toEqual([["ready"]]);
      expect(readiness.active).toBe(false);
      expect(native.count()).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
    }
  });

  it("bounds SDK loading before a native map exists", () => {
    vi.useFakeTimers();
    const states = vi.fn();
    const readiness = createDestinationMapReadiness(states);
    vi.advanceTimersByTime(14_999);
    expect(states).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(states.mock.calls).toEqual([["unavailable"]]);
    const native = fixture();
    readiness.onMapCreated(native.map);
    expect(native.count()).toBe(0);
    expect(readiness.active).toBe(false);
  });

  it("fails closed when native events cannot be observed", () => {
    vi.useFakeTimers();
    const states = vi.fn();
    const readiness = createDestinationMapReadiness(states);
    readiness.onMapCreated({ setCenter: vi.fn(), remove: vi.fn() });
    expect(states.mock.calls).toEqual([["unavailable"]]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("opts in to attribution at the actual destination initializer", () => {
    const source = readFileSync(
      new URL("../destinations/destination-browser-entry.ts", import.meta.url),
      "utf8",
    );
    expect(source).toMatch(
      /createMorroGeospatialInitializer\(\{[^]*?attributionControl:\s*true\s*,/u,
    );
    expect(source).toMatch(/onMapCreated:\s*readiness\.onMapCreated/u);
  });
});
