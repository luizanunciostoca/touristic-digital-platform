export interface WeatherHourlyReading {
  readonly hour: number;
  readonly temperatureCelsius: number;
  readonly feelsLikeCelsius: number;
  readonly humidityPercent: number;
  readonly precipitationProbability: number;
  readonly weatherCode: number;
}

export interface WeatherForecastDay {
  readonly date: string;
  readonly highCelsius: number;
  readonly lowCelsius: number;
  readonly weatherCode: number;
  readonly humidityPercent: number;
  readonly windKph: number;
  readonly precipitationProbability: number;
  readonly description: string;
  readonly hourly: readonly WeatherHourlyReading[];
}

export interface WeatherReading {
  readonly temperatureCelsius: number;
  readonly weatherCode: number;
  readonly isDay: boolean;
  readonly humidityPercent: number;
  readonly windKph: number;
  readonly precipitationProbability: number;
  readonly forecast: readonly WeatherForecastDay[];
}

export interface WeatherWidgetOptions {
  readonly document: Document;
  readonly fetch?: typeof globalThis.fetch;
  readonly refreshIntervalMs?: number;
}

type WeatherLanguage = "pt" | "en" | "es" | "he";

const DEFAULT_REFRESH_INTERVAL_MS = 10 * 60 * 1000;
const WEATHER_ENDPOINT = "/api/weather";

const WEATHER_COPY = {
  pt: {
    click: "Clique aqui",
    updateError: "Não foi possível atualizar o clima.",
    high: "Máxima",
    low: "Mínima",
    rain: "Chuva",
    humidity: "Umidade",
    wind: "Vento",
    today: "Hoje",
    close: "Fechar previsão do tempo",
    title: "Morro de São Paulo",
    tipHot:
      "💡 Dia quente! Use protetor solar, mantenha-se hidratado e procure sombra.",
    tipRain: "💡 Há chance de chuva; considere levar um guarda-chuva.",
    tipStorm: "💡 Em tempestades, evite áreas abertas, árvores e postes.",
    tipSunny: "💡 Dia perfeito para aproveitar as praias. Não esqueça o protetor solar.",
    tipDefault: "💡 Aproveite seu dia em Morro de São Paulo!",
  },
  en: {
    click: "Click here",
    updateError: "Could not update the weather.",
    high: "High",
    low: "Low",
    rain: "Rain",
    humidity: "Humidity",
    wind: "Wind",
    today: "Today",
    close: "Close weather forecast",
    title: "Morro de São Paulo",
    tipHot: "💡 Hot day! Use sunscreen, stay hydrated, and seek shade.",
    tipRain: "💡 There is a chance of rain; consider bringing an umbrella.",
    tipStorm: "💡 During storms, avoid open areas, trees, and poles.",
    tipSunny: "💡 Perfect beach weather. Don't forget sunscreen.",
    tipDefault: "💡 Enjoy your day in Morro de São Paulo!",
  },
  es: {
    click: "Haga clic aquí",
    updateError: "No se pudo actualizar el clima.",
    high: "Máxima",
    low: "Mínima",
    rain: "Lluvia",
    humidity: "Humedad",
    wind: "Viento",
    today: "Hoy",
    close: "Cerrar previsión del tiempo",
    title: "Morro de São Paulo",
    tipHot: "💡 ¡Día caluroso! Usa protector solar, hidrátate y busca sombra.",
    tipRain: "💡 Hay posibilidad de lluvia; considera llevar un paraguas.",
    tipStorm: "💡 Durante tormentas, evita áreas abiertas, árboles y postes.",
    tipSunny: "💡 Clima perfecto para la playa. No olvides el protector solar.",
    tipDefault: "💡 ¡Disfruta tu día en Morro de São Paulo!",
  },
  he: {
    click: "לחץ כאן",
    updateError: "לא ניתן היה לעדכן את מזג האוויר.",
    high: "מקסימום",
    low: "מינימום",
    rain: "גשם",
    humidity: "לחות",
    wind: "רוח",
    today: "היום",
    close: "סגור תחזית מזג אוויר",
    title: "מורו דה סאו פאולו",
    tipHot: "💡 יום חם! השתמש בקרם הגנה, שתה מים וחפש צל.",
    tipRain: "💡 יש סיכוי לגשם; כדאי לקחת מטריה.",
    tipStorm: "💡 בזמן סופה הימנע מאזורים פתוחים, עצים ועמודים.",
    tipSunny: "💡 מזג אוויר מושלם לחוף. אל תשכח קרם הגנה.",
    tipDefault: "💡 תהנה מהיום שלך במורו דה סאו פאולו!",
  },
} as const;

