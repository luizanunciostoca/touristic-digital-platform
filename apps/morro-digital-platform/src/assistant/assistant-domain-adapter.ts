import {
  createAssistantDomainHandlers,
  createAssistantUserProfileManager,
  type AssistantDialogIntentHandler,
  type AssistantDialogResponse,
  type AssistantProfileStorage,
} from "@touristic/assistant";
import { fetchMorroWeather } from "../weather/weather-widget.js";
import { createAssistantSearchHandler } from "./assistant-search-adapter.js";
import { resolveAssistantNearby } from "./assistant-nearby-adapter.js";
import {
  askPlaceCopy,
  favoritesCopy,
  formatPlaceDetailsCopy,
  helpResponse,
  hoursCopy,
  locationCopy,
  moreInfoUnavailable,
  photosCopy,
  placeDetailsOptions,
  priceCopy,
  type AssistantDomainLanguage,
} from "./assistant-domain-copy.js";
import { fetchAssistantPlaceDetails } from "./assistant-place-details-adapter.js";
import { resolveAssistantV1Photos } from "./assistant-v1-photo-catalog.js";
import {
  assistantWeatherFallback,
  formatAssistantWeather,
  type AssistantWeatherLanguage,
} from "./assistant-weather-copy.js";

export interface AssistantGeolocationPort {
  getCurrentPosition(
    success: PositionCallback,
    error?: PositionErrorCallback | null,
    options?: PositionOptions,
  ): void;
}

export interface AssistantBrowserDomainAdapterOptions {
  readonly storage?: AssistantProfileStorage;
  readonly geolocation?: AssistantGeolocationPort;
  readonly fetch?: typeof globalThis.fetch;
  readonly mapboxAccessToken?: string;
}

async function getWeather(
  fetchImplementation: typeof globalThis.fetch,
  language: AssistantWeatherLanguage,
): Promise<AssistantDialogResponse> {
  try {
    const reading = await fetchMorroWeather(fetchImplementation);
    const copy = formatAssistantWeather(reading, language);
    return {
      text: copy.text,
      options: [...copy.options],
      metadata: {
        domain: "weather",
        state: "resolved",
        language,
        temperatureCelsius: reading.temperatureCelsius,
        temperatureMaxCelsius: reading.temperatureMaxCelsius,
        temperatureMinCelsius: reading.temperatureMinCelsius,
        humidityPercent: reading.humidityPercent,
        windSpeedKph: reading.windSpeedKph,
        rainChancePercent: reading.rainChancePercent,
        weatherCode: reading.weatherCode,
        isDay: reading.isDay,
      },
    };
  } catch {
    const copy = assistantWeatherFallback(language);
    return {
      text: copy.text,
      options: [...copy.options],
      metadata: { domain: "weather", state: "generic_fallback", language },
    };
  }
}

function getCurrentLocation(
  language: AssistantDomainLanguage,
  geolocation?: AssistantGeolocationPort,
): Promise<AssistantDialogResponse> {
  const copy = locationCopy(language);
  if (!geolocation) {
    return Promise.resolve({
      text: copy.unavailable,
      metadata: { domain: "my_location", state: "unavailable" },
    });
  }
  return new Promise((resolve) => {
    geolocation.getCurrentPosition(
      (position) =>
        resolve({
          text: copy.resolved,
          metadata: {
            domain: "my_location",
            state: "resolved",
            location: {
              lat: position.coords.latitude,
              lon: position.coords.longitude,
              accuracy: position.coords.accuracy,
            },
          },
        }),
      () =>
        resolve({
          text: copy.failed,
          metadata: { domain: "my_location", state: "denied_or_failed" },
        }),
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 10_000 },
    );
  });
}

async function getPhotos(
  place: string,
  language: AssistantDomainLanguage,
  fetchImplementation: typeof globalThis.fetch,
): Promise<AssistantDialogResponse> {
  const photoSet = resolveAssistantV1Photos(place);
  if (!photoSet)
    return {
      text: photosCopy(language, "unavailable", place),
      metadata: { domain: "photos", state: "unavailable", place },
    };
  const firstImage = photoSet.images[0];
  if (!firstImage)
    return {
      text: photosCopy(language, "unavailable", photoSet.place),
      metadata: {
        domain: "photos",
        state: "unavailable",
        place: photoSet.place,
      },
    };
  try {
    const probe = await fetchImplementation(firstImage, { method: "HEAD" });
    if (!probe.ok) throw new Error("photo_asset_unavailable");
  } catch {
    return {
      text: photosCopy(language, "asset_source_pending", photoSet.place),
      metadata: {
        domain: "photos",
        state: "asset_source_pending",
        place: photoSet.place,
        images: [...photoSet.images],
      },
    };
  }
  return {
    text: photosCopy(
      language,
      "resolved",
      photoSet.place,
      photoSet.images.length,
    ),
    metadata: {
      domain: "photos",
      state: "resolved",
      place: photoSet.place,
      images: [...photoSet.images],
      presentation: "carousel",
    },
  };
}

