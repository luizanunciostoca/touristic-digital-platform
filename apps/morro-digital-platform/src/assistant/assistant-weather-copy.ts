import type { WeatherReading } from "../weather/weather-widget.js";

export type AssistantWeatherLanguage = "pt" | "en" | "es" | "he";

export interface AssistantWeatherCopy {
  readonly text: string;
  readonly options: ReadonlyArray<{ readonly label: string; readonly value: string }>;
}

const OPTIONS: Record<AssistantWeatherLanguage, AssistantWeatherCopy["options"]> = {
  pt: [
    { label: "Temperatura agora", value: "temperatura agora" },
    { label: "Vai chover?", value: "vai chover" },
    { label: "Previsão do tempo", value: "previsao do tempo" },
    { label: "Como está a maré?", value: "mare" },
    { label: "Voltar ao menu principal", value: "voltar ao menu" },
  ],
  en: [
    { label: "Temperature now", value: "temperature now" },
    { label: "Will it rain?", value: "will it rain" },
    { label: "Weather forecast", value: "weather forecast" },
    { label: "How is the tide?", value: "tide" },
    { label: "Back to main menu", value: "back to main menu" },
  ],
  es: [
    { label: "Temperatura ahora", value: "temperatura ahora" },
    { label: "¿Va a llover?", value: "va a llover" },
    { label: "Pronóstico del tiempo", value: "pronostico del tiempo" },
    { label: "¿Cómo está la marea?", value: "marea" },
    { label: "Volver al menú principal", value: "volver al menu" },
  ],
  he: [
    { label: "הטמפרטורה עכשיו", value: "הטמפרטורה עכשיו" },
    { label: "האם ירד גשם?", value: "האם ירד גשם" },
    { label: "תחזית מזג האוויר", value: "תחזית מזג האוויר" },
    { label: "מה מצב הגאות?", value: "גאות" },
    { label: "חזרה לתפריט הראשי", value: "חזרה לתפריט הראשי" },
  ],
};

const CONDITIONS: Record<AssistantWeatherLanguage, Record<string, string>> = {
  pt: {
    thunder: "trovoadas",
    frozen: "precipitação congelada",
    rain: "chuva",
    fog: "névoa",
    cloudy: "nublado",
    partly: "parcialmente nublado",
    clearDay: "céu limpo",
    clearNight: "céu limpo à noite",
  },
  en: {
    thunder: "thunderstorms",
    frozen: "frozen precipitation",
    rain: "rain",
    fog: "fog",
    cloudy: "cloudy",
    partly: "partly cloudy",
    clearDay: "clear skies",
    clearNight: "clear skies tonight",
  },
  es: {
    thunder: "tormentas eléctricas",
    frozen: "precipitación congelada",
    rain: "lluvia",
    fog: "niebla",
    cloudy: "nublado",
    partly: "parcialmente nublado",
    clearDay: "cielo despejado",
    clearNight: "cielo despejado por la noche",
  },
  he: {
    thunder: "סופות רעמים",
    frozen: "משקעים קפואים",
    rain: "גשם",
    fog: "ערפל",
    cloudy: "מעונן",
    partly: "מעונן חלקית",
    clearDay: "שמיים בהירים",
    clearNight: "שמיים בהירים בלילה",
  },
};

function conditionKey(reading: WeatherReading): string {
  const code = reading.weatherCode;
  if ([95, 96, 99].includes(code)) return "thunder";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "frozen";
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "rain";
  if ([45, 48].includes(code)) return "fog";
  if (code === 3) return "cloudy";
  if ([1, 2].includes(code)) return "partly";
  return reading.isDay ? "clearDay" : "clearNight";
}

function condition(reading: WeatherReading, language: AssistantWeatherLanguage): string {
  return CONDITIONS[language][conditionKey(reading)] ?? CONDITIONS[language].clearDay;
}

export function formatAssistantWeather(
  reading: WeatherReading,
  language: AssistantWeatherLanguage,
): AssistantWeatherCopy {
  const state = condition(reading, language);
  const values = {
    now: reading.temperatureCelsius,
    max: reading.temperatureMaxCelsius,
    min: reading.temperatureMinCelsius,
    humidity: reading.humidityPercent,
    wind: reading.windSpeedKph,
    rain: reading.rainChancePercent,
  };

  const text: Record<AssistantWeatherLanguage, string> = {
    pt: `Agora em Morro de São Paulo: ${values.now}°C, ${state}. Hoje: máxima de ${values.max}°C, mínima de ${values.min}°C, umidade ${values.humidity}%, vento ${values.wind} km/h e chance de chuva de ${values.rain}%.`,
    en: `Right now in Morro de São Paulo: ${values.now}°C, ${state}. Today: high ${values.max}°C, low ${values.min}°C, humidity ${values.humidity}%, wind ${values.wind} km/h, and ${values.rain}% chance of rain.`,
    es: `Ahora en Morro de São Paulo: ${values.now}°C, ${state}. Hoy: máxima de ${values.max}°C, mínima de ${values.min}°C, humedad ${values.humidity}%, viento ${values.wind} km/h y ${values.rain}% de probabilidad de lluvia.`,
    he: `עכשיו במורו דה סאו פאולו: ${values.now}°C, ${state}. היום: מקסימום ${values.max}°C, מינימום ${values.min}°C, לחות ${values.humidity}%, רוח ${values.wind} קמ״ש וסיכוי של ${values.rain}% לגשם.`,
  };

  return { text: text[language], options: OPTIONS[language] };
}

export function assistantWeatherFallback(language: AssistantWeatherLanguage): AssistantWeatherCopy {
  const text: Record<AssistantWeatherLanguage, string> = {
    pt: "Em Morro de São Paulo, a temperatura costuma ficar entre 25°C e 32°C. O período mais chuvoso vai de novembro a março e a época mais seca costuma ser de junho a setembro.",
    en: "In Morro de São Paulo, temperatures usually range from 25°C to 32°C. The rainiest period is usually from November to March, and the drier season from June to September.",
    es: "En Morro de São Paulo, la temperatura suele estar entre 25°C y 32°C. El período más lluvioso suele ir de noviembre a marzo y la época más seca de junio a septiembre.",
    he: "במורו דה סאו פאולו הטמפרטורה בדרך כלל נעה בין 25°C ל־32°C. התקופה הגשומה יותר היא בדרך כלל מנובמבר עד מרץ, והתקופה היבשה יותר מיוני עד ספטמבר.",
  };
  return { text: text[language], options: OPTIONS[language] };
}