function resolveWeatherLanguage(document: Document): WeatherLanguage {
  const language = document.documentElement.lang.toLowerCase();
  if (language.startsWith("en")) return "en";
  if (language.startsWith("es")) return "es";
  if (language.startsWith("he")) return "he";
  return "pt";
}

export function weatherEmoji(weatherCode: number, isDay = true): string {
  if (weatherCode === 0) return isDay ? "☀️" : "🌙";
  if ([1, 2].includes(weatherCode)) return isDay ? "🌤️" : "☁️";
  if (weatherCode === 3) return "☁️";
  if ([45, 48].includes(weatherCode)) return "🌫️";
  if ([51, 53, 55, 56, 57].includes(weatherCode)) return "🌦️";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(weatherCode)) return "🌧️";
  if ([71, 73, 75, 77, 85, 86].includes(weatherCode)) return "🌨️";
  if ([95, 96, 99].includes(weatherCode)) return "⛈️";
  return isDay ? "☀️" : "🌙";
}

export function weatherCondition(
  weatherCode: number,
  language: WeatherLanguage,
  isDay = true,
): string {
  const conditions = {
    pt: {
      storm: "Tempestades com trovoadas",
      snow: "Neve",
      rain: "Chuva",
      fog: "Névoa ou neblina",
      cloudy: "Nublado",
      partly: "Parcialmente nublado",
      clear: isDay ? "Céu limpo" : "Céu limpo à noite",
    },
    en: {
      storm: "Thunderstorms",
      snow: "Snow",
      rain: "Rain",
      fog: "Fog or mist",
      cloudy: "Cloudy",
      partly: "Partly cloudy",
      clear: isDay ? "Clear sky" : "Clear night",
    },
    es: {
      storm: "Tormentas con truenos",
      snow: "Nieve",
      rain: "Lluvia",
      fog: "Niebla o neblina",
      cloudy: "Nublado",
      partly: "Parcialmente nublado",
      clear: isDay ? "Cielo despejado" : "Cielo despejado por la noche",
    },
    he: {
      storm: "סופות רעמים",
      snow: "שלג",
      rain: "גשם",
      fog: "ערפל",
      cloudy: "מעונן",
      partly: "מעונן חלקית",
      clear: isDay ? "שמיים בהירים" : "שמיים בהירים בלילה",
    },
  } as const;
  const copy = conditions[language];
  if ([95, 96, 99].includes(weatherCode)) return copy.storm;
  if ([71, 73, 75, 77, 85, 86].includes(weatherCode)) return copy.snow;
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(weatherCode)) {
    return copy.rain;
  }
  if ([45, 48].includes(weatherCode)) return copy.fog;
  if (weatherCode === 3) return copy.cloudy;
  if ([1, 2].includes(weatherCode)) return copy.partly;
  return copy.clear;
}

