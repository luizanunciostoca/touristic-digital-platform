import { describe, expect, it } from "vitest";

import { resolveExploreLocationByName } from "./explore-locations-control.js";

describe("Explore place identity", () => {
  it("preserves legacy first-match resolution when no category is supplied", () => {
    expect(resolveExploreLocationByName("Toca do Morcego")?.category).toBe(
      "attractions",
    );
  });

  it("disambiguates duplicate canonical names with the preserved category", () => {
    const location = resolveExploreLocationByName(
      "Toca do Morcego",
      "nightlife",
    );

    expect(location).toMatchObject({
      name: "Toca do Morcego",
      category: "nightlife",
      latitude: -13.3766787,
      longitude: -38.9172057,
    });
  });
});
