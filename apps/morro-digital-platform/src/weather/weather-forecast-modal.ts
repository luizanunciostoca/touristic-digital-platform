import type { WeatherForecastDay, WeatherReading } from "./weather-widget.js";
import {
  getWeatherPresentationCopy,
  weatherConditionLabel,
  weatherIntlLocale,
  weatherPresentationLocale,
  type WeatherLocale,
} from "./weather-i18n.js";

export interface WeatherForecastModalOptions {
  readonly document: Document;
  readonly reading: WeatherReading;
  readonly locale?: string | null;
  readonly onClose?: () => void;
}

export interface WeatherForecastModalController {
  close(): void;
  updateLocale(locale?: string | null): void;
  readonly element: HTMLElement;
}

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u;

function weatherEmoji(weatherCode: number, isDay = true): string {
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

function parseDateOnly(date: string): Date | undefined {
  const match = ISO_DATE_PATTERN.exec(date);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return undefined;
  }
  return parsed;
}

function dateLabel(
  date: string,
  format: "short" | "long",
  locale: WeatherLocale,
): string {
  const parsed = parseDateOnly(date);
  const copy = getWeatherPresentationCopy(locale);
  if (!parsed) return copy.unavailableDate;
  return new Intl.DateTimeFormat(weatherIntlLocale(locale), {
    ...(format === "short"
      ? { weekday: "short", day: "2-digit" }
      : { weekday: "long", day: "2-digit", month: "long" }),
    timeZone: "UTC",
  }).format(parsed);
}

function todayFallback(reading: WeatherReading): WeatherForecastDay {
  return Object.freeze({
    date: new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Bahia",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date()),
    temperatureMaxCelsius: reading.temperatureMaxCelsius,
    temperatureMinCelsius: reading.temperatureMinCelsius,
    humidityPercent: reading.humidityPercent,
    windSpeedKph: reading.windSpeedKph,
    rainChancePercent: reading.rainChancePercent,
    weatherCode: reading.weatherCode,
  });
}

function normalizedForecast(
  reading: WeatherReading,
): readonly WeatherForecastDay[] {
  return reading.forecast && reading.forecast.length > 0
    ? reading.forecast
    : [todayFallback(reading)];
}

