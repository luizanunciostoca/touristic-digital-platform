import {
  createAssistantDomainHandlers,
  createAssistantUserProfileManager,
  type AssistantDialogIntentHandler,
  type AssistantDialogIntentHandlerContext,
  type AssistantDialogResponse,
  type AssistantProfileStorage,
} from "@touristic/assistant";
import {
  fetchMorroWeather,
  weatherCondition,
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
  readonly language?: () => string;
}

type WeatherLanguage = "pt" | "en" | "es" | "he";

const WEATHER_COPY = {
  pt: {
    temperature: "Temperatura agora",
    rain: "Vai chover?",
    forecast: "Previsão do tempo",
    tide: "Como está a maré?",
    back: "Voltar ao menu principal",
    current: (reading: WeatherReading, condition: string) =>
      `Agora em Morro de São Paulo: ${reading.temperatureCelsius}°C, ${condition}. Máxima de ${reading.forecast[0]?.highCelsius}°C e mínima de ${reading.forecast[0]?.lowCelsius}°C, umidade ${reading.humidityPercent}%, vento ${reading.windKph} km/h e chance de chuva ${reading.precipitationProbability}%.`,
    rainAnswer: (reading: WeatherReading) =>
      `A chance de chuva agora é de ${reading.precipitationProbability}%. Para hoje, a previsão indica até ${reading.forecast[0]?.precipitationProbability}%.`,
    forecastAnswer: (reading: WeatherReading) =>
      `Hoje: máxima de ${reading.forecast[0]?.highCelsius}°C, mínima de ${reading.forecast[0]?.lowCelsius}°C, umidade ${reading.forecast[0]?.humidityPercent}% e vento de até ${reading.forecast[0]?.windKph} km/h. A previsão de 7 dias está disponível no widget de clima.`,
    fallback:
      "Em Morro de São Paulo, a temperatura costuma ficar entre 25°C e 32°C. O período mais chuvoso vai de novembro a março e a época mais seca costuma ser de junho a setembro.",
  },
  en: {
    temperature: "Temperature now",
    rain: "Will it rain?",
    forecast: "Weather forecast",
    tide: "How is the tide?",
    back: "Back to main menu",
    current: (reading: WeatherReading, condition: string) =>
      `Right now in Morro de São Paulo: ${reading.temperatureCelsius}°C, ${condition}. High ${reading.forecast[0]?.highCelsius}°C and low ${reading.forecast[0]?.lowCelsius}°C, humidity ${reading.humidityPercent}%, wind ${reading.windKph} km/h, and ${reading.precipitationProbability}% chance of rain.`,
    rainAnswer: (reading: WeatherReading) =>
      `The chance of rain right now is ${reading.precipitationProbability}%. Today's forecast reaches ${reading.forecast[0]?.precipitationProbability}%.`,
    forecastAnswer: (reading: WeatherReading) =>
      `Today: high ${reading.forecast[0]?.highCelsius}°C, low ${reading.forecast[0]?.lowCelsius}°C, humidity ${reading.forecast[0]?.humidityPercent}%, and winds up to ${reading.forecast[0]?.windKph} km/h. The full 7-day forecast is available in the weather widget.`,
    fallback:
      "In Morro de São Paulo, temperatures are usually between 25°C and 32°C. The rainier period is generally from November to March, while June to September is usually drier.",
  },
  es: {
    temperature: "Temperatura ahora",
    rain: "¿Va a llover?",
    forecast: "Pronóstico del tiempo",
    tide: "¿Cómo está la marea?",
    back: "Volver al menú principal",
    current: (reading: WeatherReading, condition: string) =>
      `Ahora en Morro de São Paulo: ${reading.temperatureCelsius}°C, ${condition}. Máxima de ${reading.forecast[0]?.highCelsius}°C y mínima de ${reading.forecast[0]?.lowCelsius}°C, humedad ${reading.humidityPercent}%, viento ${reading.windKph} km/h y ${reading.precipitationProbability}% de probabilidad de lluvia.`,
    rainAnswer: (reading: WeatherReading) =>
      `La probabilidad de lluvia ahora es del ${reading.precipitationProbability}%. Para hoy, el pronóstico llega al ${reading.forecast[0]?.precipitationProbability}%.`,
    forecastAnswer: (reading: WeatherReading) =>
      `Hoy: máxima de ${reading.forecast[0]?.highCelsius}°C, mínima de ${reading.forecast[0]?.lowCelsius}°C, humedad ${reading.forecast[0]?.humidityPercent}% y viento de hasta ${reading.forecast[0]?.windKph} km/h. El pronóstico completo de 7 días está disponible en el widget del clima.`,
    fallback:
      "En Morro de São Paulo, la temperatura suele estar entre 25°C y 32°C. El período más lluvioso suele ser de noviembre a marzo y la época más seca de junio a septiembre.",
  },
  he: {
    temperature: "הטמפרטורה עכשיו",
    rain: "האם ירד גשם?",
    forecast: "תחזית מזג אוויר",
    tide: "מה מצב הגאות?",
    back: "חזרה לתפריט הראשי",
    current: (reading: WeatherReading, condition: string) =>
      `עכשיו במורו דה סאו פאולו: ${reading.temperatureCelsius}°C, ${condition}. מקסימום ${reading.forecast[0]?.highCelsius}°C ומינימום ${reading.forecast[0]?.lowCelsius}°C, לחות ${reading.humidityPercent}%, רוח ${reading.windKph} קמ״ש וסיכוי לגשם ${reading.precipitationProbability}%.`,
    rainAnswer: (reading: WeatherReading) =>
      `הסיכוי לגשם עכשיו הוא ${reading.precipitationProbability}%. התחזית להיום מגיעה ל-${reading.forecast[0]?.precipitationProbability}%.`,
    forecastAnswer: (reading: WeatherReading) =>
      `היום: מקסימום ${reading.forecast[0]?.highCelsius}°C, מינימום ${reading.forecast[0]?.lowCelsius}°C, לחות ${reading.forecast[0]?.humidityPercent}% ורוח עד ${reading.forecast[0]?.windKph} קמ״ש. תחזית מלאה ל-7 ימים זמינה בווידג׳ט מזג האוויר.`,
    fallback:
      "במורו דה סאו פאולו הטמפרטורות בדרך כלל נעות בין 25°C ל-32°C. התקופה הגשומה יותר היא בדרך כלל מנובמבר עד מרץ, והתקופה היבשה יותר מיוני עד ספטמבר.",
  },
} as const;

