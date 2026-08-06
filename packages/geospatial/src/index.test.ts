import { describe, expect, it } from "vitest";

import { isValidGeoPoint } from "./index.js";

describe("isValidGeoPoint", () => {
  it("accepts valid coordinates", () => {
    const point = { latitude: -13.3793, longitude: -38.9135 };

    expect(isValidGeoPoint(point)).toBe(true);
  });

  it("rejects coordinates outside the world bounds", () => {
    const invalidLatitude = { latitude: 91, longitude: 0 };
    const invalidLongitude = { latitude: 0, longitude: 181 };

    expect(isValidGeoPoint(invalidLatitude)).toBe(false);
    expect(isValidGeoPoint(invalidLongitude)).toBe(false);
  });

  it("rejects non-finite coordinates", () => {
    const point = { latitude: Number.NaN, longitude: -38.9135 };

    expect(isValidGeoPoint(point)).toBe(false);
  });
});
