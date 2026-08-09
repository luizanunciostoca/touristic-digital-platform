import {
  createAssistantDomainHandlers,
  createAssistantUserProfileManager,
  type AssistantDialogIntentHandler,
  type AssistantDialogResponse,
  type AssistantProfileStorage,
} from "@touristic/assistant";
import {
  fetchMorroWeather,
  type WeatherReading,
} from "../weather/weather-widget.js";
import { resolveAssistantNearby } from "./assistant-nearby-adapter.js";
import {
  fetchAssistantPlaceDetails,
  type AssistantPlaceDetails,
} from "./assistant-place-details-adapter.js";
import { resolveAssistantV1Photos } from "./assistant-v1-photo-catalog.js";

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

const WEATHER_OPTIONS = [
  { label: "Temperatura agora", value: "temperatura agora" },
  { label: "Vai chover?", value: "vai chover" },
  { label: "Previsão do tempo", value: "previsao do tempo" },
  { label: "Como está a maré?", value: "mare" },
  { label: "Voltar ao menu principal", value: "voltar ao menu" },
];

const PLACE_DETAILS_OPTIONS = [
  { label: "Como chegar", value: "como chegar" },
  { label: "Ver fotos", value: "ver fotos" },
  { label: "Horário", value: "horário" },
  { label: "Voltar ao menu principal", value: "voltar ao menu" },
];

function weatherCondition(reading: WeatherReading): string {
  const code = reading.weatherCode;
  if ([95, 96, 99].includes(code)) return "trovoadas";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "precipitação congelada";
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code))
    return "chuva";
  if ([45, 48].includes(code)) return "névoa";
  if (code === 3) return "nublado";
  if ([1, 2].includes(code)) return "parcialmente nublado";
  return reading.isDay ? "céu limpo" : "céu limpo à noite";
}

async function getWeather(
  fetchImplementation: typeof globalThis.fetch,
): Promise<AssistantDialogResponse> {
  try {
    const reading = await fetchMorroWeather(fetchImplementation);
    return {
      text: `Agora em Morro de São Paulo: ${reading.temperatureCelsius}°C, ${weatherCondition(reading)}.`,
      options: [...WEATHER_OPTIONS],
      metadata: {
        domain: "weather",
        state: "resolved",
        temperatureCelsius: reading.temperatureCelsius,
        weatherCode: reading.weatherCode,
        isDay: reading.isDay,
      },
    };
  } catch {
    return {
      text: "Em Morro de São Paulo, a temperatura costuma ficar entre 25°C e 32°C. O período mais chuvoso vai de novembro a março e a época mais seca costuma ser de junho a setembro.",
      options: [...WEATHER_OPTIONS],
      metadata: { domain: "weather", state: "generic_fallback" },
    };
  }
}

function getCurrentLocation(
  geolocation?: AssistantGeolocationPort,
): Promise<AssistantDialogResponse> {
  if (!geolocation) {
    return Promise.resolve({
      text: "Não consegui acessar sua localização neste dispositivo.",
      metadata: { domain: "my_location", state: "unavailable" },
    });
  }

  return new Promise((resolve) => {
    geolocation.getCurrentPosition(
      (position) => {
        resolve({
          text: "Localização atualizada com sucesso.",
          metadata: {
            domain: "my_location",
            state: "resolved",
            location: {
              lat: position.coords.latitude,
              lon: position.coords.longitude,
              accuracy: position.coords.accuracy,
            },
          },
        });
      },
      () => {
        resolve({
          text: "Não consegui obter sua localização. Verifique a permissão de localização e tente novamente.",
          metadata: { domain: "my_location", state: "denied_or_failed" },
        });
      },
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 10_000 },
    );
  });
}

