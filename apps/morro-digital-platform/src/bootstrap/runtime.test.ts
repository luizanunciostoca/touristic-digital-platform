import { EventBus } from "@touristic/core";
import type { GeospatialEngine, MapMarker } from "@touristic/geospatial";
import { describe, expect, it, vi } from "vitest";
import { bootstrapMorroDigital } from "./runtime.js";

const marker: MapMarker = Object.freeze({
  id: "fonte-grande",
  label: "Fonte Grande",
  position: Object.freeze({
    latitude: -13.376543,
    longitude: -38.918765,
  }),
});

function createEngine(options: { readonly failMarkers?: boolean } = {}) {
  const addMarkers = options.failMarkers
    ? vi.fn(async () => {
        throw new Error("Marker provider failed.");
      })
    : vi.fn(async () => undefined);
  const destroy = vi.fn(async () => undefined);
  const engine: GeospatialEngine = {
    providerId: "mapbox",
    initialized: true,
    initialize: vi.fn(async () => undefined),
    setCenter: vi.fn(async () => undefined),
    addMarkers,
    destroy,
  };

  return { engine, addMarkers, destroy };
}

describe("bootstrapMorroDigital", () => {
  it("loads Morro de São Paulo with geospatial and marketplace", async () => {
    const result = await bootstrapMorroDigital();

    expect(result.runtime.destination.id).toBe("morro-de-sao-paulo");
    expect(result.runtime.destination.locale).toBe("pt-BR");
    expect(result.startedModules).toEqual(["geospatial", "marketplace"]);
    expect(result.loadedMarkerCount).toBe(0);
  });

  it("keeps marketplace dependency available", async () => {
    const result = await bootstrapMorroDigital();
    const marketplace = result.runtime.modules.find(
      (module) => module.id === "marketplace",
    );

    expect(marketplace?.dependencies).toEqual(["geospatial"]);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("loads initial markers and publishes their immutable identifiers", async () => {
    const fixture = createEngine();
    const events = new EventBus();
    const loaded = vi.fn();
    events.subscribe("MapMarkersLoaded", loaded);

    const result = await bootstrapMorroDigital({
      events,
      initializeGeospatial: vi.fn(async () => fixture.engine),
      initialMarkers: [marker],
    });

    expect(fixture.addMarkers).toHaveBeenCalledWith([marker]);
    expect(result.loadedMarkerCount).toBe(1);
    expect(result.geospatialEngine).toBe(fixture.engine);
    expect(loaded).toHaveBeenCalledOnce();
    expect(loaded.mock.calls[0]?.[0].payload).toMatchObject({
      destinationId: "morro-de-sao-paulo",
      count: 1,
      markerIds: ["fonte-grande"],
    });
    expect(
      Object.isFrozen(loaded.mock.calls[0]?.[0].payload.markerIds),
    ).toBe(true);
  });

  it("destroys the engine and publishes failure when marker loading fails", async () => {
    const fixture = createEngine({ failMarkers: true });
    const events = new EventBus();
    const failed = vi.fn();
    events.subscribe("MapMarkersLoadFailed", failed);

    await expect(
      bootstrapMorroDigital({
        events,
        initializeGeospatial: vi.fn(async () => fixture.engine),
        initialMarkers: [marker],
      }),
    ).rejects.toThrow("Marker provider failed.");

    expect(fixture.destroy).toHaveBeenCalledOnce();
    expect(failed).toHaveBeenCalledOnce();
    expect(failed.mock.calls[0]?.[0].payload).toMatchObject({
      destinationId: "morro-de-sao-paulo",
      markerIds: ["fonte-grande"],
      reason: "Marker provider failed.",
    });
  });

  it("rejects markers when no geospatial initializer is configured", async () => {
    await expect(
      bootstrapMorroDigital({ initialMarkers: [marker] }),
    ).rejects.toThrow("Initial map markers require a geospatial initializer.");
  });
});
