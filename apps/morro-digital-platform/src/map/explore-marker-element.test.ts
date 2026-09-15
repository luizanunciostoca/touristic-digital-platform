import { describe, expect, it } from "vitest";

import {
  getExploreCategoryFromMarkerId,
  getV1ExploreMarkerVisual,
} from "./explore-marker-element.js";

describe("V1 Explore marker presentation", () => {
  it("extracts the category only from Explore marker ids", () => {
    expect(
      getExploreCategoryFromMarkerId("explore:beaches:0:Primeira Praia"),
    ).toBe("beaches");
    expect(
      getExploreCategoryFromMarkerId("explore:restaurants:8:Sambass"),
    ).toBe("restaurants");
    expect(getExploreCategoryFromMarkerId("volta-a-ilha:stop-1")).toBeNull();
  });

  it("keeps category markers visually distinct like the V1", () => {
    expect(getV1ExploreMarkerVisual("beaches")).toEqual({
      icon: "🏖️",
      color: "#0ea5e9",
    });
    expect(getV1ExploreMarkerVisual("restaurants")).toEqual({
      icon: "🍴",
      color: "#f97316",
    });
    expect(getV1ExploreMarkerVisual("hotels")).toEqual({
      icon: "🛏️",
      color: "#8b5cf6",
    });
    expect(getV1ExploreMarkerVisual("transport")).toEqual({
      icon: "🚕",
      color: "#3b82f6",
    });
  });

  it("uses a visible generic POI fallback for unknown categories", () => {
    expect(getV1ExploreMarkerVisual("unknown")).toEqual({
      icon: "📍",
      color: "#3b82f6",
    });
  });
});
