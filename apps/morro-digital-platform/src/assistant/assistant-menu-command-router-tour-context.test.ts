import { describe, expect, it } from "vitest";

import { readAssistantExploreState } from "./assistant-menu-command-router.js";

function createDocument(attributes: Record<string, string | null>): Document {
  const map = {
    getAttribute(name: string): string | null {
      return attributes[name] ?? null;
    },
  };
  return {
    getElementById(id: string) {
      return id === "map" ? map : null;
    },
  } as unknown as Document;
}

describe("assistant Explore tour context snapshot", () => {
  it("projects the active immersive tour from the canonical map attributes", () => {
    const state = readAssistantExploreState(
      createDocument({
        "data-explore-category": "tours",
        "data-explore-stage": "tour",
        "data-map-marker-count": "3",
        "data-tour-flow-id": "trilha-gamboa",
        "data-tour-flow-stage": "stop",
        "data-tour-stop-index": "2",
        "data-tour-total-stops": "5",
      }),
    );

    expect(state).toEqual({
      category: "tours",
      place: null,
      stage: "tour",
      markerCount: 3,
      tour: {
        tourId: "trilha-gamboa",
        stage: "stop",
        currentStopIndex: 2,
        totalStops: 5,
      },
    });
  });

  it("fails closed when tour attributes are incomplete or inconsistent", () => {
    const state = readAssistantExploreState(
      createDocument({
        "data-explore-category": "tours",
        "data-explore-stage": "tour",
        "data-map-marker-count": "8",
        "data-tour-flow-id": "volta-a-ilha",
        "data-tour-flow-stage": "stop",
        "data-tour-stop-index": "7",
        "data-tour-total-stops": "2",
      }),
    );

    expect(state.tour).toBeNull();
  });
});
