import type { EventBus } from "@touristic/core";
import type { GeospatialEngine, MapMarker } from "@touristic/geospatial";
import { getMorroTourById, type TourRouteContract } from "./tour-catalog.js";
import { createMorroTourMarkers } from "./tour-markers.js";
import { findMorroTourByKeyword } from "./tour-search.js";

export interface TourSelectionResult {
  readonly activeTourId: string;
  readonly markerCount: number;
}

export interface MorroTourSelectionController {
  readonly activeTourId: string;
  selectTour(tourId: string): Promise<TourSelectionResult>;
  selectByKeyword(keyword: string): Promise<TourSelectionResult>;
}

export interface MorroTourSelectionControllerOptions {
  readonly engine: GeospatialEngine;
  readonly events: EventBus;
  readonly initialTourId: string;
}

type TourSelectionFailurePhase =
  "lookup" | "start" | "replace" | "center" | "publish";

function describeSelectionError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Unknown tour selection error.";
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
    phase: TourSelectionFailurePhase;
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

  let activeTour = initialTour;

  async function rollbackTo(
    previousTour: TourRouteContract,
    previousMarkers: readonly MapMarker[],
  ): Promise<boolean> {
    try {
      await options.engine.replaceMarkers(previousMarkers);
      await options.engine.setCenter(previousTour.startPoint);
      activeTour = previousTour;
      return true;
    } catch {
      return false;
    }
  }

  async function selectResolvedTour(
    nextTour: TourRouteContract,
    query: string,
  ): Promise<TourSelectionResult> {
    if (nextTour.id === activeTour.id) {
      return createSelectionResult(activeTour.id, nextTour.stops.length);
    }

    const previousTour = activeTour;
    const previousMarkers = createMorroTourMarkers(previousTour.id);
    const nextMarkers = createMorroTourMarkers(nextTour.id);

    try {
      await options.events.publish(
        "TourSelectionStarted",
        Object.freeze({
          query,
          tourId: nextTour.id,
          previousTourId: previousTour.id,
          markerCount: nextMarkers.length,
        }),
      );
    } catch (error) {
      await publishSelectionFailure(
        options.events,
        Object.freeze({
          requestedTourId: nextTour.id,
          activeTourId: activeTour.id,
          phase: "start" as const,
          reason: describeSelectionError(error),
        }),
      );
      throw error;
    }

    try {
      await options.engine.replaceMarkers(nextMarkers);
    } catch (error) {
      await publishSelectionFailure(
        options.events,
        Object.freeze({
          requestedTourId: nextTour.id,
          activeTourId: activeTour.id,
          phase: "replace" as const,
          reason: describeSelectionError(error),
        }),
      );
      throw error;
    }

    try {
      await options.engine.setCenter(nextTour.startPoint);
    } catch (error) {
      const rollbackSucceeded = await rollbackTo(previousTour, previousMarkers);
      await publishSelectionFailure(
        options.events,
        Object.freeze({
          requestedTourId: nextTour.id,
          activeTourId: activeTour.id,
          phase: "center" as const,
          rollbackSucceeded,
          reason: describeSelectionError(error),
        }),
      );
      throw error;
    }

    activeTour = nextTour;

    try {
      await options.events.publish(
        "TourSelected",
        Object.freeze({
          tourId: nextTour.id,
          previousTourId: previousTour.id,
          markerCount: nextMarkers.length,
          markerIds: markerIds(nextMarkers),
          startPoint: Object.freeze({ ...nextTour.startPoint }),
        }),
      );
    } catch (error) {
      const rollbackSucceeded = await rollbackTo(previousTour, previousMarkers);
      if (!rollbackSucceeded) activeTour = nextTour;

      await publishSelectionFailure(
        options.events,
        Object.freeze({
          requestedTourId: nextTour.id,
          activeTourId: activeTour.id,
          phase: "publish" as const,
          rollbackSucceeded,
          reason: describeSelectionError(error),
        }),
      );
      throw error;
    }

    return createSelectionResult(activeTour.id, nextMarkers.length);
  }

  async function rejectUnknownTour(
    query: string,
  ): Promise<TourSelectionResult> {
    await publishSelectionFailure(
      options.events,
      Object.freeze({
        requestedTourId: query,
        activeTourId: activeTour.id,
        phase: "lookup" as const,
        reason: `Unknown Morro tour: ${query}.`,
      }),
    );
    throw new Error(`Unknown Morro tour: ${query}.`);
  }

  return Object.freeze({
    get activeTourId(): string {
      return activeTour.id;
    },

    async selectTour(tourId: string): Promise<TourSelectionResult> {
      const nextTour = getMorroTourById(tourId);
      return nextTour
        ? selectResolvedTour(nextTour, tourId)
        : rejectUnknownTour(tourId);
    },

    async selectByKeyword(keyword: string): Promise<TourSelectionResult> {
      const nextTour = findMorroTourByKeyword(keyword);
      return nextTour
        ? selectResolvedTour(nextTour, keyword)
        : rejectUnknownTour(keyword);
    },
  });
}
