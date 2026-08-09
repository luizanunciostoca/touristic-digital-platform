import { describe, expect, it, vi } from "vitest";

import { createNavigationHealthSnapshot } from "./events.js";

describe("navigation event contracts", () => {
  it("creates the V1-equivalent health snapshot shape", () => {
    const snapshot = createNavigationHealthSnapshot({
      phase: "active",
      hasRoute: true,
      hasInstructions: true,
      hasUserLocation: true,
      isActive: true,
      isPaused: false,
      currentStepIndex: 2,
      totalSteps: 8,
      routeDistance: 1250,
      routeDuration: 900,
      routeProgress: 0.4,
      navigationSessionId: 7,
      recalculations: 1,
      destination: "Farol",
      timestamp: 12345,
    });

    expect(snapshot).toEqual({
      phase: "active",
      hasRoute: true,
      hasInstructions: true,
      hasUserLocation: true,
      isActive: true,
      isPaused: false,
      currentStepIndex: 2,
      totalSteps: 8,
      routeDistance: 1250,
      routeDuration: 900,
      routeProgress: 0.4,
      navigationSessionId: 7,
      recalculations: 1,
      destination: "Farol",
      timestamp: 12345,
    });
  });

  it("normalizes unsafe numeric and textual values", () => {
    vi.spyOn(Date, "now").mockReturnValue(999);
    const snapshot = createNavigationHealthSnapshot({
      currentStepIndex: -3,
      totalSteps: Number.NaN,
      routeDistance: -1,
      routeDuration: Number.POSITIVE_INFINITY,
      routeProgress: 4,
      navigationSessionId: 0,
      recalculations: -2,
      destination: "  Destino  ",
      timestamp: -10,
    });

    expect(snapshot.currentStepIndex).toBe(0);
    expect(snapshot.totalSteps).toBe(0);
    expect(snapshot.routeDistance).toBe(0);
    expect(snapshot.routeDuration).toBe(0);
    expect(snapshot.routeProgress).toBe(1);
    expect(snapshot.navigationSessionId).toBeNull();
    expect(snapshot.recalculations).toBe(0);
    expect(snapshot.destination).toBe("Destino");
    expect(snapshot.timestamp).toBe(999);
  });
});
