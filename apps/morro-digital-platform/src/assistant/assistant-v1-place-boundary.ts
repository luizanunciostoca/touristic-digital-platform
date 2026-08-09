import type { AssistantNavigationDestination } from "@touristic/assistant";

export const assistantV1PlaceCenter = Object.freeze({
  latitude: -13.376,
  longitude: -38.917,
});

export const assistantV1PlaceRadiusMeters = 12_000;

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

export function assistantV1PlaceDistanceMeters(
  destination: Pick<
    AssistantNavigationDestination,
    "latitude" | "longitude"
  >,
): number {
  const earthRadiusMeters = 6_371_000;
  const centerLatitude = toRadians(assistantV1PlaceCenter.latitude);
  const destinationLatitude = toRadians(destination.latitude);
  const latitudeDelta = toRadians(
    destination.latitude - assistantV1PlaceCenter.latitude,
  );
  const longitudeDelta = toRadians(
    destination.longitude - assistantV1PlaceCenter.longitude,
  );

  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(centerLatitude) *
      Math.cos(destinationLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;

  return (
    earthRadiusMeters *
    2 *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  );
}

export function isAssistantV1PlaceWithinRadius(
  destination: Pick<
    AssistantNavigationDestination,
    "latitude" | "longitude"
  >,
): boolean {
  return (
    Number.isFinite(destination.latitude) &&
    Number.isFinite(destination.longitude) &&
    destination.latitude >= -90 &&
    destination.latitude <= 90 &&
    destination.longitude >= -180 &&
    destination.longitude <= 180 &&
    assistantV1PlaceDistanceMeters(destination) <= assistantV1PlaceRadiusMeters
  );
}
