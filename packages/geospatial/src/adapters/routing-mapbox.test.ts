import { describe, expect, it, vi } from "vitest";

import {
  adaptMapboxDirectionsResponse,
  createMapboxDirectionsRoutingProvider,
  MapboxDirectionsRoutingError,
} from "./routing-mapbox.js";

const payload = {
  coordinates: [
    [-38.916, -13.375],
    [-38.917, -13.376],
  ],
  language: "pt",
} as const;

function mapboxResponse() {
  return {
    routes: [
      {
        distance: 120,
        duration: 90,
        geometry: {
          coordinates: [
            [-38.916, -13.375],
            [-38.9165, -13.3755],
            [-38.917, -13.376],
          ],
        },
        legs: [
          {
            steps: [
              {
                distance: 60,
                duration: 45,
                name: "Rua A",
                maneuver: {
                  type: "depart",
                  instruction: "Siga pela Rua A",
                  location: [-38.916, -13.375],
                },
              },
              {
                distance: 60,
                duration: 45,
                name: "Rua B",
                maneuver: {
                  type: "arrive",
                  instruction: "Você chegou ao destino.",
                  location: [-38.917, -13.376],
                },
              },
            ],
          },
        ],
      },
    ],
  };
}

describe("Mapbox Directions routing adapter", () => {
  it("adapts the frozen V1 response contract", () => {
    const result = adaptMapboxDirectionsResponse(mapboxResponse(), 123);

    expect(result.metadata).toEqual({
      provider: "mapbox_directions",
      generatedAt: 123,
    });
    expect(result.features[0].properties.summary).toEqual({
      distance: 120,
      duration: 90,
    });
    expect(result.features[0].properties.segments).toEqual([
      {
        distance: 120,
        duration: 90,
        steps: [
          expect.objectContaining({
            instruction: "Siga pela Rua A",
            way_points: [0, 2],
          }),
          expect.objectContaining({
            instruction: "Você chegou ao destino.",
            way_points: [2, 2],
          }),
        ],
      },
    ]);
  });

  it("builds the V1 walking request without leaking token into the primary provider", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => mapboxResponse(),
    }));
    const provider = createMapboxDirectionsRoutingProvider({
      token: "pk.test-token",
      fetchImpl,
      now: () => 456,
    });
    const controller = new AbortController();

    const result = await provider.request(payload, {
      signal: controller.signal,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toContain(
      "https://api.mapbox.com/directions/v5/mapbox/walking/-38.916%2C-13.375%3B-38.917%2C-13.376",
    );
    expect(url).toContain("geometries=geojson");
    expect(url).toContain("steps=true");
    expect(url).toContain("language=pt");
    expect(url).toContain("access_token=pk.test-token");
    expect(init).toMatchObject({
      method: "GET",
      credentials: "omit",
      cache: "no-store",
      signal: controller.signal,
    });
    expect(result.metadata.generatedAt).toBe(456);
  });

  it("fails explicitly when the public Mapbox token is unavailable", async () => {
    const provider = createMapboxDirectionsRoutingProvider({ token: "  " });

    await expect(
      provider.request(payload, { signal: new AbortController().signal }),
    ).rejects.toMatchObject({
      name: "MapboxDirectionsRoutingError",
      code: "MAPBOX_TOKEN_UNAVAILABLE",
    });
  });

  it("rejects invalid Mapbox route payloads", () => {
    expect(() => adaptMapboxDirectionsResponse({ routes: [] })).toThrow(
      MapboxDirectionsRoutingError,
    );
  });
});
