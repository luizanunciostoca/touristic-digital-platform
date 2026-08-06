import type { EventBus } from "@touristic/core";
import type { GeospatialEngine } from "@touristic/geospatial";
import {
  getMorroTourById,
  type TourRouteContract,
} from "../config/tour-catalog.js";
import { createMorroTourMarkers } from "../config/tour-markers.js";
import { findMorroTourByKeyword } from "../config/tour-search.js";

export interface TourSelectionResult {
  readonly tour: TourRouteContract;
  readonly markerCount: number;
}

export interface TourSelectionController {
  readonly selectedTourId: string | undefined;
  selectTour(tourId: string): Promise<TourSelectionResult>;
  selectByKeyword(keyword: string): Promise<TourSelectionResult>;
}

export interface TourSelectionControllerOptions {
  readonly engine: GeospatialEngine;
  readonly events: EventBus;
  readonly initialTourId?: string;
}

function createSelectionResult(
  tour: TourRouteContract,
): TourSelectionResult {
  return Object.freeze({
    tour,
    markerCount: tour.stops.length,
  });
}

function createFailurePayload(input: {
  readonly query: string;
  readonly tourId?: string;
  readonly reason: "not-found" | "provider-failure";
  readonly rolledBack: boolean;
}): Readonly<{
  query: string;
  tourId?: string;
  reason: "not-found" | "provider-failure";
  rolledBack: boolean;
}> {
  return Object.freeze({ ...input });
}

export function createTourSelectionController(
  options: TourSelectionControllerOptions,
): TourSelectionController {
  let selectedTour = options.initialTourId
    ? getMorroTourById(options.initialTourId)
    : undefined;

  if (options.initialTourId && !selectedTour) {
    throw new Error(`Unknown initial tour: ${options.initialTourId}.`);
  }

  async function selectResolvedTour(
    tour: TourRouteContract,
    query: string,
  ): Promise<TourSelectionResult> {
    const previousTour = selectedTour;
    const markers = createMorroTourMarkers(tour.id);

    await options.events.publish(
      "TourSelectionStarted",
      Object.freeze({
        query,
        tourId: tour.id,
        markerCount: markers.length,
      }),
    );

    try {
      await options.engine.replaceMarkers(markers);
      await options.engine.setCenter(tour.startPoint);
      selectedTour = tour;

      const result = createSelectionResult(tour);
      await options.events.publish(
        "TourSelected",
        Object.freeze({
          tourId: tour.id,
          markerCount: result.markerCount,
          startPoint: Object.freeze({ ...tour.startPoint }),
        }),
      );
      return result;
    } catch (error) {
      let rolledBack = false;

      try {
        if (previousTour) {
          await options.engine.replaceMarkers(
            createMorroTourMarkers(previousTour.id),
          );
          await options.engine.setCenter(previousTour.startPoint);
        } else {
          await options.engine.replaceMarkers([]);
        }
        rolledBack = true;
      } catch {
        rolledBack = false;
      }

      await options.events.publish(
        "TourSelectionFailed",
        createFailurePayload({
          query,
          tourId: tour.id,
          reason: "provider-failure",
          rolledBack,
        }),
      );
      throw error;
    }
  }

  async function rejectUnknownTour(
    query: string,
  ): Promise<TourSelectionResult> {
    await options.events.publish(
      "TourSelectionFailed",
      createFailurePayload({
        query,
        reason: "not-found",
        rolledBack: false,
      }),
    );
    throw new Error(`Tour was not found: ${query}.`);
  }

  return Object.freeze({
    get selectedTourId() {
      return selectedTour?.id;
    },
    async selectTour(tourId) {
      const tour = getMorroTourById(tourId);
      return tour
        ? selectResolvedTour(tour, tourId)
        : rejectUnknownTour(tourId);
    },
    async selectByKeyword(keyword) {
      const tour = findMorroTourByKeyword(keyword);
      return tour
        ? selectResolvedTour(tour, keyword)
        : rejectUnknownTour(keyword);
    },
  });
}