function chartSvg(
  days: readonly WeatherForecastDay[],
  ariaLabel: string,
): string {
  const values = days.map((day) => day.temperatureMaxCelsius);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const width = 640;
  const height = 150;
  const horizontalPadding = 28;
  const verticalPadding = 28;
  const usableWidth = width - horizontalPadding * 2;
  const usableHeight = height - verticalPadding * 2;
  const denominator = Math.max(1, days.length - 1);
  const points = values
    .map((value, index) => {
      const x = horizontalPadding + (usableWidth * index) / denominator;
      const y = verticalPadding + ((max - value) / range) * usableHeight;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const labels = values
    .map((value, index) => {
      const x = horizontalPadding + (usableWidth * index) / denominator;
      const y = verticalPadding + ((max - value) / range) * usableHeight - 8;
      return `<text x="${x.toFixed(1)}" y="${Math.max(14, y).toFixed(1)}" text-anchor="middle" font-size="12" fill="currentColor">${Math.round(value)}°</text>`;
    })
    .join("");
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${ariaLabel}" style="width:100%;height:100%;overflow:visible"><polyline points="${points}" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></polyline>${labels}</svg>`;
}

function detailsMarkup(day: WeatherForecastDay, locale: WeatherLocale): string {
  const copy = getWeatherPresentationCopy(locale);
  return `
    <div class="current-condition">${weatherConditionLabel(day.weatherCode, locale)}</div>
    <div class="forecast-details-grid">
      <div class="forecast-detail-item"><span class="label">${copy.high}</span><span class="value">${day.temperatureMaxCelsius}°C</span></div>
      <div class="forecast-detail-item"><span class="label">${copy.low}</span><span class="value">${day.temperatureMinCelsius}°C</span></div>
      <div class="forecast-detail-item"><span class="label">${copy.rain}</span><span class="value">${day.rainChancePercent}%</span></div>
      <div class="forecast-detail-item"><span class="label">${copy.humidity}</span><span class="value">${day.humidityPercent}%</span></div>
      <div class="forecast-detail-item"><span class="label">${copy.wind}</span><span class="value">${day.windSpeedKph} ${copy.windUnit}</span></div>
    </div>
  `;
}

export function openWeatherForecastModal({
  document,
  reading,
  locale,
  onClose,
}: WeatherForecastModalOptions): WeatherForecastModalController {
  document.querySelector(".weather-forecast-modal")?.remove();
  const days = normalizedForecast(reading);
  const previouslyFocused =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  let selectedIndex = 0;
  let closed = false;
  let currentLocale = weatherPresentationLocale(
    locale ?? document.documentElement.lang,
  );

  const modal = document.createElement("section");
  modal.className = "weather-forecast-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "weather-forecast-title");
  modal.tabIndex = -1;
  modal.innerHTML = `
    <div class="forecast-header">
      <h4 id="weather-forecast-title"></h4>
      <button type="button" class="forecast-close-btn">×</button>
    </div>
    <div class="weather-forecast-modal-content">
      <div class="current-weather">
        <div class="current-weather-main">
          <span class="current-emoji" aria-hidden="true">${weatherEmoji(reading.weatherCode, reading.isDay)}</span>
          <span class="current-temp">${reading.temperatureCelsius}°C</span>
        </div>
        <div class="current-weather-details"></div>
        <p class="day-full-date"></p>
      </div>
      <div class="day-selector">
        ${days
          .map(
            (
              day,
              index,
            ) => `<button type="button" class="day-option${index === 0 ? " active" : ""}" aria-pressed="${index === 0}" data-day-index="${index}">
              <span class="day-name"></span>
              <span class="day-emoji" aria-hidden="true">${weatherEmoji(day.weatherCode)}</span>
              <span class="day-temp">${day.temperatureMaxCelsius}° / ${day.temperatureMinCelsius}°</span>
            </button>`,
          )
          .join("")}
      </div>
      <div class="weather-selected-day" aria-live="polite"></div>
      <div class="temp-chart-container"></div>
    </div>
  `;

  const content = modal.querySelector<HTMLElement>(
    ".weather-forecast-modal-content",
  );
  const title = modal.querySelector<HTMLElement>("#weather-forecast-title");
  const currentDetails = modal.querySelector<HTMLElement>(
    ".current-weather-details",
  );
  const currentDate = modal.querySelector<HTMLElement>(
    ".current-weather > .day-full-date",
  );
  const daySelector = modal.querySelector<HTMLElement>(".day-selector");
  const selectedDay = modal.querySelector<HTMLElement>(".weather-selected-day");
  const chart = modal.querySelector<HTMLElement>(".temp-chart-container");
  const closeButton = modal.querySelector<HTMLButtonElement>(
    ".forecast-close-btn",
  );

  const renderSelectedDay = (): void => {
    const day = days[selectedIndex] ?? days[0];
    if (!day || !selectedDay) return;
    selectedDay.innerHTML = `<p class="day-full-date">${dateLabel(day.date, "long", currentLocale)}</p>${detailsMarkup(day, currentLocale)}`;
    modal
      .querySelectorAll<HTMLButtonElement>(".day-option")
      .forEach((button, index) => {
        const active = index === selectedIndex;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
      });
  };

  const renderLocale = (): void => {
    const copy = getWeatherPresentationCopy(currentLocale);
    if (title) title.textContent = copy.forecastTitle;
    closeButton?.setAttribute("aria-label", copy.forecastCloseLabel);
    daySelector?.setAttribute("aria-label", copy.forecastDaysLabel);
    if (currentDetails) {
      currentDetails.innerHTML = `
        <span>${copy.humidity}: ${reading.humidityPercent}%</span>
        <span>${copy.wind}: ${reading.windSpeedKph} ${copy.windUnit}</span>
        <span>${copy.rain}: ${reading.rainChancePercent}%</span>
      `;
    }
    if (currentDate) {
      currentDate.textContent = dateLabel(
        days[0]?.date ?? "",
        "long",
        currentLocale,
      );
    }
    modal
      .querySelectorAll<HTMLButtonElement>(".day-option")
      .forEach((button) => {
        const index = Number(button.dataset.dayIndex ?? 0);
        const day = days[index];
        const dayName = button.querySelector<HTMLElement>(".day-name");
        if (day && dayName) {
          dayName.textContent = dateLabel(day.date, "short", currentLocale);
        }
      });
    if (chart) chart.innerHTML = chartSvg(days, copy.chartLabel);
    renderSelectedDay();
  };

  const updateLocale = (nextLocale?: string | null): void => {
    if (closed) return;
    currentLocale = weatherPresentationLocale(
      nextLocale ?? document.documentElement.lang,
    );
    renderLocale();
  };

  const close = (): void => {
    if (closed) return;
    closed = true;
    document.removeEventListener("keydown", onKeyDown, true);
    modal.remove();
    onClose?.();
    previouslyFocused?.focus();
  };

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      modal.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) {
      event.preventDefault();
      modal.focus();
      return;
    }
    const focused = document.activeElement;
    if (event.shiftKey && (focused === first || !modal.contains(focused))) {
      event.preventDefault();
      last.focus();
    } else if (
      !event.shiftKey &&
      (focused === last || !modal.contains(focused))
    ) {
      event.preventDefault();
      first.focus();
    }
  }

  closeButton?.addEventListener("click", close, { once: true });
  modal.querySelectorAll<HTMLButtonElement>(".day-option").forEach((button) => {
    button.addEventListener("click", () => {
      selectedIndex = Number(button.dataset.dayIndex ?? 0);
      renderSelectedDay();
    });
  });
  content?.addEventListener("scroll", () => {
    modal.dataset.scrolled = String((content.scrollTop ?? 0) > 4);
  });

  renderLocale();
  document.body.appendChild(modal);
  document.addEventListener("keydown", onKeyDown, true);
  closeButton?.focus();

  return Object.freeze({ element: modal, close, updateLocale });
}
