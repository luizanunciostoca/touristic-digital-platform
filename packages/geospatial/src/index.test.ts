import { describe, expect, it } from "vitest";

import { isValidGeoPoint } from "./index.js";

describe("isValidGeoPoint", () => {
  it("accepts valid coordinates", () => {
    expect(isValidGeoPoint({ latitude: -13.3793, longitude: -38.9135 })).toBe(
      true,
    );
  });

  it("rejects coordinates outside the world bounds", () => {
    expect(isValidGeoPoint({ latitude: 91, longitude: 0 })).toBe(false);
    expect(isValidGeoPoint({ latitude: 0, longitude: 181 })).toBe(false);
  });

  it("rejects non-finite coordinates", () => {
    expect(
      isValidGeoPoint({ latitude: Number.NaN, longitude: -38.9135 }),
    ).toBe(false);
  });
});
