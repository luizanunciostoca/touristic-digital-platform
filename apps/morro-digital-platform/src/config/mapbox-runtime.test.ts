import { describe, expect, it } from "vitest";
import { loadMorroMapboxRuntimeConfig } from "./mapbox-runtime.js";

const validEnvironment = Object.freeze({
  VITE_MAPBOX_ACCESS_TOKEN: "public-token",
  VITE_MAPBOX_CONTAINER_ID: "map",
  VITE_MAPBOX_STYLE: "mapbox://styles/example/morro",
  VITE_MAPBOX_INITIAL_ZOOM: "14",
});

describe("loadMorroMapboxRuntimeConfig", () => {
  it("loads and freezes the browser-safe Mapbox configuration", () => {
    const config = loadMorroMapboxRuntimeConfig(validEnvironment);

    expect(config).toEqual({
      accessToken: "public-token",
      containerId: "map",
      style: "mapbox://styles/example/morro",
      zoom: 14,
    });
    expect(Object.isFrozen(config)).toBe(true);
  });

  it("rejects missing runtime values without leaking token content", () => {
    expect(() =>
      loadMorroMapboxRuntimeConfig({
        ...validEnvironment,
        VITE_MAPBOX_ACCESS_TOKEN: " ",
      }),
    ).toThrow(
      "Required environment variable is missing: VITE_MAPBOX_ACCESS_TOKEN.",
    );
  });

  it.each(["-1", "25", "not-a-number"])(
    "rejects invalid initial zoom %s",
    (zoom) => {
      expect(() =>
        loadMorroMapboxRuntimeConfig({
          ...validEnvironment,
          VITE_MAPBOX_INITIAL_ZOOM: zoom,
        }),
      ).toThrow("VITE_MAPBOX_INITIAL_ZOOM must be between 0 and 24.");
    },
  );
});