async function getPhotos(
  place: string,
  fetchImplementation: typeof globalThis.fetch,
): Promise<AssistantDialogResponse> {
  const photoSet = resolveAssistantV1Photos(place);
  if (!photoSet) {
    return {
      text: `Não encontrei fotos disponíveis de ${place}.`,
      metadata: { domain: "photos", state: "unavailable", place },
    };
  }

  try {
    const probe = await fetchImplementation(photoSet.images[0], {
      method: "HEAD",
    });
    if (!probe.ok) throw new Error("photo_asset_unavailable");
  } catch {
    return {
      text: `As fotos de ${photoSet.place} estão catalogadas, mas os arquivos ainda não estão disponíveis nesta versão.`,
      metadata: {
        domain: "photos",
        state: "asset_source_pending",
        place: photoSet.place,
        images: [...photoSet.images],
      },
    };
  }

  return {
    text: `Encontrei ${photoSet.images.length} fotos de ${photoSet.place}.`,
    metadata: {
      domain: "photos",
      state: "resolved",
      place: photoSet.place,
      images: [...photoSet.images],
      presentation: "carousel",
    },
  };
}

function formatPlaceDetails(details: AssistantPlaceDetails): string {
  const parts = [details.name];
  if (details.category) parts.push(details.category);
  if (details.address) parts.push(details.address);
  if (details.openNow !== null)
    parts.push(details.openNow ? "Aberto agora" : "Fechado agora");
  if (details.phone) parts.push(`Telefone: ${details.phone}`);
  if (details.website) parts.push(`Site: ${details.website}`);
  return parts.join(" · ");
}

async function getPlaceDetails(
  place: string,
  options: AssistantBrowserDomainAdapterOptions,
): Promise<AssistantDialogResponse> {
  const details = await fetchAssistantPlaceDetails(place, {
    ...(options.mapboxAccessToken
      ? { accessToken: options.mapboxAccessToken }
      : {}),
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
  if (!details) {
    return {
      text: `Não encontrei detalhes atualizados de ${place}.`,
      options: [...PLACE_DETAILS_OPTIONS],
      metadata: { domain: "more_info", state: "unavailable", place },
    };
  }

  return {
    text: formatPlaceDetails(details),
    options: [...PLACE_DETAILS_OPTIONS],
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
  options: AssistantBrowserDomainAdapterOptions,
): Promise<AssistantDialogResponse> {
  const details = await fetchAssistantPlaceDetails(place, {
    ...(options.mapboxAccessToken
      ? { accessToken: options.mapboxAccessToken }
      : {}),
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
  if (!details || details.openNow === null) {
    return {
      text: `Não encontrei um horário de funcionamento atualizado para ${place}.`,
      metadata: { domain: "hours", state: "unavailable", place },
    };
  }

  return {
    text: `${details.name} está ${details.openNow ? "aberto" : "fechado"} agora.`,
    options: [...PLACE_DETAILS_OPTIONS],
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

  return createAssistantDomainHandlers({
    ports: {
      weather: () => getWeather(fetchImplementation),
      myLocation: () => getCurrentLocation(options.geolocation),
      photos: (place) => getPhotos(place, fetchImplementation),
      price: (place) => ({
        text: `Os preços de ${place} ainda estão sendo conectados à nova arquitetura.`,
        metadata: { domain: "price", state: "provider_pending", place },
      }),
      hours: (place) => getPlaceHours(place, options),
      moreInfo: (place) => getPlaceDetails(place, options),
      nearby: (request) => resolveAssistantNearby(request, options.geolocation),
      favorites: () => {
        const favorites = profile.getFavoritePlaces();
        if (favorites.length === 0) {
          return {
            text: "Você ainda não adicionou lugares aos favoritos.",
            metadata: { domain: "favorites", count: 0 },
          };
        }
        return {
          text: `Seus favoritos: ${favorites.map((place) => place.name).join(", ")}.`,
          options: favorites.map((place) => ({
            label: place.name,
            value: place.name,
          })),
          metadata: { domain: "favorites", count: favorites.length },
        };
      },
      help: () => ({
        text: "Posso ajudar com praias, restaurantes, pousadas, atrações, passeios, vida noturna, localização, favoritos e rotas.",
        options: [
          { label: "Praias", value: "praias" },
          { label: "Restaurantes", value: "restaurantes" },
          { label: "Pousadas", value: "pousadas" },
          { label: "Atrações", value: "atrações" },
        ],
        metadata: { domain: "help" },
      }),
    },
  });
}
