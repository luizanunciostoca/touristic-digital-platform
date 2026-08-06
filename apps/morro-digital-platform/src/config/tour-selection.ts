import { EventBus } from "@touristic/core";
import type { GeospatialEngine, MapMarker } from "@touristic/geospatial";
import { getMorroTourById } from "./tour-catalog.js";
import { createMorroTourMarkers } from "./tour-markers.js";

export interface TourSelectionResult {
  readonly activeTourId: string;
  readonly markerCount: number;
}

export interface MorroTourSelectionController {
  readonly activeTourId: string;
  selectTour(tourId: string): Promise<TourSelectionResult>;
}

export interface MorroTourSelectionControllerOptions {
  readonly engine: GeospatialEngine;
  readonly events: EventBus;
  readonly initialTourId: string;
}

function describeSelectionError(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown tour selection error.";
}

function createSelectionResult(
  activeTourId: string,
  markerCount: number,
): TourSelectionResult {
  return Object.freeze({ activeTourId, markerCount });
}

async function publishSelectionFailure(
  events: EventBus,
  payload: Readonly<{
    requestedTourId: string;
    activeTourId: string;
    phase: "replace" | "publish";
    rollbackSucceeded?: boolean;
    reason: string;
  }>,
): Promise<void> {
  try {
    await events.publish("TourSelectionFailed", payload);
  } catch {
    return;
  }
}

function markerIds(markers: readonly MapMarker[]): readonly string[] {
  return Object.freeze(markers.map((marker) => marker.id));
}

export function createMorroTourSelectionController(
  options: MorroTourSelectionControllerOptions,
): MorroTourSelectionController {
  const initialTour = getMorroTourById(options.initialTourId);
  if (!initialTour) {
    throw new Error(`Unknown Morro tour: ${options.initialTourId}.`);
  }

  let activeTourId = initialTour.id;

  return Object.freeze({
    get activeTourId(): string {
      return activeTourId;
    },

    async selectTour(tourId: string): Promise<TourSelectionResult> {
      const nextTour = getMorroTourById(tourId);
      if (!nextTour) throw new Error(`Unknown Morro tour: ${tourId}.`);

      if (nextTour.id === activeTourId) {
        return createSelectionResult(activeTourId, nextTour.stops.length);
      }

      const previousTourId = activeTourId;
      const previousMarkers = createMorroTourMarkers(previousTourId);
      const nextMarkers = createMorroTourMarkers(nextTour.id);

      try {
        await options.engine.replaceMarkers(nextMarkers);
      } catch (error) {
        await publishSelectionFailure(
          options.events,
          Object.freeze({
            requestedTourId: nextTour.id,
            activeTourId,
            phase: "replace" as const,
            reason: describeSelectionError(error),
          }),
        );
        throw error;
      }

      activeTourId = nextTour.id;

      try {
        await options.events.publish(
          "TourSelected",
          Object.freeze({
            tourId: nextTour.id,
            previousTourId,
            markerCount: nextMarkers.length,
            markerIds: markerIds(nextMarkers),
          }),
        );
      } catch (error) {
        let rollbackSucceeded = false;
        try {
          await options.engine.replaceMarkers(previousMarkers);
          activeTourId = previousTourId;
          rollbackSucceeded = true;
        } catch {
          activeTourId = nextTour.id;
        }

        await publishSelectionFailure(
          options.events,
          Object.freeze({
            requestedTourId: nextTour.id,
            activeTourId,
            phase: "publish" as const,
            rollbackSucceeded,
            reason: describeSelectionError(error),
          }),
        );
        throw error;
      }

      return createSelectionResult(activeTourId, nextMarkers.length);
    },
  });
}
