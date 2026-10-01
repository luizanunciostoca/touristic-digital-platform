import type { DestinationConfig } from "@touristic/core";

export interface PublicPlaceReadContext {
  readonly destinationId: string;
  readonly bbox: readonly [number, number, number, number];
  readonly zoom: number;
}

export const MORRO_PUBLIC_PLACE_READ_CONTEXT: PublicPlaceReadContext =
  Object.freeze({
    destinationId: "morro-de-sao-paulo",
    bbox: Object.freeze([-39.05, -13.5, -38.89, -13.35] as const),
    zoom: 13,
  });

const DESTINATION_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,159}$/u;

export function resolvePublicPlaceReadContext(
  input: PublicPlaceReadContext = MORRO_PUBLIC_PLACE_READ_CONTEXT,
): PublicPlaceReadContext {
  const destinationId = input.destinationId.trim();
  const [west, south, east, north] = input.bbox;
  const zoom = Number(input.zoom);

  if (!DESTINATION_ID_PATTERN.test(destinationId)) {
    throw new Error("PUBLIC_PLACE_INVALID_DESTINATION");
  }
  if (
    ![west, south, east, north].every(Number.isFinite) ||
    west < -180 ||
    east > 180 ||
    south < -90 ||
    north > 90 ||
    west >= east ||
    south >= north
  ) {
    throw new Error("PUBLIC_PLACE_INVALID_BBOX");
  }
  if (!Number.isFinite(zoom) || zoom < 0 || zoom > 24) {
    throw new Error("PUBLIC_PLACE_INVALID_ZOOM");
  }

  return Object.freeze({
    destinationId,
    bbox: Object.freeze([west, south, east, north] as const),
    zoom,
  });
}

export function allowsMorroLegacyPlaceFallback(
  context: PublicPlaceReadContext,
): boolean {
  return (\n    context.destinationId === MORRO_PUBLIC_PLACE_READ_CONTEXT.destinationId\n  );
}

export function createPublicPlaceReadContextFromDestination(
  destination: Pick<DestinationConfig, "id" | "center" | "radiusMeters">,
): PublicPlaceReadContext {
  const destinationId = String(destination.id);
  if (destinationId === MORRO_PUBLIC_PLACE_READ_CONTEXT.destinationId) {
    return MORRO_PUBLIC_PLACE_READ_CONTEXT;
  }
  if (
    !Number.isFinite(destination.center.latitude) ||
    !Number.isFinite(destination.center.longitude) ||
    !Number.isFinite(destination.radiusMeters) ||
    destination.radiusMeters <= 0
  ) {
    throw new Error("PUBLIC_PLACE_INVALID_DESTINATION_GEOMETRY");
  }

  const latitude = destination.center.latitude;
  const longitude = destination.center.longitude;
  const latitudeDelta = destination.radiusMeters / 111_320;
  const longitudeDelta =
    destination.radiusMeters /
    (111_320 * Math.max(Math.cos((latitude * Math.PI) / 180), 0.2));

  return resolvePublicPlaceReadContext({
    destinationId,
    bbox: Object.freeze([
      Math.max(-180, longitude - longitudeDelta),
      Math.max(-90, latitude - latitudeDelta),
      Math.min(180, longitude + longitudeDelta),
      Math.min(90, latitude + latitudeDelta),
    ] as const),
    zoom: 13,
  });
}
