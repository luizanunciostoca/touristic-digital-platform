import type { EventBus } from "@touristic/core";
import type { GeospatialEngine, MapMarker } from "@touristic/geospatial";
import { morroDeSaoPauloDestination } from "./destination.js";
import { getMorroTourById, type TourRouteContract } from "./tour-catalog.js";
import { createMorroTourMarkers } from "./tour-markers.js";
import { findMorroTourByKeyword } from "./tour-search.js";

export interface TourSelectionResult {
  readonly activeTourId: string;
  readonly markerCount: number;
}

export interface MorroTourSelectionController {
  readonly activeTourId: string | null;
  selectTour(tourId: string): Promise<TourSelectionResult>;
  selectByKeyword(keyword: string): Promise<TourSelectionResult>;
}

export interface MorroTourSelectionControllerOptions {
  readonly engine: GeospatialEngine;
  readonly events: EventBus;
  readonly initialTourId?: string | null;
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

async function publishTourEvent<TPayload>(
  events: EventBus,
  type: string,
  payload: TPayload,
): Promise<void> {
  await events.publish(type, payload, {
    destinationId: morroDeSaoPauloDestination.id,
  });
}

async function publishSelectionFailure(
  events: EventBus,
  payload: Readonly<{
    requestedTourId: string;
    activeTourId: string | null;
    phase: TourSelectionFailurePhase;
    rollbackSucceeded?: boolean;
    reason: string;
  }>,
): Promise<void> {
  try {
    await publishTourEvent(events, "TourSelectionFailed", payload);
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
  const initialTour = options.initialTourId
    ? (getMorroTourById(options.initialTourId) ?? null)
    : null;
  if (options.initialTourId && !initialTour) {
    throw new Error(`Unknown Morro tour: ${options.initialTourId}.`);
  }

  let activeTour: TourRouteContract | null = initialTour;

  async function rollbackTo(
    previousTour: TourRouteContract | null,
    previousMarkers: readonly MapMarker[],
  ): Promise<boolean> {
    try {
      await options.engine.replaceMarkers(previousMarkers);
      await options.engine.setCenter(
        previousTour?.startPoint ?? morroDeSaoPauloDestination.center,
      );
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
    const previousTour = activeTour;
    const previousMarkers = previousTour
      ? createMorroTourMarkers(previousTour.id)
      : Object.freeze([] as MapMarker[]);
    const nextMarkers = createMorroTourMarkers(nextTour.id);

    try {
      await publishTourEvent(
        options.events,
        "TourSelectionStarted",
        Object.freeze({
          query,
          tourId: nextTour.id,
          previousTourId: previousTour?.id ?? null,
          markerCount: nextMarkers.length,
        }),
      );
    } catch (error) {
      await publishSelectionFailure(
        options.events,
        Object.freeze({
          requestedTourId: nextTour.id,
          activeTourId: activeTour?.id ?? null,
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
          activeTourId: activeTour?.id ?? null,
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
          activeTourId: activeTour?.id ?? null,
          phase: "center" as const,
          rollbackSucceeded,
          reason: describeSelectionError(error),
        }),
      );
      throw error;
    }

    activeTour = nextTour;

    try {
      await publishTourEvent(
        options.events,
        "TourSelected",
        Object.freeze({
          tourId: nextTour.id,
          previousTourId: previousTour?.id ?? null,
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
          activeTourId: activeTour?.id ?? null,
          phase: "publish" as const,
          rollbackSucceeded,
          reason: describeSelectionError(error),
        }),
      );
      throw error;
    }

    return createSelectionResult(nextTour.id, nextMarkers.length);
  }

  async function rejectUnknownTour(
    query: string,
  ): Promise<TourSelectionResult> {
    await publishSelectionFailure(
      options.events,
      Object.freeze({
        requestedTourId: query,
        activeTourId: activeTour?.id ?? null,
        phase: "lookup" as const,
        reason: `Unknown Morro tour: ${query}.`,
      }),
    );
    throw new Error(`Unknown Morro tour: ${query}.`);
  }

  return Object.freeze({
    get activeTourId(): string | null {
      return activeTour?.id ?? null;
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
