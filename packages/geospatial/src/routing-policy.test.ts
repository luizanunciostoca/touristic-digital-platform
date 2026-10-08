import { describe, expect, it } from "vitest";

import { defaultGeospatialPolicy } from "./index.js";

describe("geospatial routing policy", () => {
  it("matches the canonical Navigation runtime order", () => {
    expect(defaultGeospatialPolicy).toEqual({
      mapProvider: "mapbox",
      routingPrimary: "openrouteservice",
      routingFallback: "mapbox-directions",
      legacyFallbackEnabled: true,
    });
  });
});
