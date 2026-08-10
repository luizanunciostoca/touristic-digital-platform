import type {
  AssistantDialogIntentHandlerContext,
  AssistantDialogResponse,
} from "@touristic/assistant";

import {
  nearbyCopy,
  nearbyResolvedCopy,
  type AssistantDomainLanguage,
} from "./assistant-domain-copy.js";
import { morroV1SearchCatalog } from "@touristic/search";
import { isAssistantV1PlaceWithinRadius } from "./assistant-v1-place-boundary.js";

export interface AssistantNearbyGeolocationPort {
  getCurrentPosition(
    success: PositionCallback,
    error?: PositionErrorCallback | null,
    options?: PositionOptions,
  ): void;
}

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
  return (
    request.intent.entities.category ?? request.context.lastCategory ?? null
  );
}

function languageOf(
  request: AssistantDialogIntentHandlerContext,
): AssistantDomainLanguage {
  return request.intent.entities.language ?? "pt";
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
  const language = languageOf(request);
  if (!category) {
    const copy = nearbyCopy(language, "awaiting_category");
    return {
      text: copy.text,
      ...(copy.options ? { options: [...copy.options] } : {}),
      metadata: { domain: "nearby", state: "awaiting_category" },
    };
  }

  if (!geolocation) {
    return {
      text: nearbyCopy(language, "location_required").text,
      metadata: {
        domain: "nearby",
        state: "location_required",
        category,
      },
    };
  }

  try {
    const position = await requestPosition(geolocation);
    const latitude = position.coords.latitude;
    const longitude = position.coords.longitude;
    const results = morroV1SearchCatalog
      .filter(
        (entry) =>
          entry.category === category && isAssistantV1PlaceWithinRadius(entry),
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
      const copy = nearbyCopy(language, "empty");
      return {
        text: copy.text,
        ...(copy.options ? { options: [...copy.options] } : {}),
        metadata: { domain: "nearby", state: "empty", category },
      };
    }

    return {
      text: nearbyResolvedCopy(language, results),
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
      text: nearbyCopy(language, "denied_or_failed").text,
      metadata: {
        domain: "nearby",
        state: "denied_or_failed",
        category,
      },
    };
  }
}
