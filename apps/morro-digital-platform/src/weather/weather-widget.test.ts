import { describe, expect, it, vi } from "vitest";

import { fetchMorroWeather } from "./weather-widget.js";

describe("fetchMorroWeather", () => {
  it("maps current runtime data into the Morro weather contract", async () => {
    const fetchImplementation = vi.fn(async () =>
      new Response(
        JSON.stringify({
          temperatureCelsius: 28.6,
          weatherCode: 1,
          isDay: true,
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
    expect(fetchImplementation).toHaveBeenCalledWith("/api/weather", {
      headers: { Accept: "application/json" },
    });
  });

  it("rejects runtime HTTP failures", async () => {
    const fetchImplementation = vi.fn(async () =>
      new Response("", { status: 503 }),
    );

    await expect(fetchMorroWeather(fetchImplementation)).rejects.toThrow(
      "HTTP 503",
    );
  });

  it("rejects incomplete runtime data", async () => {
    const fetchImplementation = vi.fn(async () =>
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
