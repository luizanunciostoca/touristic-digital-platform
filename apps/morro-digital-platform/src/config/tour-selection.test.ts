import { EventBus } from "@touristic/core";
import type { GeospatialEngine } from "@touristic/geospatial";
import { describe, expect, it, vi } from "vitest";
import { createMorroTourSelectionController } from "./tour-selection.js";

function createEngine(): GeospatialEngine {
  return {
    providerId: "mapbox",
    initialized: true,
    initialize: vi.fn(async () => undefined),
    setCenter: vi.fn(async () => undefined),
    addMarkers: vi.fn(async () => undefined),
    replaceMarkers: vi.fn(async () => undefined),
    destroy: vi.fn(async () => undefined),
  };
}

describe("createMorroTourSelectionController", () => {
  it("publishes the full lifecycle when the first tour is selected from idle Home", async () => {
    const engine = createEngine();
    const events = new EventBus();
    const started = vi.fn();
    const selected = vi.fn();
    events.subscribe("TourSelectionStarted", started);
    events.subscribe("TourSelected", selected);
    const controller = createMorroTourSelectionController({
      engine,
      events,
      initialTourId: null,
    });

    expect(controller.activeTourId).toBeNull();

    const result = await controller.selectTour("volta-a-ilha");

    expect(result).toEqual({ activeTourId: "volta-a-ilha", markerCount: 8 });
    expect(controller.activeTourId).toBe("volta-a-ilha");
    expect(engine.replaceMarkers).toHaveBeenCalledOnce();
    expect(vi.mocked(engine.replaceMarkers).mock.calls[0]?.[0]).toHaveLength(8);
    expect(started.mock.calls[0]?.[0].payload).toMatchObject({
      tourId: "volta-a-ilha",
      previousTourId: null,
      markerCount: 8,
    });
    expect(selected.mock.calls[0]?.[0].payload).toMatchObject({
      tourId: "volta-a-ilha",
      previousTourId: null,
      markerCount: 8,
    });
  });

  it("rolls the first selection back to the canonical idle Home when publish fails", async () => {
    const engine = createEngine();
    const events = new EventBus();
    events.subscribe("TourSelected", () => {
      throw new Error("First tour observer failed.");
    });
    const failed = vi.fn();
    events.subscribe("TourSelectionFailed", failed);
    const controller = createMorroTourSelectionController({
      engine,
      events,
      initialTourId: null,
    });

    await expect(controller.selectTour("volta-a-ilha")).rejects.toThrow(
      "First tour observer failed.",
    );

    expect(engine.replaceMarkers).toHaveBeenCalledTimes(2);
    expect(vi.mocked(engine.replaceMarkers).mock.calls[0]?.[0]).toHaveLength(8);
    expect(vi.mocked(engine.replaceMarkers).mock.calls[1]?.[0]).toHaveLength(0);
    expect(engine.setCenter).toHaveBeenLastCalledWith({
      latitude: -13.3833,
      longitude: -38.9167,
    });
    expect(controller.activeTourId).toBeNull();
    expect(failed.mock.calls[0]?.[0].payload).toMatchObject({
      requestedTourId: "volta-a-ilha",
      activeTourId: null,
      phase: "publish",
      rollbackSucceeded: true,
    });
  });

  it("replaces markers, centers the map and publishes the selected tour", async () => {
    const engine = createEngine();
    const events = new EventBus();
    const started = vi.fn();
    const selected = vi.fn();
    events.subscribe("TourSelectionStarted", started);
    events.subscribe("TourSelected", selected);
    const controller = createMorroTourSelectionController({
      engine,
      events,
      initialTourId: "volta-a-ilha",
    });

    const result = await controller.selectTour("trilha-gamboa");

    expect(result).toEqual({
      activeTourId: "trilha-gamboa",
      markerCount: 5,
    });
    expect(controller.activeTourId).toBe("trilha-gamboa");
    expect(engine.replaceMarkers).toHaveBeenCalledOnce();
    expect(vi.mocked(engine.replaceMarkers).mock.calls[0]?.[0]).toHaveLength(5);
    expect(engine.setCenter).toHaveBeenCalledWith({
      latitude: -13.376543,
      longitude: -38.918765,
    });
    expect(started).toHaveBeenCalledOnce();
    expect(selected).toHaveBeenCalledOnce();
    expect(selected.mock.calls[0]?.[0].payload).toMatchObject({
      tourId: "trilha-gamboa",
      previousTourId: "volta-a-ilha",
      markerCount: 5,
    });
  });

  it("selects a tour through the V1-compatible keyword resolver", async () => {
    const engine = createEngine();
    const controller = createMorroTourSelectionController({
      engine,
      events: new EventBus(),
      initialTourId: "volta-a-ilha",
    });

    const result = await controller.selectByKeyword(
      "Quero fazer um passeio de quadriciclo",
    );

    expect(result).toEqual({
      activeTourId: "passeio-quadriciclo",
      markerCount: 5,
    });
    expect(engine.replaceMarkers).toHaveBeenCalledOnce();
  });

  it("does not replace markers when the requested tour is already active", async () => {
    const engine = createEngine();
    const controller = createMorroTourSelectionController({
      engine,
      events: new EventBus(),
      initialTourId: "volta-a-ilha",
    });

    const result = await controller.selectTour("volta-a-ilha");

    expect(result.markerCount).toBe(8);
    expect(engine.replaceMarkers).not.toHaveBeenCalled();
    expect(engine.setCenter).not.toHaveBeenCalled();
  });

  it("publishes lookup failure before rejecting an unknown tour", async () => {
    const engine = createEngine();
    const events = new EventBus();
    const failed = vi.fn();
    events.subscribe("TourSelectionFailed", failed);
    const controller = createMorroTourSelectionController({
      engine,
      events,
      initialTourId: "volta-a-ilha",
    });

    await expect(controller.selectTour("unknown-tour")).rejects.toThrow(
      "Unknown Morro tour: unknown-tour.",
    );

    expect(engine.replaceMarkers).not.toHaveBeenCalled();
    expect(failed.mock.calls[0]?.[0].payload).toMatchObject({
      requestedTourId: "unknown-tour",
      activeTourId: "volta-a-ilha",
      phase: "lookup",
    });
  });

  it("publishes a failure and preserves the active tour when replacement fails", async () => {
    const engine = createEngine();
    vi.mocked(engine.replaceMarkers).mockRejectedValueOnce(
      new Error("Provider replacement failed."),
    );
    const events = new EventBus();
    const failed = vi.fn();
    events.subscribe("TourSelectionFailed", failed);
    const controller = createMorroTourSelectionController({
      engine,
      events,
      initialTourId: "volta-a-ilha",
    });

    await expect(controller.selectTour("trilha-gamboa")).rejects.toThrow(
      "Provider replacement failed.",
    );

    expect(controller.activeTourId).toBe("volta-a-ilha");
    expect(engine.setCenter).not.toHaveBeenCalled();
    expect(failed.mock.calls[0]?.[0].payload).toMatchObject({
      requestedTourId: "trilha-gamboa",
      activeTourId: "volta-a-ilha",
      phase: "replace",
    });
  });

  it("restores the previous route when centering the new route fails", async () => {
    const engine = createEngine();
    vi.mocked(engine.setCenter).mockRejectedValueOnce(
      new Error("Map center failed."),
    );
    const events = new EventBus();
    const failed = vi.fn();
    events.subscribe("TourSelectionFailed", failed);
    const controller = createMorroTourSelectionController({
      engine,
      events,
      initialTourId: "volta-a-ilha",
    });

    await expect(controller.selectTour("trilha-gamboa")).rejects.toThrow(
      "Map center failed.",
    );

    expect(engine.replaceMarkers).toHaveBeenCalledTimes(2);
    expect(vi.mocked(engine.replaceMarkers).mock.calls[0]?.[0]).toHaveLength(5);
    expect(vi.mocked(engine.replaceMarkers).mock.calls[1]?.[0]).toHaveLength(8);
    expect(engine.setCenter).toHaveBeenCalledTimes(2);
    expect(controller.activeTourId).toBe("volta-a-ilha");
    expect(failed.mock.calls[0]?.[0].payload).toMatchObject({
      requestedTourId: "trilha-gamboa",
      activeTourId: "volta-a-ilha",
      phase: "center",
      rollbackSucceeded: true,
    });
  });

  it("rolls back markers and center when a TourSelected observer fails", async () => {
    const engine = createEngine();
    const events = new EventBus();
    events.subscribe("TourSelected", () => {
      throw new Error("Tour observer failed.");
    });
    const failed = vi.fn();
    events.subscribe("TourSelectionFailed", failed);
    const controller = createMorroTourSelectionController({
      engine,
      events,
      initialTourId: "volta-a-ilha",
    });

    await expect(controller.selectTour("trilha-gamboa")).rejects.toThrow(
      "Tour observer failed.",
    );

    expect(engine.replaceMarkers).toHaveBeenCalledTimes(2);
    expect(vi.mocked(engine.replaceMarkers).mock.calls[0]?.[0]).toHaveLength(5);
    expect(vi.mocked(engine.replaceMarkers).mock.calls[1]?.[0]).toHaveLength(8);
    expect(engine.setCenter).toHaveBeenCalledTimes(2);
    expect(controller.activeTourId).toBe("volta-a-ilha");
    expect(failed.mock.calls[0]?.[0].payload).toMatchObject({
      requestedTourId: "trilha-gamboa",
      activeTourId: "volta-a-ilha",
      phase: "publish",
      rollbackSucceeded: true,
    });
  });
});
