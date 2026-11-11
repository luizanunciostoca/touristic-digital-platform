import { describe, expect, it, vi } from "vitest";

import { formatAssistantWeather } from "../assistant/assistant-weather-copy.js";

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

  it("drops malformed or unsafe provider dates before they reach the modal", async () => {
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
            forecast: [
              {
                date: '<img src=x onerror="globalThis.__weatherInjected=true">',
                temperatureMaxCelsius: 31,
                temperatureMinCelsius: 24,
                humidityPercent: 78,
                windSpeedKph: 18,
                rainChancePercent: 42,
                weatherCode: 1,
              },
              {
                date: "2026-02-30",
                temperatureMaxCelsius: 31,
                temperatureMinCelsius: 24,
                humidityPercent: 78,
                windSpeedKph: 18,
                rainChancePercent: 42,
                weatherCode: 1,
              },
              {
                date: "2026-09-13",
                temperatureMaxCelsius: 30,
                temperatureMinCelsius: 23,
                humidityPercent: 77,
                windSpeedKph: 17,
                rainChancePercent: 35,
                weatherCode: 2,
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );

    const result = await fetchMorroWeather(fetchImplementation);
    expect(result.forecast).toEqual([
      {
        date: "2026-09-13",
        temperatureMaxCelsius: 30,
        temperatureMinCelsius: 23,
        humidityPercent: 77,
        windSpeedKph: 17,
        rainChancePercent: 35,
        weatherCode: 2,
      },
    ]);
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

// Real parser → real Assistant formatter, with the HTTP response boundary controlled.
describe("weather provenance and cache freshness", () => {
  const payload = {
    temperatureCelsius: 28,
    temperatureMaxCelsius: 31,
    temperatureMinCelsius: 24,
    humidityPercent: 78,
    windSpeedKph: 18,
    rainChancePercent: 42,
    weatherCode: 2,
    isDay: true,
  };
  const fetchReading = async (provider: unknown, cacheState?: string) =>
    fetchMorroWeather(
      async () =>
        new Response(
          JSON.stringify({
            ...payload,
            provider,
            cacheState: "fresh",
            observedAt: "2099-01-01T00:00:00.000Z",
          }),
          {
            headers:
              cacheState === undefined ? {} : { "X-Weather-Cache": cacheState },
          },
        ),
    );

  it.each(["open-meteo", "visual-crossing"] as const)(
    "preserves known %s provider through the parser",
    async (provider) => {
      const reading = await fetchReading(provider, "fresh");
      expect(reading.provider).toBe(provider);
      expect(Object.isFrozen(reading)).toBe(true);
      expect(reading).not.toHaveProperty("observedAt");
      expect(reading).not.toHaveProperty("fetchedAt");
    },
  );
  it.each(["fresh", "refreshed", "stale"] as const)(
    "preserves runtime %s cache status rather than JSON spoofing",
    async (cacheState) => {
      expect((await fetchReading("open-meteo", cacheState)).cacheState).toBe(
        cacheState,
      );
    },
  );
  it.each([undefined, "", "FRESH", "live"])(
    "does not manufacture provenance from invalid cache metadata %s",
    async (cacheState) => {
      const reading = await fetchReading(
        "<script>untrusted</script>",
        cacheState,
      );
      expect(reading.provider).toBeUndefined();
      expect(reading.cacheState).toBeUndefined();
      const copy = formatAssistantWeather(reading, "en");
      expect(copy.text).not.toContain("Right now");
      expect(copy.text).toContain("Observation time is not provided.");
      expect(copy.text).toContain("Source not provided.");
      expect(copy.text).not.toContain("<script>");
    },
  );
  it.each([
    [
      "pt",
      "cache desatualizado",
      "Horário da observação não informado",
      "Agora em",
    ],
    [
      "en",
      "Stale cached data",
      "Observation time is not provided",
      "Right now",
    ],
    [
      "es",
      "caché desactualizados",
      "Hora de observación no informada",
      "Ahora en",
    ],
    ["he", "נתוני מטמון ישנים", "מועד התצפית אינו ידוע", "עכשיו במורו"],
  ] as const)(
    "qualifies stale measurements in %s instead of claiming current observations",
    async (language, stale, unknownTime, now) => {
      const reading = await fetchReading("open-meteo", "stale");
      const copy = formatAssistantWeather(reading, language);
      expect(copy.text).toContain(stale);
      expect(copy.text).toContain(unknownTime);
      expect(copy.text).toContain("Open-Meteo");
      expect(copy.text).toContain("28°C");
      expect(copy.text).not.toContain(now);
      expect(copy.text).not.toContain("2099");
      expect(copy.options).toHaveLength(5);
    },
  );
  it.each(["fresh", "refreshed"] as const)(
    "does not confuse %s cache with an observation timestamp",
    async (cacheState) => {
      const reading = await fetchReading("visual-crossing", cacheState);
      const copy = formatAssistantWeather(reading, "en");
      expect(copy.text).toContain("Visual Crossing");
      expect(copy.text).toContain("Observation time is not provided.");
      expect(copy.text).not.toContain("Right now");
      expect(copy.text).not.toContain("Stale cached data");
    },
  );
});

// Cache captured before midnight can legitimately be served after midnight.
describe("weather relative-date uncertainty", () => {
  const priorDayReading = {
    temperatureCelsius: 28,
    temperatureMaxCelsius: 31,
    temperatureMinCelsius: 24,
    humidityPercent: 78,
    windSpeedKph: 18,
    rainChancePercent: 42,
    weatherCode: 0,
    isDay: false,
    cacheState: "stale" as const,
    provider: "open-meteo" as const,
    forecast: [
      {
        date: "2026-11-07",
        temperatureMaxCelsius: 31,
        temperatureMinCelsius: 24,
        humidityPercent: 78,
        windSpeedKph: 18,
        rainChancePercent: 42,
        weatherCode: 0,
      },
    ],
  };
  it.each([
    ["pt", "Hoje:", "Previsão informada:"],
    ["en", "Today:", "Reported forecast:"],
    ["es", "Hoy:", "Pronóstico informado:"],
    ["he", "היום:", "תחזית שדווחה:"],
  ] as const)(
    "does not relabel prior-day stale forecast as today in %s",
    (language, today, forecast) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-11-08T03:10:00.000Z"));
      try {
        const copy = formatAssistantWeather(priorDayReading, language);
        expect(copy.text).not.toContain(today);
        expect(copy.text).toContain(forecast);
        expect(copy.text).toContain("31°C");
        expect(copy.text).toContain("24°C");
        expect(copy.text).not.toContain("2026-11-08");
        expect(priorDayReading.forecast[0]?.date).toBe("2026-11-07");
      } finally {
        vi.useRealTimers();
      }
    },
  );
  it("describes reported night conditions without asserting tonight", () => {
    const copy = formatAssistantWeather(priorDayReading, "en");
    expect(copy.text).not.toContain("tonight");
    expect(copy.text).toContain("clear skies at night");
    expect(copy.text).toContain("Observation time is not provided.");
  });
});
