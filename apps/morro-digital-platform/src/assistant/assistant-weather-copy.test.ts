import { describe, expect, it } from "vitest";

import type { WeatherReading } from "../weather/weather-widget.js";
import {
  assistantWeatherFallback,
  formatAssistantWeather,
  type AssistantWeatherLanguage,
} from "./assistant-weather-copy.js";

const reading: WeatherReading = {
  temperatureCelsius: 28,
  temperatureMaxCelsius: 31,
  temperatureMinCelsius: 24,
  humidityPercent: 78,
  windSpeedKph: 18,
  rainChancePercent: 42,
  weatherCode: 2,
  isDay: true,
};

describe("assistant weather copy", () => {
  it.each<AssistantWeatherLanguage>(["pt", "en", "es", "he"])(
    "includes the complete observable weather contract in %s",
    (language) => {
      const response = formatAssistantWeather(reading, language);
      expect(response.text).toContain("28°C");
      expect(response.text).toContain("31°C");
      expect(response.text).toContain("24°C");
      expect(response.text).toContain("78%");
      expect(response.text).toContain("18");
      expect(response.text).toContain("42%");
      expect(response.options).toHaveLength(5);
    },
  );

  it("preserves language-specific observable copy and options", () => {
    expect(formatAssistantWeather(reading, "pt").text).toContain("máxima");
    expect(formatAssistantWeather(reading, "en").text).toContain("humidity");
    expect(formatAssistantWeather(reading, "es").text).toContain(
      "probabilidad",
    );
    expect(formatAssistantWeather(reading, "he").text).toContain("לחות");
    expect(formatAssistantWeather(reading, "en").options[0]?.label).toBe(
      "Temperature now",
    );
    expect(formatAssistantWeather(reading, "he").options[0]?.label).toBe(
      "הטמפרטורה עכשיו",
    );
  });

  it.each<AssistantWeatherLanguage>(["pt", "en", "es", "he"])(
    "keeps a localized safe fallback in %s",
    (language) => {
      const fallback = assistantWeatherFallback(language);
      expect(fallback.text).toContain("25°C");
      expect(fallback.text).toContain("32°C");
      expect(fallback.options).toHaveLength(5);
    },
  );

  it("keeps fallback menu labels localized", () => {
    expect(assistantWeatherFallback("pt").options[0]?.label).toBe(
      "Temperatura agora",
    );
    expect(assistantWeatherFallback("es").options[0]?.label).toBe(
      "Temperatura ahora",
    );
  });
});
