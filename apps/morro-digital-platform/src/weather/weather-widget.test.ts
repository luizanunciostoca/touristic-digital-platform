import { describe, expect, it, vi } from "vitest";

import { fetchMorroWeather } from "./weather-widget.js";

describe("fetchMorroWeather", () => {
  it("maps current provider data into the Morro weather contract", async () => {
    const fetchImplementation = vi.fn(async () =>
      new Response(
        JSON.stringify({
          current: {
            temperature_2m: 28.6,
            weather_code: 1,
            is_day: 1,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(fetchMorroWeather(fetchImplementation)).resolves.toEqual({
      temperatureCelsius: 29,
      weatherCode: 1,
      isDay: true,
    });

    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    const [url] = fetchImplementation.mock.calls[0] ?? [];
    expect(String(url)).toContain("latitude=-13.3769");
    expect(String(url)).toContain("longitude=-38.9146");
    expect(String(url)).toContain("timezone=America%2FBahia");
  });

  it("rejects provider HTTP failures", async () => {
    const fetchImplementation = vi.fn(async () => new Response("", { status: 503 }));

    await expect(fetchMorroWeather(fetchImplementation)).rejects.toThrow(
      "HTTP 503",
    );
  });

  it("rejects incomplete provider data", async () => {
    const fetchImplementation = vi.fn(async () =>
      new Response(JSON.stringify({ current: { temperature_2m: 28 } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(fetchMorroWeather(fetchImplementation)).rejects.toThrow(
      "incomplete current conditions",
    );
  });
});