function finiteNumber(payload: object, key: PropertyKey): number | null {
  const value: unknown = Reflect.get(payload, key);
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseHourly(payload: unknown): WeatherHourlyReading[] {
  if (!Array.isArray(payload)) return [];
  return payload.flatMap((item): WeatherHourlyReading[] => {
    if (!item || typeof item !== "object") return [];
    const hour = finiteNumber(item, "hour");
    const temperature = finiteNumber(item, "temperatureCelsius");
    const feelsLike = finiteNumber(item, "feelsLikeCelsius");
    const humidity = finiteNumber(item, "humidityPercent");
    const precipitation = finiteNumber(item, "precipitationProbability");
    const weatherCode = finiteNumber(item, "weatherCode");
    if (
      hour === null ||
      temperature === null ||
      feelsLike === null ||
      humidity === null ||
      precipitation === null ||
      weatherCode === null
    ) {
      return [];
    }
    return [
      {
        hour: Math.round(hour),
        temperatureCelsius: Math.round(temperature),
        feelsLikeCelsius: Math.round(feelsLike),
        humidityPercent: Math.round(humidity),
        precipitationProbability: Math.round(precipitation),
        weatherCode,
      },
    ];
  });
}

function parseForecast(payload: unknown): WeatherForecastDay[] {
  if (!Array.isArray(payload)) return [];
  return payload.flatMap((item): WeatherForecastDay[] => {
    if (!item || typeof item !== "object") return [];
    const date: unknown = Reflect.get(item, "date");
    const high = finiteNumber(item, "highCelsius");
    const low = finiteNumber(item, "lowCelsius");
    const weatherCode = finiteNumber(item, "weatherCode");
    const humidity = finiteNumber(item, "humidityPercent");
    const wind = finiteNumber(item, "windKph");
    const precipitation = finiteNumber(item, "precipitationProbability");
    const description: unknown = Reflect.get(item, "description");
    if (
      typeof date !== "string" ||
      high === null ||
      low === null ||
      weatherCode === null ||
      humidity === null ||
      wind === null ||
      precipitation === null
    ) {
      return [];
    }
    return [
      {
        date,
        highCelsius: Math.round(high),
        lowCelsius: Math.round(low),
        weatherCode,
        humidityPercent: Math.round(humidity),
        windKph: Math.round(wind),
        precipitationProbability: Math.round(precipitation),
        description: typeof description === "string" ? description : "",
        hourly: parseHourly(Reflect.get(item, "hourly")),
      },
    ];
  });
}

export function parseWeatherPayload(payload: unknown): WeatherReading {
  if (!payload || typeof payload !== "object") {
    throw new Error("Weather runtime returned an invalid payload.");
  }

  const temperature = finiteNumber(payload, "temperatureCelsius");
  const weatherCode = finiteNumber(payload, "weatherCode");
  const isDay: unknown = Reflect.get(payload, "isDay");
  const humidity = finiteNumber(payload, "humidityPercent");
  const wind = finiteNumber(payload, "windKph");
  const precipitation = finiteNumber(payload, "precipitationProbability");
  const forecast = parseForecast(Reflect.get(payload, "forecast"));

  if (
    temperature === null ||
    weatherCode === null ||
    typeof isDay !== "boolean" ||
    humidity === null ||
    wind === null ||
    precipitation === null ||
    forecast.length === 0
  ) {
    throw new Error("Weather runtime returned incomplete current conditions.");
  }

  return {
    temperatureCelsius: Math.round(temperature),
    weatherCode,
    isDay,
    humidityPercent: Math.round(humidity),
    windKph: Math.round(wind),
    precipitationProbability: Math.round(precipitation),
    forecast,
  };
}

export async function fetchMorroWeather(
  fetchImplementation: typeof globalThis.fetch,
): Promise<WeatherReading> {
  const response = await fetchImplementation(WEATHER_ENDPOINT, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(
      `Weather runtime request failed with HTTP ${response.status}.`,
    );
  }

  return parseWeatherPayload(await response.json());
}

function weatherTip(
  day: WeatherForecastDay,
  copy: (typeof WEATHER_COPY)[WeatherLanguage],
): string {
  if ([95, 96, 99].includes(day.weatherCode)) return copy.tipStorm;
  if (day.precipitationProbability >= 40) return copy.tipRain;
  if (day.highCelsius > 30) return copy.tipHot;
  if (day.weatherCode <= 1) return copy.tipSunny;
  return copy.tipDefault;
}

function dayLocale(language: WeatherLanguage): string {
  if (language === "en") return "en-US";
  if (language === "es") return "es-ES";
  if (language === "he") return "he-IL";
  return "pt-BR";
}

function renderForecastDetails(
  modal: HTMLElement,
  reading: WeatherReading,
  day: WeatherForecastDay,
  language: WeatherLanguage,
): void {
  const copy = WEATHER_COPY[language];
  const selectedDate = new Date(`${day.date}T12:00:00`);
  const today = reading.forecast[0]?.date === day.date;
  const dateLabel = today
    ? copy.today
    : new Intl.DateTimeFormat(dayLocale(language), {
        weekday: "long",
        day: "numeric",
        month: "long",
      }).format(selectedDate);
  const content = modal.querySelector<HTMLElement>(".weather-selected-day");
  if (!content) return;
  content.innerHTML = `
    <div class="current-weather">
      <div class="current-weather-main">
        <div class="current-emoji">${weatherEmoji(day.weatherCode, true)}</div>
        <div class="current-temp">${today ? reading.temperatureCelsius : Math.round((day.highCelsius + day.lowCelsius) / 2)}°</div>
      </div>
      <div class="day-full-date">${dateLabel}</div>
      <div class="current-condition">${weatherCondition(day.weatherCode, language, true)}</div>
      <div class="day-conditions">
        <div class="condition-item"><span class="condition-label">${copy.high}</span><span class="condition-value">${day.highCelsius}°C</span></div>
        <div class="condition-item"><span class="condition-label">${copy.low}</span><span class="condition-value">${day.lowCelsius}°C</span></div>
        <div class="condition-item"><span class="condition-label">${copy.rain}</span><span class="condition-value">${day.precipitationProbability}%</span></div>
        <div class="condition-item"><span class="condition-label">${copy.humidity}</span><span class="condition-value">${day.humidityPercent}%</span></div>
        <div class="condition-item"><span class="condition-label">${copy.wind}</span><span class="condition-value">${day.windKph} km/h</span></div>
      </div>
      <div class="day-tip">${weatherTip(day, copy)}</div>
    </div>
    <div class="temp-chart-container" aria-label="Hourly temperature">
      <div class="weather-hourly-strip">
        ${day.hourly
          .filter((_, index) => index % 3 === 0)
          .map(
            (hour) =>
              `<div class="weather-hourly-item"><span>${String(hour.hour).padStart(2, "0")}:00</span><strong>${hour.temperatureCelsius}°</strong></div>`,
          )
          .join("")}
      </div>
    </div>
  `;
}

function showFullForecast(
  document: Document,
  reading: WeatherReading,
  language: WeatherLanguage,
): void {
  document.getElementById("forecast-modal")?.remove();
  const copy = WEATHER_COPY[language];
  const modal = document.createElement("section");
  modal.id = "forecast-modal";
  modal.className = "weather-forecast-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-label", copy.title);
  if (language === "he") modal.dir = "rtl";
  modal.innerHTML = `
    <div class="forecast-header">
      <h4>${copy.title}</h4>
      <button type="button" class="forecast-close-btn" aria-label="${copy.close}">×</button>
    </div>
    <div class="weather-forecast-modal-content">
      <div class="weather-selected-day"></div>
      <div class="day-selector">
        ${reading.forecast
          .map((day, index) => {
            const date = new Date(`${day.date}T12:00:00`);
            const weekday = new Intl.DateTimeFormat(dayLocale(language), {
              weekday: "short",
            }).format(date);
            return `<button type="button" class="day-option${index === 0 ? " active" : ""}" data-weather-index="${index}"><span class="day-name">${index === 0 ? copy.today : weekday}</span><span class="day-emoji">${weatherEmoji(day.weatherCode, true)}</span><span class="day-temp"><span class="high-temp">${day.highCelsius}°</span><span class="temp-separator">/</span><span class="low-temp">${day.lowCelsius}°</span></span></button>`;
          })
          .join("")}
      </div>
    </div>
  `;

  const close = (): void => modal.remove();
  modal.querySelector(".forecast-close-btn")?.addEventListener("click", close);
  modal.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });
  modal.querySelectorAll<HTMLElement>("[data-weather-index]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.weatherIndex);
      const day = reading.forecast[index];
      if (!day) return;
      modal.querySelectorAll(".day-option").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      renderForecastDetails(modal, reading, day, language);
    });
  });

  document.body.appendChild(modal);
  renderForecastDetails(modal, reading, reading.forecast[0], language);
  modal.querySelector<HTMLButtonElement>(".forecast-close-btn")?.focus();
}

