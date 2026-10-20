import type { PublicDestination } from "../runtime/public-destination.js";
import type {
  PublicPlaceDetail,
  PublicPlaceMapItem,
} from "@touristic/business";
import type { MapMarker } from "@touristic/geospatial";

const DESTINATION = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const PLACE = /^[a-z0-9][a-z0-9_-]*$/u;

/** Derive a public read bounding box from the owner-configured destination. */
export function destinationPublicBoundingBox(
  destination: PublicDestination,
): readonly [number, number, number, number] {
  if (!DESTINATION.test(destination.id)) {
    throw new Error("PUBLIC_DESTINATION_INVALID_ID");
  }
  const { latitude, longitude } = destination.center;
  const radius = destination.radiusMeters;
  if (
    !Number.isFinite(latitude) ||
    latitude < -89 ||
    latitude > 89 ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180 ||
    !Number.isFinite(radius) ||
    radius < 100 ||
    radius > 100_000
  ) {
    throw new Error("PUBLIC_DESTINATION_GEO_INVALID");
  }
  const deltaLat = radius / 111_320;
  const deltaLng = radius / (111_320 * Math.cos((latitude * Math.PI) / 180));
  const west = Math.max(-180, longitude - deltaLng);
  const east = Math.min(180, longitude + deltaLng);
  const south = Math.max(-90, latitude - deltaLat);
  const north = Math.min(90, latitude + deltaLat);
  if (west >= east || south >= north)
    throw new Error("PUBLIC_DESTINATION_BBOX_INVALID");
  return Object.freeze([west, south, east, north] as const);
}

export function trustedPublicMapMarkers(
  items: readonly PublicPlaceMapItem[],
  bbox: readonly [number, number, number, number],
): readonly MapMarker[] {
  const [west, south, east, north] = bbox;
  const unique = new Set<string>();
  const result: MapMarker[] = [];
  for (const item of items) {
    if (
      typeof item.id !== "string" ||
      !PLACE.test(item.id) ||
      unique.has(item.id) ||
      typeof item.name !== "string" ||
      !item.name.trim() ||
      !Number.isFinite(item.lat) ||
      !Number.isFinite(item.lng) ||
      item.lat < south ||
      item.lat > north ||
      item.lng < west ||
      item.lng > east
    )
      continue;
    unique.add(item.id);
    result.push(
      Object.freeze({
        id: item.id,
        label: item.name,
        position: Object.freeze({ latitude: item.lat, longitude: item.lng }),
      }),
    );
  }
  return Object.freeze(result);
}

export function assertPublicDetailDestination(
  detail: PublicPlaceDetail,
  destinationId: string,
  expectedPlaceId: string,
): PublicPlaceDetail {
  if (
    detail.profile.destinationId !== destinationId ||
    detail.actions.destinationId !== destinationId ||
    detail.profile.id !== expectedPlaceId ||
    detail.actions.placeId !== expectedPlaceId
  )
    throw new Error("CROSS_DESTINATION_PUBLIC_DETAIL_DENIED");
  const location = detail.profile.location;
  if (
    !location ||
    !Number.isFinite(location.latitude) ||
    !Number.isFinite(location.longitude) ||
    Math.abs(location.latitude) > 90 ||
    Math.abs(location.longitude) > 180
  )
    throw new Error("PUBLIC_PLACE_DETAIL_LOCATION_INVALID");
  return detail;
}

export function localeChoice(input: unknown): "pt-BR" | "en" | "es" | "he" {
  if (typeof input !== "string") return "pt-BR";
  const normalized = input.toLowerCase().split("-")[0];
  if (normalized === "en" || normalized === "es" || normalized === "he")
    return normalized;
  return "pt-BR";
}
