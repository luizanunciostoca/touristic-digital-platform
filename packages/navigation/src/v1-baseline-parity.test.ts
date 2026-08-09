import { describe, expect, it } from "vitest";

import {
  buildRouteGeometryModel,
  calculateRouteBearing,
  createRouteGeometryTracker,
  formatRouteDistance,
  formatRouteDuration,
} from "./geometry.js";
import {
  V1_GEOMETRY_FIXTURES,
  V1_NAVIGATION_BASELINE_PROVENANCE,
} from "./v1-baseline-fixtures.js";

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
          ...(distance || duration ? { summary: { distance, duration } } : {}),
          segments: [{ distance, duration, steps }],
        },
      },
    ],
  };
}

describe("V1 frozen navigation geometry parity", () => {
  it("pins the audited V1 commit and source blobs", () => {
    expect(V1_NAVIGATION_BASELINE_PROVENANCE).toMatchObject({
      repository: "luizidebook/morro-de-sao-paulo-digital",
      commit: "60746fd7fed97b805758b37adfdbe3bad2582bfe",
      geometrySource: {
        blobSha: "90d7b9a24c83f9bb3c9fbbefd853df46107f904f",
      },
      geometryTest: {
        blobSha: "f700c954cb791987c0fd124491bd0885e75f8e1c",
      },
      sessionSource: {
        blobSha: "1d769afad37efb349f629fceac0a483ca92fae45",
      },
      sessionContractTest: {
        blobSha: "4df4fd6fe7924198a0139e3ba44e62540fa8e167",
      },
    });
  });

  it("derives distance and duration when the V1 fixture has no API summary", () => {
    const fixture = V1_GEOMETRY_FIXTURES.derivedMetrics;
    const model = buildRouteGeometryModel(
      routeData({ coordinates: fixture.coordinates }),
    );

    expect(model).not.toBeNull();
    expect(model?.totalDistance).toBeGreaterThan(100);
    expect(model?.totalDuration).toBeGreaterThan(0);
  });

  it("preserves the official V1 summary and proportional remaining metrics", () => {
    const fixture = V1_GEOMETRY_FIXTURES.officialSummary;
    const tracker = createRouteGeometryTracker(
      routeData({
        coordinates: fixture.coordinates,
        distance: fixture.distance,
        duration: fixture.duration,
        steps: fixture.steps,
      }),
    );
    expect(tracker).not.toBeNull();
    if (!tracker) return;

    const start = tracker.snapshot(fixture.start, {
      stepIndex: 0,
      lookAheadMeters: 20,
    });
    const middle = tracker.snapshot(fixture.middle, {
      stepIndex: 1,
      lookAheadMeters: 20,
    });
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

  it("preserves local-tangent bearing around the V1 turn fixture", () => {
    const fixture = V1_GEOMETRY_FIXTURES.turnBearing;
    const tracker = createRouteGeometryTracker(
      routeData({
        coordinates: fixture.coordinates,
        distance: fixture.distance,
        duration: fixture.duration,
        steps: fixture.steps,
      }),
      { bearingSmoothing: 1 },
    );
    expect(tracker).not.toBeNull();
    if (!tracker) return;

    const beforeTurn = tracker.snapshot(fixture.beforeTurn, {
      stepIndex: 0,
      lookAheadMeters: 12,
    });
    const afterTurn = tracker.snapshot(fixture.afterTurn, {
      stepIndex: 1,
      lookAheadMeters: 12,
    });
    expect(beforeTurn).not.toBeNull();
    expect(afterTurn).not.toBeNull();
    if (!beforeTurn || !afterTurn) return;

    expect(beforeTurn.bearing).toBeGreaterThan(75);
    expect(beforeTurn.bearing).toBeLessThan(105);
    expect(afterTurn.bearing < 20 || afterTurn.bearing > 340).toBe(true);
  });

  it("limits backward progress from the frozen V1 GPS jitter fixture", () => {
    const fixture = V1_GEOMETRY_FIXTURES.gpsJitter;
    const tracker = createRouteGeometryTracker(
      routeData({
        coordinates: fixture.coordinates,
        distance: fixture.distance,
        duration: fixture.duration,
      }),
      { maxBackwardProgress: fixture.maxBackwardProgress },
    );
    expect(tracker).not.toBeNull();
    if (!tracker) return;

    const forward = tracker.snapshot(fixture.forward);
    const jitterBack = tracker.snapshot(fixture.jitterBack);
    expect(forward).not.toBeNull();
    expect(jitterBack).not.toBeNull();
    if (!forward || !jitterBack) return;

    expect(jitterBack.progress).toBeGreaterThanOrEqual(
      forward.progress - 0.011,
    );
  });

  it("preserves zero north bearing and the V1 metric formatting", () => {
    const fixture = V1_GEOMETRY_FIXTURES.northBearing;
    expect(calculateRouteBearing(fixture.from, fixture.to)).toBeCloseTo(0, 5);
    expect(formatRouteDistance(fixture.distanceMeters)).toBe(
      fixture.formattedDistance,
    );
    expect(formatRouteDuration(fixture.durationSeconds)).toBe(
      fixture.formattedDuration,
    );
  });
});
