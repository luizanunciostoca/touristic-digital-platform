import { openWeatherForecastModal } from "./weather-forecast-modal.js";

export interface WeatherForecastDay {
  readonly date: string;
  readonly temperatureMaxCelsius: number;
  readonly temperatureMinCelsius: number;
  readonly humidityPercent: number;
  readonly windSpeedKph: number;
  readonly rainChancePercent: number;
  readonly weatherCode: number;
}

export interface WeatherReading {
  readonly temperatureCelsius: number;
  readonly temperatureMaxCelsius: number;
  readonly temperatureMinCelsius: number;
  readonly humidityPercent: number;
  readonly windSpeedKph: number;
  readonly rainChancePercent: number;
  readonly weatherCode: number;
  readonly isDay: boolean;
  readonly forecast?: readonly WeatherForecastDay[];
}

export interface WeatherWidgetOptions {
  readonly document: Document;
  readonly fetch?: typeof globalThis.fetch;
  readonly refreshIntervalMs?: number;
}

const DEFAULT_REFRESH_INTERVAL_MS = 10 * 60 * 1000;
const WEATHER_ENDPOINT = "/api/weather";

function weatherEmoji(weatherCode: number, isDay: boolean): string {
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

function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function parseForecast(payload: unknown): readonly WeatherForecastDay[] {
  if (!Array.isArray(payload)) return Object.freeze([]);

  const forecast = payload.flatMap<WeatherForecastDay>((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const date = Reflect.get(candidate, "date");
    const temperatureMax = readFiniteNumber(
      Reflect.get(candidate, "temperatureMaxCelsius"),
    );
    const temperatureMin = readFiniteNumber(
      Reflect.get(candidate, "temperatureMinCelsius"),
    );
    const humidity = readFiniteNumber(
      Reflect.get(candidate, "humidityPercent"),
    );
    const windSpeed = readFiniteNumber(Reflect.get(candidate, "windSpeedKph"));
    const rainChance = readFiniteNumber(
      Reflect.get(candidate, "rainChancePercent"),
    );
    const weatherCode = readFiniteNumber(Reflect.get(candidate, "weatherCode"));
    if (
      typeof date !== "string" ||
      !date.trim() ||
      temperatureMax === undefined ||
      temperatureMin === undefined ||
      humidity === undefined ||
      windSpeed === undefined ||
      rainChance === undefined ||
      weatherCode === undefined
    ) {
      return [];
    }
    return [
      Object.freeze({
        date,
        temperatureMaxCelsius: Math.round(temperatureMax),
        temperatureMinCelsius: Math.round(temperatureMin),
        humidityPercent: Math.round(humidity),
        windSpeedKph: Math.round(windSpeed),
        rainChancePercent: Math.round(rainChance),
        weatherCode,
      }),
    ];
  });

  return Object.freeze(forecast.slice(0, 7));
}

function parseWeatherPayload(payload: unknown): WeatherReading {
  if (!payload || typeof payload !== "object") {
    throw new Error("Weather runtime returned an invalid payload.");
  }

  const temperature: unknown = Reflect.get(payload, "temperatureCelsius");
  const temperatureMax: unknown = Reflect.get(payload, "temperatureMaxCelsius");
  const temperatureMin: unknown = Reflect.get(payload, "temperatureMinCelsius");
  const humidity: unknown = Reflect.get(payload, "humidityPercent");
  const windSpeed: unknown = Reflect.get(payload, "windSpeedKph");
  const rainChance: unknown = Reflect.get(payload, "rainChancePercent");
  const weatherCode: unknown = Reflect.get(payload, "weatherCode");
  const isDay: unknown = Reflect.get(payload, "isDay");

  if (
    typeof temperature !== "number" ||
    !Number.isFinite(temperature) ||
    typeof temperatureMax !== "number" ||
    !Number.isFinite(temperatureMax) ||
    typeof temperatureMin !== "number" ||
    !Number.isFinite(temperatureMin) ||
    typeof humidity !== "number" ||
    !Number.isFinite(humidity) ||
    typeof windSpeed !== "number" ||
    !Number.isFinite(windSpeed) ||
    typeof rainChance !== "number" ||
    !Number.isFinite(rainChance) ||
    typeof weatherCode !== "number" ||
    !Number.isFinite(weatherCode) ||
    typeof isDay !== "boolean"
  ) {
    throw new Error("Weather runtime returned incomplete current conditions.");
  }

  return Object.freeze({
    temperatureCelsius: Math.round(temperature),
    temperatureMaxCelsius: Math.round(temperatureMax),
    temperatureMinCelsius: Math.round(temperatureMin),
    humidityPercent: Math.round(humidity),
    windSpeedKph: Math.round(windSpeed),
    rainChancePercent: Math.round(rainChance),
    weatherCode,
    isDay,
    forecast: parseForecast(Reflect.get(payload, "forecast")),
  });
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

function renderReading(widget: HTMLElement, reading: WeatherReading): void {
  widget.innerHTML = `
    <div class="weather-compact-main">
      <div class="weather-emoji">${weatherEmoji(reading.weatherCode, reading.isDay)}</div>
      <span class="weather-temp">${reading.temperatureCelsius}°C</span>
      <div class="weather-compact-footer">
        <span class="click-here-text">Clique aqui</span>
      </div>
    </div>
  `;
  widget.dataset.weatherState = "ready";
  widget.removeAttribute("aria-busy");
}

function renderError(widget: HTMLElement): void {
  widget.innerHTML =
    '<div class="weather-error">Não foi possível atualizar o clima.</div>';
  widget.dataset.weatherState = "error";
  widget.removeAttribute("aria-busy");
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
  let latestReading: WeatherReading | undefined;
  let activeModal: ReturnType<typeof openWeatherForecastModal> | undefined;

  widget.setAttribute("role", "button");
  widget.tabIndex = 0;
  widget.setAttribute("aria-label", "Abrir previsão do tempo");
  widget.setAttribute("aria-expanded", "false");

  const openForecast = (): void => {
    if (!latestReading || disposed) return;
    activeModal?.close();
    activeModal = openWeatherForecastModal({
      document,
      reading: latestReading,
      onClose: () => {
        widget.setAttribute("aria-expanded", "false");
        activeModal = undefined;
      },
    });
    widget.setAttribute("aria-expanded", "true");
  };

  const onWidgetClick = (): void => openForecast();
  const onWidgetKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    openForecast();
  };
  widget.addEventListener("click", onWidgetClick);
  widget.addEventListener("keydown", onWidgetKeyDown);

  const refresh = async (): Promise<void> => {
    if (disposed || requestInFlight) return;
    requestInFlight = true;
    widget.dataset.weatherState = "loading";
    widget.setAttribute("aria-busy", "true");

    try {
      const reading = await fetchMorroWeather(fetchImplementation);
      if (!disposed) {
        latestReading = reading;
        renderReading(widget, reading);
      }
    } catch {
      if (!disposed) renderError(widget);
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
    activeModal?.close();
    activeModal = undefined;
    widget.removeEventListener("click", onWidgetClick);
    widget.removeEventListener("keydown", onWidgetKeyDown);
    globalThis.clearInterval(intervalId);
  };
}