const PLACE_DETAILS_OPTIONS = [
  { label: "Como chegar", value: "como chegar" },
  { label: "Ver fotos", value: "ver fotos" },
  { label: "Horário", value: "horário" },
  { label: "Voltar ao menu principal", value: "voltar ao menu" },
];

function resolveWeatherLanguage(value?: string): WeatherLanguage {
  const language = value?.toLowerCase() ?? "pt";
  if (language.startsWith("en")) return "en";
  if (language.startsWith("es")) return "es";
  if (language.startsWith("he")) return "he";
  return "pt";
}

function weatherOptions(language: WeatherLanguage) {
  const copy = WEATHER_COPY[language];
  return [
    { label: copy.temperature, value: "temperatura agora" },
    { label: copy.rain, value: "vai chover" },
    { label: copy.forecast, value: "previsao do tempo" },
    { label: copy.tide, value: "mare" },
    { label: copy.back, value: "voltar ao menu" },
  ];
}

function weatherResponseText(
  request: AssistantDialogIntentHandlerContext,
  reading: WeatherReading,
  language: WeatherLanguage,
): string {
  const input = `${request.input} ${request.intent.normalized}`.toLowerCase();
  const copy = WEATHER_COPY[language];
  if (/chuva|chover|rain|lluv|גשם/u.test(input)) return copy.rainAnswer(reading);
  if (/previs|forecast|pron[oó]stico|תחזית/u.test(input)) {
    return copy.forecastAnswer(reading);
  }
  return copy.current(
    reading,
    weatherCondition(reading.weatherCode, language, reading.isDay),
  );
}

async function getWeather(
  request: AssistantDialogIntentHandlerContext,
  fetchImplementation: typeof globalThis.fetch,
  language: WeatherLanguage,
): Promise<AssistantDialogResponse> {
  try {
    const reading = await fetchMorroWeather(fetchImplementation);
    return {
      text: weatherResponseText(request, reading, language),
      options: weatherOptions(language),
      metadata: {
        domain: "weather",
        state: "resolved",
        temperatureCelsius: reading.temperatureCelsius,
        weatherCode: reading.weatherCode,
        isDay: reading.isDay,
        humidityPercent: reading.humidityPercent,
        windKph: reading.windKph,
        precipitationProbability: reading.precipitationProbability,
        forecast: reading.forecast,
      },
    };
  } catch {
    return {
      text: WEATHER_COPY[language].fallback,
      options: weatherOptions(language),
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

  const firstImage = photoSet.images[0];
  if (!firstImage) {
    return {
      text: `Não encontrei fotos disponíveis de ${photoSet.place}.`,
      metadata: {
        domain: "photos",
        state: "unavailable",
        place: photoSet.place,
      },
    };
  }

  try {
    const probe = await fetchImplementation(firstImage, {
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
      weather: (request) =>
        getWeather(
          request,
          fetchImplementation,
          resolveWeatherLanguage(options.language?.()),
        ),
      myLocation: () => getCurrentLocation(options.geolocation),
      photos: (place) => getPhotos(place, fetchImplementation),
      price: (place) => ({
        text:
          `💰 Sobre preços em <b>${place}</b>:<br><br>` +
          `As informações de preço podem variar. Recomendo verificar diretamente com o estabelecimento.<br><br>` +
          `Em geral, as praias de Morro de São Paulo são <b>gratuitas</b>. Passeios de barco custam em torno de <b>R$ 80-150</b> por pessoa. Restaurantes variam de <b>R$ 30-150</b> por pessoa.`,
        options: [...PLACE_DETAILS_OPTIONS],
        metadata: { domain: "price", state: "v1_guidance", place },
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
