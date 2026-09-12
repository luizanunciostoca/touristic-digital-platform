import { describe, expect, it, vi } from "vitest";

import { fetchMorroWeather } from "./weather-widget.js";

describe("fetchMorroWeather", () => {
  it("maps current runtime data into the Morro weather contract", async () => {
    const fetchImplementation = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            temperatureCelsius: 28.6,
            temperatureMaxCelsius: 31.2,
            temperatureMinCelsius: 24.4,
            humidityPercent: 78.4,
            windSpeedKph: 17.6,
            rainChancePercent: 42.2,
            weatherCode: 1,
            isDay: true,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );

    await expect(fetchMorroWeather(fetchImplementation)).resolves.toEqual({
      temperatureCelsius: 29,
      temperatureMaxCelsius: 31,
      temperatureMinCelsius: 24,
      humidityPercent: 78,
      windSpeedKph: 18,
      rainChancePercent: 42,
      weatherCode: 1,
      isDay: true,
      forecast: [],
    });

    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    expect(fetchImplementation).toHaveBeenCalledWith("/api/weather", {
      headers: { Accept: "application/json" },
    });
  });

  it("maps and caps the provider forecast to the V1 seven-day surface", async () => {
    const forecast = Array.from({ length: 9 }, (_, index) => ({
      date: `2026-09-${String(12 + index).padStart(2, "0")}`,
      temperatureMaxCelsius: 30.4 + index,
      temperatureMinCelsius: 22.6 + index,
      humidityPercent: 70.4 + index,
      windSpeedKph: 12.7 + index,
      rainChancePercent: 20.3 + index,
      weatherCode: index % 2 === 0 ? 1 : 61,
    }));
    const fetchImplementation = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            temperatureCelsius: 28,
            temperatureMaxCelsius: 31,
            temperatureMinCelsius: 24,
            humidityPercent: 78,
            windSpeedKph: 18,
            rainChancePercent: 42,
            weatherCode: 1,
            isDay: true,
            forecast,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );

    const result = await fetchMorroWeather(fetchImplementation);
    expect(result.forecast).toHaveLength(7);
    expect(result.forecast?.[0]).toEqual({
      date: "2026-09-12",
      temperatureMaxCelsius: 30,
      temperatureMinCelsius: 23,
      humidityPercent: 70,
      windSpeedKph: 13,
      rainChancePercent: 20,
      weatherCode: 1,
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

  it("rejects incomplete runtime data", async () => {
    const fetchImplementation = vi.fn(
      async () =>
        new Response(JSON.stringify({ temperatureCelsius: 28 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );

    await expect(fetchMorroWeather(fetchImplementation)).rejects.toThrow(
      "incomplete current conditions",
    );
  });
});