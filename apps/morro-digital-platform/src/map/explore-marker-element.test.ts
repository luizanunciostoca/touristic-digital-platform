import { describe, expect, it } from "vitest";

import {
  getExploreCategoryFromMarkerId,
  getV1ExploreMarkerVisual,
  V1_EXPLORE_MARKER_ROOT_STYLE,
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

  it("keeps Explore markers in the Mapbox overlay layer above the V1 canvas", () => {
    expect(V1_EXPLORE_MARKER_ROOT_STYLE).toMatchObject({
      position: "absolute",
      top: "0px",
      left: "0px",
      width: "36px",
      height: "36px",
    });
    expect(Number(V1_EXPLORE_MARKER_ROOT_STYLE.zIndex)).toBeGreaterThan(1000);
  });

  it("uses a visible generic POI fallback for unknown categories", () => {
    expect(getV1ExploreMarkerVisual("unknown")).toEqual({
      icon: "📍",
      color: "#3b82f6",
    });
  });
});