function renderReading(
  document: Document,
  widget: HTMLElement,
  reading: WeatherReading,
): void {
  const language = resolveWeatherLanguage(document);
  const copy = WEATHER_COPY[language];
  widget.innerHTML = `
    <div class="weather-compact-main">
      <div class="weather-emoji">${weatherEmoji(reading.weatherCode, reading.isDay)}</div>
      <span class="weather-temp">${reading.temperatureCelsius}°C</span>
      <div class="weather-compact-footer">
        <span class="click-here-text">${copy.click}</span>
      </div>
    </div>
  `;
  widget.dataset.weatherState = "ready";
  widget.removeAttribute("aria-busy");
  widget.onclick = () => showFullForecast(document, reading, language);
}

function renderError(document: Document, widget: HTMLElement): void {
  const copy = WEATHER_COPY[resolveWeatherLanguage(document)];
  widget.innerHTML = `<div class="weather-error">${copy.updateError}</div>`;
  widget.dataset.weatherState = "error";
  widget.removeAttribute("aria-busy");
  widget.onclick = null;
}

export function initializeWeatherWidget({
  document,
  fetch: fetchImplementation = globalThis.fetch,
  refreshIntervalMs = DEFAULT_REFRESH_INTERVAL_MS,
}: WeatherWidgetOptions): () => void {
  const widget = document.getElementById("weather-widget");
  if (!(widget instanceof HTMLElement)) return () => undefined;

  let disposed = false;
  let requestInFlight = false;

  const refresh = async (): Promise<void> => {
    if (disposed || requestInFlight) return;
    requestInFlight = true;
    widget.dataset.weatherState = "loading";
    widget.setAttribute("aria-busy", "true");

    try {
      const reading = await fetchMorroWeather(fetchImplementation);
      if (!disposed) renderReading(document, widget, reading);
    } catch {
      if (!disposed) renderError(document, widget);
    } finally {
      requestInFlight = false;
    }
  };

  void refresh();
  const intervalId = globalThis.setInterval(
    () => void refresh(),
    refreshIntervalMs,
  );

  return () => {
    disposed = true;
    widget.onclick = null;
    document.getElementById("forecast-modal")?.remove();
    globalThis.clearInterval(intervalId);
  };
}
