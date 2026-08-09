import { describe, expect, it } from "vitest";
import {
  createNavigationVisualStabilizer,
  navigationVisualDistanceMeters,
} from "./stabilizer.js";

describe("navigation visual stabilizer", () => {
  it("holds the marker for small stationary GPS jitter", () => {
    const stabilizer = createNavigationVisualStabilizer();
    const first = stabilizer.stabilize(
      { latitude: -13.376, longitude: -38.917, accuracy: 5, speed: 0 },
      {
        projectedCoordinate: [-38.917, -13.376],
        offRouteDistance: 1,
        bearing: 90,
      },
    );
    const second = stabilizer.stabilize(
      {
        latitude: -13.37598,
        longitude: -38.91698,
        accuracy: 5,
        speed: 0,
      },
      {
        projectedCoordinate: [-38.91698, -13.37598],
        offRouteDistance: 1,
        bearing: 91,
      },
    );

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    if (!first || !second) return;
    expect(second.heldByDeadZone).toBe(true);
    expect(second.location.latitude).toBe(first.location.latitude);
    expect(second.location.longitude).toBe(first.location.longitude);
    expect(second.bearing).toBe(first.bearing);
  });

  it("releases actual movement after leaving the dead zone", () => {
    const stabilizer = createNavigationVisualStabilizer();
    const first = stabilizer.stabilize(
      { latitude: -13.376, longitude: -38.917, accuracy: 5, speed: 1.2 },
      {
        projectedCoordinate: [-38.917, -13.376],
        offRouteDistance: 1,
        bearing: 90,
      },
    );
    const second = stabilizer.stabilize(
      { latitude: -13.376, longitude: -38.91696, accuracy: 5, speed: 1.2 },
      {
        projectedCoordinate: [-38.91696, -13.376],
        offRouteDistance: 1,
        bearing: 90,
      },
    );

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    if (!first || !second) return;
    expect(
      navigationVisualDistanceMeters(first.location, second.location),
    ).toBeGreaterThan(1);
    expect(second.heldByDeadZone).toBe(false);
  });

  it("snaps visual position to route inside the accuracy-derived threshold", () => {
    const stabilizer = createNavigationVisualStabilizer();
    const result = stabilizer.stabilize(
      { latitude: -13.3759, longitude: -38.917, accuracy: 10, speed: 1 },
      {
        projectedCoordinate: [-38.91705, -13.376],
        offRouteDistance: 9,
        bearing: 180,
      },
    );

    expect(result?.usedRouteSnap).toBe(true);
    expect(result?.location.latitude).toBeCloseTo(-13.376, 6);
    expect(result?.location.longitude).toBeCloseTo(-38.91705, 6);
  });

  it("does not hide a real off-route deviation", () => {
    const stabilizer = createNavigationVisualStabilizer();
    const result = stabilizer.stabilize(
      { latitude: -13.3757, longitude: -38.9167, accuracy: 8, speed: 1 },
      {
        projectedCoordinate: [-38.91705, -13.376],
        offRouteDistance: 45,
        bearing: 180,
      },
    );

    expect(result?.usedRouteSnap).toBe(false);
    expect(result?.location.latitude).toBeCloseTo(-13.3757, 6);
    expect(result?.location.longitude).toBeCloseTo(-38.9167, 6);
  });

  it("uses a bearing dead-band while still allowing a real turn", () => {
    const stabilizer = createNavigationVisualStabilizer({
      bearingDeadBandDegrees: 3,
      bearingResponse: 0.5,
    });
    const first = stabilizer.stabilize(
      { latitude: -13.376, longitude: -38.917, accuracy: 5, speed: 1 },
      {
        projectedCoordinate: [-38.917, -13.376],
        offRouteDistance: 1,
        bearing: 90,
      },
    );
    const jitter = stabilizer.stabilize(
      { latitude: -13.376, longitude: -38.91698, accuracy: 5, speed: 1 },
      {
        projectedCoordinate: [-38.91698, -13.376],
        offRouteDistance: 1,
        bearing: 92,
      },
    );
    const turn = stabilizer.stabilize(
      {
        latitude: -13.37598,
        longitude: -38.91696,
        accuracy: 5,
        speed: 1,
      },
      {
        projectedCoordinate: [-38.91696, -13.37598],
        offRouteDistance: 1,
        bearing: 150,
      },
    );

    expect(first).not.toBeNull();
    expect(jitter).not.toBeNull();
    expect(turn).not.toBeNull();
    if (!first || !jitter || !turn) return;
    expect(jitter.bearing).toBe(first.bearing);
    expect(turn.bearing).toBeGreaterThan(90);
    expect(turn.bearing).toBeLessThan(150);
  });

  it("requires two consecutive samples to release route snap", () => {
    const stabilizer = createNavigationVisualStabilizer();
    const location = {
      latitude: -13.376,
      longitude: -38.917,
      accuracy: 8,
      speed: 1,
    };

    expect(
      stabilizer.stabilize(location, {
        projectedCoordinate: [-38.917, -13.376],
        offRouteDistance: 5,
        bearing: 90,
      })?.routeSnapActive,
    ).toBe(true);
    expect(
      stabilizer.stabilize(location, {
        projectedCoordinate: [-38.917, -13.376],
        offRouteDistance: 40,
        bearing: 90,
      })?.routeSnapActive,
    ).toBe(true);
    expect(
      stabilizer.stabilize(location, {
        projectedCoordinate: [-38.917, -13.376],
        offRouteDistance: 40,
        bearing: 90,
      })?.routeSnapActive,
    ).toBe(false);
  });

  it("ignores stale updates older than the accepted timestamp window", () => {
    const stabilizer = createNavigationVisualStabilizer();
    const current = stabilizer.stabilize(
      {
        latitude: -13.376,
        longitude: -38.917,
        accuracy: 5,
        speed: 1,
        timestamp: 10_000,
      },
      { offRouteDistance: 40, bearing: 90 },
    );
    const stale = stabilizer.stabilize(
      {
        latitude: -13.38,
        longitude: -38.92,
        accuracy: 5,
        speed: 1,
        timestamp: 9_000,
      },
      { offRouteDistance: 40, bearing: 200 },
    );

    expect(current).not.toBeNull();
    expect(stale?.ignoredStaleUpdate).toBe(true);
    expect(stale?.location.latitude).toBe(current?.location.latitude);
    expect(stale?.bearing).toBe(current?.bearing);
  });

  it("holds small backwards visual progress while route snap is active", () => {
    const stabilizer = createNavigationVisualStabilizer({
      minDeadZoneMeters: 0.5,
      maxDeadZoneMeters: 0.5,
      stationaryDeadZoneMeters: 0.5,
    });
    const first = stabilizer.stabilize(
      { latitude: -13.376, longitude: -38.917, accuracy: 5, speed: 1 },
      {
        projectedCoordinate: [-38.917, -13.376],
        offRouteDistance: 1,
        bearing: 90,
        progress: 0.5,
      },
    );
    const backwards = stabilizer.stabilize(
      { latitude: -13.376, longitude: -38.91695, accuracy: 5, speed: 1 },
      {
        projectedCoordinate: [-38.91695, -13.376],
        offRouteDistance: 1,
        bearing: 90,
        progress: 0.49,
      },
    );

    expect(first).not.toBeNull();
    expect(backwards?.heldByBackwardGuard).toBe(true);
    expect(backwards?.location.longitude).toBe(first?.location.longitude);
  });

  it("reset removes held visual state", () => {
    const stabilizer = createNavigationVisualStabilizer();
    stabilizer.stabilize(
      { latitude: -13.376, longitude: -38.917, accuracy: 5, speed: 0 },
      { offRouteDistance: 40, bearing: 90 },
    );
    expect(stabilizer.getLastLocation()).not.toBeNull();
    expect(stabilizer.getLastBearing()).toBe(90);

    stabilizer.reset();
    expect(stabilizer.getLastLocation()).toBeNull();
    expect(stabilizer.getLastBearing()).toBeNull();
  });
});
