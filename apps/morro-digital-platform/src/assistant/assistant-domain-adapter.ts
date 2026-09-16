import {
  createAssistantDomainHandlers,
  createAssistantUserProfileManager,
  type AssistantDialogIntentHandler,
  type AssistantDialogResponse,
  type AssistantProfileStorage,
} from "@touristic/assistant";
import { morroV1SearchCatalog, normalizeSearchText } from "@touristic/search";
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

type AssistantProfileManager = ReturnType<
  typeof createAssistantUserProfileManager
>;

type FavoriteOperation = "add" | "remove";

export interface AssistantBrowserDomainAdapterOptions {
  readonly storage?: AssistantProfileStorage;
  readonly profile?: AssistantProfileManager;
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

function conversationResponse(
  language: AssistantDomainLanguage,
  kind: "greeting" | "thanks" | "confirm" | "deny",
): AssistantDialogResponse {
  const text = {
    pt: {
      greeting:
        "Olá! Posso te ajudar a explorar Morro de São Paulo. O que você quer descobrir?",
      thanks:
        "Por nada! Se quiser, posso continuar te ajudando com lugares, clima, fotos ou rotas.",
      confirm: "Certo. Como posso continuar te ajudando?",
      deny: "Tudo bem. O que você gostaria de fazer agora?",
    },
    en: {
      greeting:
        "Hi! I can help you explore Morro de São Paulo. What would you like to discover?",
      thanks:
        "You're welcome! I can keep helping with places, weather, photos or routes.",
      confirm: "Sure. How can I keep helping?",
      deny: "No problem. What would you like to do now?",
    },
    es: {
      greeting:
        "¡Hola! Puedo ayudarte a explorar Morro de São Paulo. ¿Qué quieres descubrir?",
      thanks:
        "¡De nada! Puedo seguir ayudándote con lugares, clima, fotos o rutas.",
      confirm: "Perfecto. ¿Cómo puedo seguir ayudándote?",
      deny: "Está bien. ¿Qué te gustaría hacer ahora?",
    },
    he: {
      greeting:
        "שלום! אני יכול לעזור לך לחקור את מורו דה סאו פאולו. מה תרצה לגלות?",
      thanks:
        "בשמחה! אני יכול להמשיך לעזור עם מקומות, מזג אוויר, תמונות או מסלולים.",
      confirm: "בסדר. איך אוכל להמשיך לעזור?",
      deny: "אין בעיה. מה תרצה לעשות עכשיו?",
    },
  } as const;
  const help = helpResponse(language);
  return {
    text: text[language][kind],
    options: [...help.options],
    metadata: { domain: "conversation", state: kind },
  };
}

function favoriteOperationFromInput(input: string): FavoriteOperation | null {
  const normalized = normalizeSearchText(input);
  if (
    /(remover|retirar|tirar|excluir|remove|delete|quitar|eliminar|הסר)/u.test(
      normalized,
    )
  ) {
    return "remove";
  }
  if (
    /(adicionar|adicione|favoritar|salvar|guardar|add|save|agregar|anadir|הוסף|שמור)/u.test(
      normalized,
    )
  ) {
    return "add";
  }
  return null;
}

function pendingFavoriteOperation(
  awaiting: Record<string, unknown> | null,
): FavoriteOperation | null {
  if (
    awaiting?.type !== "awaiting_place" ||
    awaiting.intent !== "favorites"
  ) {
    return null;
  }
  return awaiting.operation === "add" || awaiting.operation === "remove"
    ? awaiting.operation
    : null;
}

function canonicalFavoritePlace(value: string): string {
  const normalized = normalizeSearchText(value);
  return (
    morroV1SearchCatalog.find(
      (place) => normalizeSearchText(place.name) === normalized,
    )?.name ?? value.trim()
  );
}

function favoriteMutationText(
  language: AssistantDomainLanguage,
  state: "ask_add" | "ask_remove" | "added" | "removed" | "already" | "missing",
  place?: string,
): string {
  const copy = {
    pt: {
      ask_add: "Qual local você quer adicionar aos favoritos?",
      ask_remove: "Qual local você quer remover dos favoritos?",
      added: `Salvei ${place ?? "esse local"} nos favoritos.`,
      removed: `Removi ${place ?? "esse local"} dos favoritos.`,
      already: `${place ?? "Esse local"} já está nos seus favoritos.`,
      missing: `${place ?? "Esse local"} não está nos seus favoritos.`,
    },
    en: {
      ask_add: "Which place would you like to add to favorites?",
      ask_remove: "Which place would you like to remove from favorites?",
      added: `I saved ${place ?? "that place"} to your favorites.`,
      removed: `I removed ${place ?? "that place"} from your favorites.`,
      already: `${place ?? "That place"} is already in your favorites.`,
      missing: `${place ?? "That place"} is not in your favorites.`,
    },
    es: {
      ask_add: "¿Qué lugar quieres añadir a favoritos?",
      ask_remove: "¿Qué lugar quieres eliminar de favoritos?",
      added: `Guardé ${place ?? "ese lugar"} en tus favoritos.`,
      removed: `Eliminé ${place ?? "ese lugar"} de tus favoritos.`,
      already: `${place ?? "Ese lugar"} ya está en tus favoritos.`,
      missing: `${place ?? "Ese lugar"} no está en tus favoritos.`,
    },
    he: {
      ask_add: "איזה מקום תרצה להוסיף למועדפים?",
      ask_remove: "איזה מקום תרצה להסיר מהמועדפים?",
      added: `שמרתי את ${place ?? "המקום הזה"} במועדפים שלך.`,
      removed: `הסרתי את ${place ?? "המקום הזה"} מהמועדפים שלך.`,
      already: `${place ?? "המקום הזה"} כבר נמצא במועדפים שלך.`,
      missing: `${place ?? "המקום הזה"} לא נמצא במועדפים שלך.`,
    },
  } as const;
  return copy[language][state];
}

export function createAssistantBrowserDomainHandlers(
  options: AssistantBrowserDomainAdapterOptions = {},
): Partial<Record<string, AssistantDialogIntentHandler>> {
  const profile =
    options.profile ??
    createAssistantUserProfileManager(
      options.storage ? { storage: options.storage } : {},
    );
  const fetchImplementation = options.fetch ?? globalThis.fetch;

  const domainHandlers = createAssistantDomainHandlers({
    copy: {
      askPlace: (intent, request) => ({
        text: askPlaceCopy(
          request.intent.entities.language ?? "pt",
          intent === "open_now" ? "hours" : intent,
        ),
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
        const operation =
          favoriteOperationFromInput(request.input) ??
          pendingFavoriteOperation(request.context.awaiting);
        const rawPlace = request.intent.entities.place ?? request.context.lastPlace;

        if (operation && !rawPlace) {
          return {
            text: favoriteMutationText(
              language,
              operation === "add" ? "ask_add" : "ask_remove",
            ),
            metadata: {
              domain: "favorites",
              state: "awaiting_place",
              operation,
            },
          };
        }

        if (operation && rawPlace) {
          const place = canonicalFavoritePlace(rawPlace);
          const favorites = profile.getFavoritePlaces();
          const existing = favorites.find(
            (favorite) =>
              normalizeSearchText(favorite.name) === normalizeSearchText(place),
          );

          if (operation === "add") {
            if (existing) {
              return {
                text: favoriteMutationText(language, "already", existing.name),
                metadata: {
                  domain: "favorites",
                  state: "already_saved",
                  place: existing.name,
                  count: favorites.length,
                },
              };
            }
            profile.addFavoritePlace({ name: place });
            return {
              text: favoriteMutationText(language, "added", place),
              options: [{ label: place, value: place }],
              metadata: {
                domain: "favorites",
                state: "added",
                place,
                count: profile.getFavoritePlaces().length,
              },
            };
          }

          if (!existing) {
            return {
              text: favoriteMutationText(language, "missing", place),
              metadata: {
                domain: "favorites",
                state: "not_found",
                place,
                count: favorites.length,
              },
            };
          }
          profile.removeFavoritePlace(existing.name);
          return {
            text: favoriteMutationText(language, "removed", existing.name),
            metadata: {
              domain: "favorites",
              state: "removed",
              place: existing.name,
              count: profile.getFavoritePlaces().length,
            },
          };
        }

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

  const conversational =
    (
      kind: "greeting" | "thanks" | "confirm" | "deny",
    ): AssistantDialogIntentHandler =>
    (request) =>
      conversationResponse(request.intent.entities.language ?? "pt", kind);

  return {
    ...domainHandlers,
    greeting: conversational("greeting"),
    thanks: conversational("thanks"),
    confirm: conversational("confirm"),
    deny: conversational("deny"),
    place_search: createAssistantSearchHandler({
      ...(options.fetch ? { fetch: options.fetch } : {}),
      ...(options.mapboxAccessToken
        ? { mapboxAccessToken: options.mapboxAccessToken }
        : {}),
    }),
  };
}
