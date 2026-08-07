export interface WeatherReading {
  readonly temperatureCelsius: number;
  readonly weatherCode: number;
  readonly isDay: boolean;
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

function parseWeatherPayload(payload: unknown): WeatherReading {
  if (!payload || typeof payload !== "object") {
    throw new Error("Weather runtime returned an invalid payload.");
  }

  const temperature = Reflect.get(payload, "temperatureCelsius");
  const weatherCode = Reflect.get(payload, "weatherCode");
  const isDay = Reflect.get(payload, "isDay");

  if (
    typeof temperature !== "number" ||
    !Number.isFinite(temperature) ||
    typeof weatherCode !== "number" ||
    !Number.isFinite(weatherCode) ||
    typeof isDay !== "boolean"
  ) {
    throw new Error("Weather runtime returned incomplete current conditions.");
  }

  return {
    temperatureCelsius: Math.round(temperature),
    weatherCode,
    isDay,
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

  const refresh = async (): Promise<void> => {
    if (disposed || requestInFlight) return;
    requestInFlight = true;
    widget.dataset.weatherState = "loading";
    widget.setAttribute("aria-busy", "true");

    try {
      const reading = await fetchMorroWeather(fetchImplementation);
      if (!disposed) renderReading(widget, reading);
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
    globalThis.clearInterval(intervalId);
  };
}