async function getPlaceDetails(
  place: string,
  language: AssistantDomainLanguage,
  options: AssistantBrowserDomainAdapterOptions,
): Promise<AssistantDialogResponse> {
  const details = await fetchAssistantPlaceDetails(place, {
    ...(options.mapboxAccessToken
      ? { accessToken: options.mapboxAccessToken }
      : {}),
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
  if (!details)
    return {
      text: moreInfoUnavailable(language, place),
      options: [...placeDetailsOptions(language)],
      metadata: { domain: "more_info", state: "unavailable", place },
    };
  return {
    text: formatPlaceDetailsCopy(language, details),
    options: [...placeDetailsOptions(language)],
    metadata: {
      domain: "more_info",
      state: "resolved",
      place: details.name,
      details,
    },
  };
}

async function getPlaceHours(
  place: string,
  language: AssistantDomainLanguage,
  options: AssistantBrowserDomainAdapterOptions,
): Promise<AssistantDialogResponse> {
  const details = await fetchAssistantPlaceDetails(place, {
    ...(options.mapboxAccessToken
      ? { accessToken: options.mapboxAccessToken }
      : {}),
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
  if (!details || details.openNow === null)
    return {
      text: hoursCopy(language, place, null),
      metadata: { domain: "hours", state: "unavailable", place },
    };
  return {
    text: hoursCopy(language, details.name, details.openNow),
    options: [...placeDetailsOptions(language)],
    metadata: {
      domain: "hours",
      state: "resolved",
      place: details.name,
      openNow: details.openNow,
    },
  };
}

export function createAssistantBrowserDomainHandlers(
  options: AssistantBrowserDomainAdapterOptions = {},
): Partial<Record<string, AssistantDialogIntentHandler>> {
  const profile = createAssistantUserProfileManager(
    options.storage ? { storage: options.storage } : {},
  );
  const fetchImplementation = options.fetch ?? globalThis.fetch;

  const domainHandlers = createAssistantDomainHandlers({
    copy: {
      askPlace: (intent, request) => ({
        text: askPlaceCopy(request.intent.entities.language ?? "pt", intent),
        metadata: { domain: intent, state: "awaiting_place" },
      }),
    },
    ports: {
      weather: (request) =>
        getWeather(
          fetchImplementation,
          request.intent.entities.language ?? "pt",
        ),
      myLocation: (request) =>
        getCurrentLocation(
          request.intent.entities.language ?? "pt",
          options.geolocation,
        ),
      photos: (place, request) =>
        getPhotos(
          place,
          request.intent.entities.language ?? "pt",
          fetchImplementation,
        ),
      price: (place, request) => {
        const language = request.intent.entities.language ?? "pt";
        return {
          text: priceCopy(language, place),
          options: [...placeDetailsOptions(language)],
          metadata: { domain: "price", state: "v1_guidance", place },
        };
      },
      hours: (place, request) =>
        getPlaceHours(place, request.intent.entities.language ?? "pt", options),
      moreInfo: (place, request) =>
        getPlaceDetails(
          place,
          request.intent.entities.language ?? "pt",
          options,
        ),
      nearby: (request) => resolveAssistantNearby(request, options.geolocation),
      favorites: (request) => {
        const language = request.intent.entities.language ?? "pt";
        const favorites = profile.getFavoritePlaces();
        return {
          text: favoritesCopy(
            language,
            favorites.map((place) => place.name),
          ),
          ...(favorites.length > 0
            ? {
                options: favorites.map((place) => ({
                  label: place.name,
                  value: place.name,
                })),
              }
            : {}),
          metadata: { domain: "favorites", count: favorites.length },
        };
      },
      help: (request) => {
        const copy = helpResponse(request.intent.entities.language ?? "pt");
        return {
          text: copy.text,
          options: [...copy.options],
          metadata: { domain: "help" },
        };
      },
    },
  });

  return {
    ...domainHandlers,
    place_search: createAssistantSearchHandler({
      ...(options.fetch ? { fetch: options.fetch } : {}),
      ...(options.mapboxAccessToken
        ? { mapboxAccessToken: options.mapboxAccessToken }
        : {}),
    }),
  };
}
