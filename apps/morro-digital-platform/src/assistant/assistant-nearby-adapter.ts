import type {
  AssistantDialogIntentHandlerContext,
  AssistantDialogResponse,
} from "@touristic/assistant";

import { morroAssistantV1DestinationCatalog } from "./assistant-v1-destination-catalog.js";
import { isAssistantV1PlaceWithinRadius } from "./assistant-v1-place-boundary.js";

export interface AssistantNearbyGeolocationPort {
  getCurrentPosition(
    success: PositionCallback,
    error?: PositionErrorCallback | null,
    options?: PositionOptions,
  ): void;
}

const NEARBY_CATEGORY_OPTIONS = [
  { label: "Praias", value: "praias perto de mim" },
  { label: "Restaurantes", value: "restaurantes perto de mim" },
  { label: "Pousadas", value: "pousadas perto de mim" },
  { label: "Atrações", value: "atrações perto de mim" },
  { label: "Passeios", value: "passeios perto de mim" },
  { label: "Emergências", value: "emergências perto de mim" },
];

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function distanceMeters(
  latitude: number,
  longitude: number,
  destinationLatitude: number,
  destinationLongitude: number,
): number {
  const earthRadiusMeters = 6_371_000;
  const latitudeDelta = toRadians(destinationLatitude - latitude);
  const longitudeDelta = toRadians(destinationLongitude - longitude);
  const originLatitude = toRadians(latitude);
  const targetLatitude = toRadians(destinationLatitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(originLatitude) *
      Math.cos(targetLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;

  return (
    earthRadiusMeters *
    2 *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  );
}

function resolveCategory(
  request: AssistantDialogIntentHandlerContext,
): string | null {
  return request.intent.entities.category ?? request.context.lastCategory ?? null;
}

function requestPosition(
  geolocation: AssistantNearbyGeolocationPort,
): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      maximumAge: 15_000,
      timeout: 10_000,
    });
  });
}

export async function resolveAssistantNearby(
  request: AssistantDialogIntentHandlerContext,
  geolocation?: AssistantNearbyGeolocationPort,
): Promise<AssistantDialogResponse> {
  const category = resolveCategory(request);
  if (!category) {
    return {
      text: "Posso buscar o que está mais perto de você, mas primeiro me diga a categoria: praias, restaurantes, pousadas, atrações, passeios ou emergências.",
      options: [...NEARBY_CATEGORY_OPTIONS],
      metadata: { domain: "nearby", state: "awaiting_category" },
    };
  }

  if (!geolocation) {
    return {
      text: "Para buscar lugares próximos, preciso da sua localização atual.",
      metadata: { domain: "nearby", state: "location_required", category },
    };
  }

  try {
    const position = await requestPosition(geolocation);
    const latitude = position.coords.latitude;
    const longitude = position.coords.longitude;
    const results = morroAssistantV1DestinationCatalog
      .filter(
        (entry) =>
          entry.category === category &&
          isAssistantV1PlaceWithinRadius(entry),
      )
      .map((entry) => ({
        name: entry.name,
        distanceMeters: Math.round(
          distanceMeters(latitude, longitude, entry.latitude, entry.longitude),
        ),
      }))
      .sort((left, right) => left.distanceMeters - right.distanceMeters)
      .slice(0, 5);

    if (results.length === 0) {
      return {
        text: "Não encontrei locais dessa categoria no catálogo curado de Morro de São Paulo.",
        options: [...NEARBY_CATEGORY_OPTIONS],
        metadata: { domain: "nearby", state: "empty", category },
      };
    }

    return {
      text: `Mais perto de você: ${results
        .map((result) => `${result.name} (${result.distanceMeters} m)`)
        .join(", ")}.`,
      options: results.map((result) => ({
        label: result.name,
        value: result.name,
      })),
      metadata: {
        domain: "nearby",
        state: "resolved",
        category,
        count: results.length,
        results,
      },
    };
  } catch {
    return {
      text: "Não consegui obter sua localização. Verifique a permissão de localização e tente novamente.",
      metadata: { domain: "nearby", state: "denied_or_failed", category },
    };
  }
}
