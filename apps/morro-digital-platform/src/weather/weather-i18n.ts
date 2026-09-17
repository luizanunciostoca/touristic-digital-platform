import {
  normalizeTourLocale,
  type TourLocale,
} from "../config/tour-localization.js";

export type WeatherLocale = TourLocale;

export interface WeatherPresentationCopy {
  readonly widgetOpenLabel: string;
  readonly clickHere: string;
  readonly updateError: string;
  readonly forecastTitle: string;
  readonly forecastCloseLabel: string;
  readonly forecastDaysLabel: string;
  readonly chartLabel: string;
  readonly unavailableDate: string;
  readonly high: string;
  readonly low: string;
  readonly rain: string;
  readonly humidity: string;
  readonly wind: string;
  readonly windUnit: string;
  readonly conditions: Readonly<{
    clear: string;
    partlyCloudy: string;
    cloudy: string;
    fog: string;
    lightRain: string;
    rain: string;
    snow: string;
    thunderstorm: string;
    unknown: string;
  }>;
}

const COPY: Readonly<Record<WeatherLocale, WeatherPresentationCopy>> = {
  "pt-BR": {
    widgetOpenLabel: "Abrir previsão do tempo",
    clickHere: "Clique aqui",
    updateError: "Não foi possível atualizar o clima.",
    forecastTitle: "Previsão do tempo",
    forecastCloseLabel: "Fechar previsão",
    forecastDaysLabel: "Dias da previsão",
    chartLabel: "Temperaturas máximas previstas",
    unavailableDate: "Data indisponível",
    high: "Máxima",
    low: "Mínima",
    rain: "Chuva",
    humidity: "Umidade",
    wind: "Vento",
    windUnit: "km/h",
    conditions: {
      clear: "Céu limpo",
      partlyCloudy: "Parcialmente nublado",
      cloudy: "Nublado",
      fog: "Névoa ou neblina",
      lightRain: "Chuva leve",
      rain: "Chuva",
      snow: "Neve",
      thunderstorm: "Tempestades com trovoadas",
      unknown: "Sem informações",
    },
  },
  en: {
    widgetOpenLabel: "Open weather forecast",
    clickHere: "Click here",
    updateError: "Could not update the weather.",
    forecastTitle: "Weather forecast",
    forecastCloseLabel: "Close forecast",
    forecastDaysLabel: "Forecast days",
    chartLabel: "Forecast high temperatures",
    unavailableDate: "Date unavailable",
    high: "High",
    low: "Low",
    rain: "Rain",
    humidity: "Humidity",
    wind: "Wind",
    windUnit: "km/h",
    conditions: {
      clear: "Clear sky",
      partlyCloudy: "Partly cloudy",
      cloudy: "Cloudy",
      fog: "Fog or mist",
      lightRain: "Light rain",
      rain: "Rain",
      snow: "Snow",
      thunderstorm: "Thunderstorms",
      unknown: "No information",
    },
  },
  es: {
    widgetOpenLabel: "Abrir previsión del tiempo",
    clickHere: "Haga clic aquí",
    updateError: "No se pudo actualizar el clima.",
    forecastTitle: "Previsión del tiempo",
    forecastCloseLabel: "Cerrar previsión",
    forecastDaysLabel: "Días de la previsión",
    chartLabel: "Temperaturas máximas previstas",
    unavailableDate: "Fecha no disponible",
    high: "Máxima",
    low: "Mínima",
    rain: "Lluvia",
    humidity: "Humedad",
    wind: "Viento",
    windUnit: "km/h",
    conditions: {
      clear: "Cielo despejado",
      partlyCloudy: "Parcialmente nublado",
      cloudy: "Nublado",
      fog: "Niebla o neblina",
      lightRain: "Lluvia ligera",
      rain: "Lluvia",
      snow: "Nieve",
      thunderstorm: "Tormentas con truenos",
      unknown: "Sin información",
    },
  },
  he: {
    widgetOpenLabel: "פתח תחזית מזג האוויר",
    clickHere: "לחץ כאן",
    updateError: "לא ניתן היה לעדכן את מזג האוויר.",
    forecastTitle: "תחזית מזג האוויר",
    forecastCloseLabel: "סגור תחזית",
    forecastDaysLabel: "ימי התחזית",
    chartLabel: "טמפרטורות מקסימום חזויות",
    unavailableDate: "התאריך אינו זמין",
    high: "מקסימום",
    low: "מינימום",
    rain: "גשם",
    humidity: "לחות",
    wind: "רוח",
    windUnit: 'קמ"ש',
    conditions: {
      clear: "שמיים בהירים",
      partlyCloudy: "מעונן חלקית",
      cloudy: "מעונן",
      fog: "ערפל",
      lightRain: "גשם קל",
      rain: "גשם",
      snow: "שלג",
      thunderstorm: "סופות רעמים",
      unknown: "אין מידע",
    },
  },
};

const INTL_LOCALE: Readonly<Record<WeatherLocale, string>> = {
  "pt-BR": "pt-BR",
  en: "en-US",
  es: "es-ES",
  he: "he-IL",
};

export function weatherPresentationLocale(
  locale?: string | null,
): WeatherLocale {
  return normalizeTourLocale(locale);
}

export function weatherIntlLocale(locale?: string | null): string {
  return INTL_LOCALE[weatherPresentationLocale(locale)];
}

export function getWeatherPresentationCopy(
  locale?: string | null,
): WeatherPresentationCopy {
  return COPY[weatherPresentationLocale(locale)];
}

export function weatherConditionLabel(
  weatherCode: number,
  locale?: string | null,
): string {
  const conditions = getWeatherPresentationCopy(locale).conditions;
  if (weatherCode === 0) return conditions.clear;
  if ([1, 2].includes(weatherCode)) return conditions.partlyCloudy;
  if (weatherCode === 3) return conditions.cloudy;
  if ([45, 48].includes(weatherCode)) return conditions.fog;
  if ([51, 53, 55, 56, 57].includes(weatherCode)) return conditions.lightRain;
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(weatherCode)) {
    return conditions.rain;
  }
  if ([71, 73, 75, 77, 85, 86].includes(weatherCode)) return conditions.snow;
  if ([95, 96, 99].includes(weatherCode)) return conditions.thunderstorm;
  return conditions.unknown;
}
