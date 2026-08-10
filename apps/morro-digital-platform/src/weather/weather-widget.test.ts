import { describe, expect, it, vi } from "vitest";

import { fetchMorroWeather, parseWeatherPayload } from "./weather-widget.js";

const weatherPayload = {
  temperatureCelsius: 28.6,
  weatherCode: 1,
  isDay: true,
  humidityPercent: 78.2,
  windKph: 13.4,
  precipitationProbability: 35.2,
  forecast: [
    {
      date: "2026-08-10",
      highCelsius: 30.4,
      lowCelsius: 23.2,
      weatherCode: 2,
      humidityPercent: 80.1,
      windKph: 18.8,
      precipitationProbability: 42.4,
      description: "Partly cloudy",
      hourly: [
        {
          hour: 12,
          temperatureCelsius: 29.6,
          feelsLikeCelsius: 31.2,
          humidityPercent: 76.5,
          precipitationProbability: 25.4,
          weatherCode: 2,
        },
      ],
    },
  ],
};

describe("fetchMorroWeather", () => {
  it("maps current and V1 forecast runtime data into the weather contract", async () => {
    const fetchImplementation = vi.fn(
      async () =>
        new Response(JSON.stringify(weatherPayload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );

    await expect(fetchMorroWeather(fetchImplementation)).resolves.toEqual({
      temperatureCelsius: 29,
      weatherCode: 1,
      isDay: true,
      humidityPercent: 78,
      windKph: 13,
      precipitationProbability: 35,
      forecast: [
        {
          date: "2026-08-10",
          highCelsius: 30,
          lowCelsius: 23,
          weatherCode: 2,
          humidityPercent: 80,
          windKph: 19,
          precipitationProbability: 42,
          description: "Partly cloudy",
          hourly: [
            {
              hour: 12,
              temperatureCelsius: 30,
              feelsLikeCelsius: 31,
              humidityPercent: 77,
              precipitationProbability: 25,
              weatherCode: 2,
            },
          ],
        },
      ],
    });

    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    expect(fetchImplementation).toHaveBeenCalledWith("/api/weather", {
      headers: { Accept: "application/json" },
    });
  });

  it("rejects runtime HTTP failures", async () => {
    const fetchImplementation = vi.fn(
      async () => new Response("", { status: 503 }),
    );

    await expect(fetchMorroWeather(fetchImplementation)).rejects.toThrow(
      "HTTP 503",
    );
  });

  it("rejects a current-only payload because V1 parity requires forecast fields", () => {
    expect(() =>
      parseWeatherPayload({
        temperatureCelsius: 28,
        weatherCode: 1,
        isDay: true,
      }),
    ).toThrow("incomplete current conditions");
  });

  it("drops malformed hourly points without corrupting a valid forecast day", () => {
    const parsed = parseWeatherPayload({
      ...weatherPayload,
      forecast: [
        {
          ...weatherPayload.forecast[0],
          hourly: [
            weatherPayload.forecast[0].hourly[0],
            { hour: "invalid" },
          ],
        },
      ],
    });

    expect(parsed.forecast[0]?.hourly).toHaveLength(1);
  });
});
