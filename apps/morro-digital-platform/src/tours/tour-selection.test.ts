import { EventBus } from "@touristic/core";
import type { GeospatialEngine, MapMarker } from "@touristic/geospatial";
import { describe, expect, it, vi } from "vitest";
import { createTourSelectionController } from "./tour-selection.js";

function createEngine(): GeospatialEngine & {
  readonly replaceMarkers: ReturnType<typeof vi.fn>;
  readonly setCenter: ReturnType<typeof vi.fn>;
} {
  return {
    providerId: "mapbox",
    initialized: true,
    initialize: vi.fn(async () => undefined),
    addMarkers: vi.fn(async () => undefined),
    replaceMarkers: vi.fn(async (_markers: readonly MapMarker[]) => undefined),
    setCenter: vi.fn(async () => undefined),
    destroy: vi.fn(async () => undefined),
  };
}

describe("createTourSelectionController", () => {
  it("replaces markers, centers the map and publishes the selected tour", async () => {
    const engine = createEngine();
    const events = new EventBus();
    const eventTypes: string[] = [];
    events.subscribe("TourSelectionStarted", (event) => {
      eventTypes.push(event.type);
    });
    events.subscribe("TourSelected", (event) => {
      eventTypes.push(event.type);
    });

    const controller = createTourSelectionController({
      engine,
      events,
      initialTourId: "volta-a-ilha",
    });
    const result = await controller.selectTour("trilha-gamboa");

    expect(result.tour.id).toBe("trilha-gamboa");
    expect(result.markerCount).toBe(5);
    expect(controller.selectedTourId).toBe("trilha-gamboa");
    expect(engine.replaceMarkers).toHaveBeenCalledOnce();
    expect(engine.replaceMarkers.mock.calls[0]?.[0]).toHaveLength(5);
    expect(engine.replaceMarkers.mock.calls[0]?.[0]?.[0]?.id).toBe(
      "trilha-gamboa:stop-1",
    );
    expect(engine.setCenter).toHaveBeenCalledWith({
      latitude: -13.376543,
      longitude: -38.918765,
    });
    expect(eventTypes).toEqual(["TourSelectionStarted", "TourSelected"]);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("selects tours through the V1-compatible keyword resolver", async () => {
    const engine = createEngine();
    const controller = createTourSelectionController({
      engine,
      events: new EventBus(),
    });

    const result = await controller.selectByKeyword("Quero fazer quadriciclo");

    expect(result.tour.id).toBe("passeio-quadriciclo");
    expect(result.markerCount).toBe(5);
    expect(controller.selectedTourId).toBe("passeio-quadriciclo");
  });

  it("restores the previous route when centering the new route fails", async () => {
    const engine = createEngine();
    const events = new EventBus();
    const failures: unknown[] = [];
    events.subscribe("TourSelectionFailed", (event) => {
      failures.push(event.payload);
    });
    engine.setCenter.mockRejectedValueOnce(new Error("Map center failed."));

    const controller = createTourSelectionController({
      engine,
      events,
      initialTourId: "volta-a-ilha",
    });

    await expect(controller.selectTour("trilha-gamboa")).rejects.toThrow(
      "Map center failed.",
    );

    expect(controller.selectedTourId).toBe("volta-a-ilha");
    expect(engine.replaceMarkers).toHaveBeenCalledTimes(2);
    expect(engine.replaceMarkers.mock.calls[1]?.[0]).toHaveLength(8);
    expect(engine.setCenter).toHaveBeenCalledTimes(2);
    expect(failures).toEqual([
      {
        query: "trilha-gamboa",
        tourId: "trilha-gamboa",
        reason: "provider-failure",
        rolledBack: true,
      },
    ]);
  });

  it("rejects unknown tours without changing the provider", async () => {
    const engine = createEngine();
    const events = new EventBus();
    const failures: unknown[] = [];
    events.subscribe("TourSelectionFailed", (event) => {
      failures.push(event.payload);
    });
    const controller = createTourSelectionController({ engine, events });

    await expect(controller.selectByKeyword("passeio inexistente")).rejects.toThrow(
      "Tour was not found: passeio inexistente.",
    );

    expect(engine.replaceMarkers).not.toHaveBeenCalled();
    expect(engine.setCenter).not.toHaveBeenCalled();
    expect(failures).toEqual([
      {
        query: "passeio inexistente",
        reason: "not-found",
        rolledBack: false,
      },
    ]);
  });
});
