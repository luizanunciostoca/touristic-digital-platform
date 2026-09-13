import { describe, expect, it, vi } from "vitest";

import {
  fetchWeatherWithFallback,
  mapOpenMeteoWeatherPayload,
  mapVisualCrossingWeatherPayload,
} from "./weather-provider-mappers.mjs";

describe("weather provider mapping", () => {
  it("maps Visual Crossing daily forecast fields", () => {
    const result = mapVisualCrossingWeatherPayload({
      currentConditions: {
        temp: 28,
        humidity: 79,
        windspeed: 17,
        conditions: "Partially cloudy",
        icon: "partly-cloudy-day",
      },
      days: [
        {
          datetime: "2026-09-12",
          tempmax: 31,
          tempmin: 24,
          humidity: 80,
          windspeed: 18,
          precipprob: 42,
          conditions: "Partially cloudy",
          icon: "partly-cloudy-day",
        },
        {
          datetime: "2026-09-13",
          tempmax: 30,
          tempmin: 23,
          humidity: 82,
          windspeed: 20,
          precipprob: 65,
          conditions: "Rain",
          icon: "rain",
        },
      ],
    });

    expect(result.provider).toBe("visual-crossing");
    expect(result.forecast).toHaveLength(2);
    expect(result.forecast[1]).toEqual({
      date: "2026-09-13",
      temperatureMaxCelsius: 30,
      temperatureMinCelsius: 23,
      humidityPercent: 82,
      windSpeedKph: 20,
      rainChancePercent: 65,
      weatherCode: 61,
    });
  });

  it("maps Open-Meteo daily fields and derives daily humidity from hourly data", () => {
    const result = mapOpenMeteoWeatherPayload({
      current: {
        temperature_2m: 27.5,
        relative_humidity_2m: 77,
        wind_speed_10m: 16,
        weather_code: 2,
        is_day: 1,
      },
      hourly: {
        time: [
          "2026-09-12T00:00",
          "2026-09-12T12:00",
          "2026-09-13T00:00",
          "2026-09-13T12:00",
        ],
        relative_humidity_2m: [76, 80, 81, 84],
      },
      daily: {
        time: ["2026-09-12", "2026-09-13"],
        temperature_2m_max: [31, 30],
        temperature_2m_min: [24, 23],
        precipitation_probability_max: [30, 60],
        weather_code: [2, 61],
        wind_speed_10m_max: [18, 21],
      },
    });

    expect(result.provider).toBe("open-meteo");
    expect(result.forecast).toHaveLength(2);
    expect(result.forecast[0]).toEqual({
      date: "2026-09-12",
      temperatureMaxCelsius: 31,
      temperatureMinCelsius: 24,
      humidityPercent: 80,
      windSpeedKph: 18,
      rainChancePercent: 30,
      weatherCode: 2,
    });
    expect(result.forecast[1]?.humidityPercent).toBe(84);
  });

  it("falls back from Visual Crossing to Open-Meteo", async () => {
    const primaryError = new Error("Visual Crossing unavailable");
    const fallbackWeather = { provider: "open-meteo", forecast: [] };
    const fetchVisualCrossing = vi.fn(async () => {
      throw primaryError;
    });
    const fetchOpenMeteo = vi.fn(async () => fallbackWeather);
    const onRecovered = vi.fn();
    const onDegraded = vi.fn();

    await expect(
      fetchWeatherWithFallback({
        visualCrossingKey: "configured",
        fetchVisualCrossing,
        fetchOpenMeteo,
        onRecovered,
        onDegraded,
      }),
    ).resolves.toBe(fallbackWeather);

    expect(fetchVisualCrossing).toHaveBeenCalledWith("configured");
    expect(fetchOpenMeteo).toHaveBeenCalledTimes(1);
    expect(onDegraded).toHaveBeenCalledWith(
      "weather-visual-crossing",
      primaryError,
    );
    expect(onRecovered).toHaveBeenCalledWith("weather-open-meteo");
  });

  it("surfaces fallback failure after both providers fail", async () => {
    const fallbackError = new Error("Open-Meteo unavailable");
    const onDegraded = vi.fn();

    await expect(
      fetchWeatherWithFallback({
        visualCrossingKey: "configured",
        fetchVisualCrossing: async () => {
          throw new Error("Visual Crossing unavailable");
        },
        fetchOpenMeteo: async () => {
          throw fallbackError;
        },
        onDegraded,
      }),
    ).rejects.toBe(fallbackError);

    expect(onDegraded).toHaveBeenCalledTimes(2);
  });
});
