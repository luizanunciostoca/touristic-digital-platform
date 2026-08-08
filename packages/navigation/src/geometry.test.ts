import { describe, expect, it } from "vitest";
import {
  buildRouteGeometryModel,
  calculateRouteBearing,
  calculateRoutePointDistance,
  createRouteGeometryTracker,
  formatRouteDistance,
  formatRouteDuration,
  normalizeRouteCoordinates,
  projectLocationOntoRoute,
} from "./geometry.js";

function routeData(options: {
  readonly coordinates: readonly (readonly [number, number])[];
  readonly distance?: number;
  readonly duration?: number;
  readonly steps?: readonly Record<string, unknown>[];
}) {
  const { coordinates, distance = 0, duration = 0, steps = [] } = options;
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "LineString", coordinates },
        properties: {
          ...(distance || duration
            ? { summary: { distance, duration } }
            : {}),
          segments: [{ distance, duration, steps }],
        },
      },
    ],
  };
}

describe("route geometry", () => {
  it("derives distance and duration from geometry when API summary is absent", () => {
    const model = buildRouteGeometryModel(
      routeData({
        coordinates: [
          [-38.92, -13.38],
          [-38.919, -13.38],
        ],
      }),
    );

    expect(model).not.toBeNull();
    expect(model?.totalDistance).toBeGreaterThan(100);
    expect(model?.totalDuration).toBeGreaterThan(0);
  });

  it("preserves official summary and calculates remaining metrics proportionally", () => {
    const tracker = createRouteGeometryTracker(
      routeData({
        coordinates: [
          [-38.92, -13.38],
          [-38.919, -13.38],
          [-38.918, -13.38],
        ],
        distance: 300,
        duration: 240,
        steps: [
          { distance: 150, duration: 120, way_points: [0, 1] },
          { distance: 150, duration: 120, way_points: [1, 2] },
        ],
      }),
    );
    expect(tracker).not.toBeNull();
    if (!tracker) return;

    const start = tracker.snapshot(
      { latitude: -13.38, longitude: -38.92 },
      { stepIndex: 0, lookAheadMeters: 20 },
    );
    const middle = tracker.snapshot(
      { latitude: -13.38, longitude: -38.919 },
      { stepIndex: 1, lookAheadMeters: 20 },
    );
    expect(start).not.toBeNull();
    expect(middle).not.toBeNull();
    if (!start || !middle) return;

    expect(start.totalDistance).toBe(300);
    expect(start.totalDuration).toBe(240);
    expect(start.remainingDistance).toBeCloseTo(300, 0);
    expect(start.remainingDuration).toBeCloseTo(240, 0);
    expect(start.distanceToNextManeuver).toBeCloseTo(150, 0);
    expect(start.bearing).toBeGreaterThan(80);
    expect(start.bearing).toBeLessThan(100);

    expect(middle.progressPercent).toBeGreaterThan(45);
    expect(middle.progressPercent).toBeLessThan(55);
    expect(middle.remainingDistance).toBeCloseTo(150, 0);
    expect(middle.remainingDuration).toBeCloseTo(120, 0);
  });

  it("orients the bearing along the local route tangent through a turn", () => {
    const tracker = createRouteGeometryTracker(
      routeData({
        coordinates: [
          [-38.92, -13.38],
          [-38.919, -13.38],
          [-38.919, -13.379],
        ],
        distance: 220,
        duration: 180,
        steps: [
          { distance: 110, duration: 90, way_points: [0, 1] },
          { distance: 110, duration: 90, way_points: [1, 2] },
        ],
      }),
      { bearingSmoothing: 1 },
    );
    expect(tracker).not.toBeNull();
    if (!tracker) return;

    const beforeTurn = tracker.snapshot(
      { latitude: -13.38, longitude: -38.9198 },
      { stepIndex: 0, lookAheadMeters: 12 },
    );
    const afterTurn = tracker.snapshot(
      { latitude: -13.3798, longitude: -38.919 },
      { stepIndex: 1, lookAheadMeters: 12 },
    );
    expect(beforeTurn).not.toBeNull();
    expect(afterTurn).not.toBeNull();
    if (!beforeTurn || !afterTurn) return;

    expect(beforeTurn.bearing).toBeGreaterThan(75);
    expect(beforeTurn.bearing).toBeLessThan(105);
    expect(afterTurn.bearing < 20 || afterTurn.bearing > 340).toBe(true);
  });

  it("limits backward progress caused by GPS jitter", () => {
    const tracker = createRouteGeometryTracker(
      routeData({
        coordinates: [
          [-38.92, -13.38],
          [-38.918, -13.38],
        ],
        distance: 300,
        duration: 240,
      }),
      { maxBackwardProgress: 0.01 },
    );
    expect(tracker).not.toBeNull();
    if (!tracker) return;

    const forward = tracker.snapshot({
      latitude: -13.38,
      longitude: -38.919,
    });
    const jitterBack = tracker.snapshot({
      latitude: -13.38,
      longitude: -38.9194,
    });
    expect(forward).not.toBeNull();
    expect(jitterBack).not.toBeNull();
    if (!forward || !jitterBack) return;

    expect(jitterBack.progress).toBeGreaterThanOrEqual(
      forward.progress - 0.011,
    );
  });

  it("keeps north bearing zero valid and preserves V1 metric formatting", () => {
    expect(
      calculateRouteBearing(
        [-38.919, -13.38],
        [-38.919, -13.379],
      ),
    ).toBeCloseTo(0, 5);
    expect(formatRouteDistance(1250)).toBe("1.3 km");
    expect(formatRouteDuration(3660)).toBe("1h 1min");
  });

  it("normalizes all V1 route coordinate container shapes", () => {
    const coordinates = [
      [-38.92, -13.38],
      [-38.919, -13.38],
    ] as const;

    expect(normalizeRouteCoordinates({ coordinates })).toEqual(coordinates);
    expect(
      normalizeRouteCoordinates({ geometry: { coordinates } }),
    ).toEqual(coordinates);
    expect(
      normalizeRouteCoordinates({ feature: { geometry: { coordinates } } }),
    ).toEqual(coordinates);
    expect(
      normalizeRouteCoordinates({
        features: [{ geometry: { coordinates } }],
      }),
    ).toEqual(coordinates);
  });

  it("projects a location to the nearest route segment and reports off-route distance", () => {
    const model = buildRouteGeometryModel(
      routeData({
        coordinates: [
          [-38.92, -13.38],
          [-38.918, -13.38],
        ],
        distance: 300,
        duration: 240,
      }),
    );
    expect(model).not.toBeNull();
    if (!model) return;

    const projection = projectLocationOntoRoute(model, {
      latitude: -13.3799,
      longitude: -38.919,
    });
    expect(projection).not.toBeNull();
    expect(projection?.rawProgress).toBeGreaterThan(0.45);
    expect(projection?.rawProgress).toBeLessThan(0.55);
    expect(projection?.offRouteDistance).toBeGreaterThan(0);
  });

  it("uses Haversine distance and rejects invalid geometry", () => {
    expect(
      calculateRoutePointDistance(
        [-38.92, -13.38],
        [-38.919, -13.38],
      ),
    ).toBeGreaterThan(100);
    expect(buildRouteGeometryModel({ coordinates: [[0, 0]] })).toBeNull();
    expect(
      normalizeRouteCoordinates({ coordinates: [[999, 0], [0, 999]] }),
    ).toEqual([]);
  });

  it("reset clears smoothing/progress state and last snapshot", () => {
    const tracker = createRouteGeometryTracker(
      routeData({
        coordinates: [
          [-38.92, -13.38],
          [-38.918, -13.38],
        ],
        distance: 300,
        duration: 240,
      }),
    );
    expect(tracker).not.toBeNull();
    if (!tracker) return;

    tracker.snapshot({ latitude: -13.38, longitude: -38.919 });
    expect(tracker.getLastSnapshot()).not.toBeNull();
    tracker.reset();
    expect(tracker.getLastSnapshot()).toBeNull();

    const restarted = tracker.snapshot({
      latitude: -13.38,
      longitude: -38.92,
    });
    expect(restarted?.progress).toBeCloseTo(0, 2);
  });
});
