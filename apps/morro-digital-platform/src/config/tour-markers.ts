import type { MapMarker } from "@touristic/geospatial";
import { getMorroTourById } from "./tour-catalog.js";

function freezeMarker(marker: MapMarker): MapMarker {
  return Object.freeze({
    ...marker,
    position: Object.freeze({ ...marker.position }),
  });
}

export function createMorroTourMarkers(
  tourId: string,
): readonly MapMarker[] {
  const tour = getMorroTourById(tourId);
  if (!tour) throw new Error(`Unknown Morro tour: ${tourId}.`);

  return Object.freeze(
    tour.stops.map((stop) =>
      freezeMarker({
        id: `${tour.id}:${stop.id}`,
        label: `${stop.order}. ${stop.title}`,
        position: stop.position,
      }),
    ),
  );
}
