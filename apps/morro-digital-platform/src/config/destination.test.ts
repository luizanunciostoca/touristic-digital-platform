import { describe, expect, it } from "vitest";

import {
  morroDeSaoPauloDestination,
  morroDeSaoPauloGeospatialPolicy,
} from "./destination.js";

describe("Morro de São Paulo destination configuration", () => {
  it("defines a valid multi-destination boundary", () => {
    expect(morroDeSaoPauloDestination.id).toBe("morro-de-sao-paulo");
    expect(morroDeSaoPauloDestination.radiusMeters).toBeGreaterThan(0);
    expect(morroDeSaoPauloDestination.modules.map).toBe(true);
  });

  it("preserves the geospatial provider policy from V1", () => {
    expect(morroDeSaoPauloGeospatialPolicy.mapProvider).toBe("mapbox");
    expect(morroDeSaoPauloGeospatialPolicy.routingPrimary).toBe(
      "openrouteservice",
    );
    expect(morroDeSaoPauloGeospatialPolicy.routingFallback).toBe(
      "mapbox-directions",
    );
    expect(morroDeSaoPauloGeospatialPolicy.legacyFallbackEnabled).toBe(true);
  });
});
