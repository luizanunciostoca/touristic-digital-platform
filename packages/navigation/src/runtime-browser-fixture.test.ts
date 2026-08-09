import { describe, expect, it, vi } from "vitest";

import { createNavigationRuntimeCoordinator } from "./runtime.js";

const ROUTE = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {
        summary: { distance: 390, duration: 290 },
        segments: [
          {
            distance: 390,
            duration: 290,
            steps: [
              {
                distance: 92,
                duration: 68,
                instruction: "Continue em frente",
                name: "Caminho principal",
                way_points: [0, 1],
                maneuver: {
                  instruction: "Continue em frente",
                  type: "continue",
                },
              },
              {
                distance: 126,
                duration: 94,
                instruction: "Vire à direita",
                name: "Rua da Fonte",
                way_points: [1, 2],
                maneuver: {
                  instruction: "Vire à direita",
                  type: "turn-right",
                },
              },
              {
                distance: 172,
                duration: 128,
                instruction: "Continue até o destino",
                name: "Destino",
                way_points: [2, 3],
                maneuver: {
                  instruction: "Continue até o destino",
                  type: "arrive",
                },
              },
            ],
          },
        ],
      },
      geometry: {
        type: "LineString",
        coordinates: [
          [-38.9172, -13.3762],
          [-38.91655, -13.37565],
          [-38.91575, -13.37485],
          [-38.9148, -13.374],
        ],
      },
    },
  ],
} as const;

const INSTRUCTIONS = ROUTE.features[0].properties.segments[0].steps;

describe("navigation runtime browser fixture", () => {
  it("produces a real runtime snapshot from the deterministic browser route", () => {
    const onSnapshot = vi.fn();
    const runtime = createNavigationRuntimeCoordinator({ onSnapshot });

    const snapshot = runtime.update({
      routeData: ROUTE,
      location: {
        latitude: -13.37615,
        longitude: -38.91715,
        accuracy: 0,
        speed: 0,
        timestamp: 1_000,
      },
      instructions: INSTRUCTIONS,
      stepIndex: 0,
    });

    expect(snapshot).not.toBeNull();
    expect(snapshot).toMatchObject({
      totalDistance: 390,
      totalDuration: 290,
      guidance: {
        instruction: "Continue em frente",
        stepIndex: 0,
        totalSteps: 3,
      },
    });
    expect(snapshot?.remainingDistance).toBeGreaterThan(0);
    expect(snapshot?.distanceToNextManeuver).toBeGreaterThan(0);
    expect(onSnapshot).toHaveBeenCalledWith(snapshot);
  });
});
