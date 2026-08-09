const EARTH_RADIUS_METERS = 6_371_000;
const DEFAULT_WALKING_SPEED_MPS = 1.25;

export type GeometryCoordinate = readonly [longitude: number, latitude: number];

export interface NavigationPosition {
  readonly latitude?: number;
  readonly longitude?: number;
  readonly lat?: number;
  readonly lon?: number;
  readonly lng?: number;
}

export interface RouteStepModel {
  readonly distance?: number;
  readonly duration?: number;
  readonly way_points?: readonly number[];
  readonly [key: string]: unknown;
}

export interface RouteStepEnd {
  readonly pointIndex: number;
  readonly alongDistance: number;
}

export interface RouteGeometryModel {
  readonly routeData: unknown;
  readonly coordinates: readonly GeometryCoordinate[];
  readonly segmentLengths: readonly number[];
  readonly cumulative: readonly number[];
  readonly geometryDistance: number;
  readonly totalDistance: number;
  readonly totalDuration: number;
  readonly distanceScale: number;
  readonly steps: readonly RouteStepModel[];
  readonly stepEnds: readonly RouteStepEnd[];
  readonly identity: string;
}

export interface RouteProjection {
  readonly segmentIndex: number;
  readonly segmentProgress: number;
  readonly projectedCoordinate: GeometryCoordinate;
  readonly offRouteDistance: number;
  readonly geometryAlongDistance: number;
  readonly scaledAlongDistance: number;
  readonly rawProgress: number;
}

export interface RouteGeometrySnapshot {
  readonly routeIdentity: string;
  readonly projectedCoordinate: GeometryCoordinate;
  readonly segmentIndex: number;
  readonly offRouteDistance: number;
  readonly totalDistance: number;
  readonly totalDuration: number;
  readonly completedDistance: number;
  readonly remainingDistance: number;
  readonly remainingDuration: number;
  readonly progress: number;
  readonly progressPercent: number;
  readonly rawBearing: number;
  readonly bearing: number;
  readonly distanceToNextManeuver: number;
}

export interface RouteGeometryTracker {
  readonly model: RouteGeometryModel;
  snapshot(
    position?: NavigationPosition | null,
    options?: {
      readonly stepIndex?: number;
      readonly lookAheadMeters?: number;
    },
  ): RouteGeometrySnapshot | null;
  getLastSnapshot(): RouteGeometrySnapshot | null;
  reset(): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function finiteNumber(
  value: unknown,
  fallback: number | null = null,
): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function positiveNumber(...values: readonly unknown[]): number {
  for (const value of values) {
    const parsed = finiteNumber(value);
    if (parsed !== null && parsed > 0) return parsed;
  }
  return 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function normalizeAngle(degrees: number): number {
  const normalized = degrees % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function angleDelta(from: number, to: number): number {
  let delta = normalizeAngle(to) - normalizeAngle(from);
  while (delta > 180) delta -= 360;
  while (delta < -180) delta += 360;
  return delta;
}

function getPath(root: unknown, path: readonly (string | number)[]): unknown {
  let current: unknown = root;
  for (const key of path) {
    if (typeof key === "number") {
      if (!Array.isArray(current)) return undefined;
      current = current[key];
      continue;
    }
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return current;
}

export function calculateRoutePointDistance(
  first: GeometryCoordinate | readonly unknown[],
  second: GeometryCoordinate | readonly unknown[],
): number {
  if (!Array.isArray(first) || !Array.isArray(second)) return Infinity;
  const longitude1 = finiteNumber(first[0]);
  const latitude1 = finiteNumber(first[1]);
  const longitude2 = finiteNumber(second[0]);
  const latitude2 = finiteNumber(second[1]);
  if (
    longitude1 === null ||
    latitude1 === null ||
    longitude2 === null ||
    latitude2 === null
  ) {
    return Infinity;
  }

  const phi1 = toRadians(latitude1);
  const phi2 = toRadians(latitude2);
  const deltaPhi = toRadians(latitude2 - latitude1);
  const deltaLambda = toRadians(longitude2 - longitude1);
  const haversine =
    Math.sin(deltaPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;

  return (
    EARTH_RADIUS_METERS *
    2 *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  );
}

export function calculateRouteBearing(
  from: GeometryCoordinate | readonly unknown[],
  to: GeometryCoordinate | readonly unknown[],
): number {
  if (!Array.isArray(from) || !Array.isArray(to)) return 0;
  const longitude1 = finiteNumber(from[0]);
  const latitude1 = finiteNumber(from[1]);
  const longitude2 = finiteNumber(to[0]);
  const latitude2 = finiteNumber(to[1]);
  if (
    longitude1 === null ||
    latitude1 === null ||
    longitude2 === null ||
    latitude2 === null
  ) {
    return 0;
  }

  const phi1 = toRadians(latitude1);
  const phi2 = toRadians(latitude2);
  const deltaLambda = toRadians(longitude2 - longitude1);
  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);

  return normalizeAngle((Math.atan2(y, x) * 180) / Math.PI);
}

export function normalizeRouteCoordinates(
  routeData: unknown,
): GeometryCoordinate[] {
  const candidates = [
    getPath(routeData, ["features", 0, "geometry", "coordinates"]),
    getPath(routeData, ["feature", "geometry", "coordinates"]),
    getPath(routeData, ["geometry", "coordinates"]),
    getPath(routeData, ["coordinates"]),
  ];
  const source = candidates.find(Array.isArray);
  if (!Array.isArray(source)) return [];

  return source.flatMap((point): GeometryCoordinate[] => {
    if (!Array.isArray(point) || point.length < 2) return [];
    const longitude = finiteNumber(point[0]);
    const latitude = finiteNumber(point[1]);
    if (
      longitude === null ||
      latitude === null ||
      longitude < -180 ||
      longitude > 180 ||
      latitude < -90 ||
      latitude > 90
    ) {
      return [];
    }
    return [[longitude, latitude]];
  });
}

function getRouteFeature(routeData: unknown): unknown {
  return (
    getPath(routeData, ["features", 0]) ??
    getPath(routeData, ["feature"]) ??
    routeData
  );
}

function getRouteSegment(routeData: unknown): unknown {
  return getPath(getRouteFeature(routeData), ["properties", "segments", 0]);
}

function getRouteSteps(routeData: unknown): RouteStepModel[] {
  const steps = getPath(getRouteSegment(routeData), ["steps"]);
  if (!Array.isArray(steps)) return [];
  return steps.filter(isRecord);
}

function sumPositive(
  items: readonly RouteStepModel[],
  field: "distance" | "duration",
): number {
  return items.reduce((sum, item) => {
    const value = finiteNumber(item[field]);
    return value !== null && value > 0 ? sum + value : sum;
  }, 0);
}

function buildCumulativeDistances(coordinates: readonly GeometryCoordinate[]) {
  const cumulative: number[] = [0];
  const segmentLengths: number[] = [];
  let total = 0;

  for (let index = 0; index < coordinates.length - 1; index += 1) {
    const start = coordinates[index];
    const end = coordinates[index + 1];
    if (!start || !end) continue;
    const length = calculateRoutePointDistance(start, end);
    const safeLength = Number.isFinite(length) ? Math.max(0, length) : 0;
    segmentLengths.push(safeLength);
    total += safeLength;
    cumulative.push(total);
  }

  return { cumulative, segmentLengths, geometryDistance: total };
}

function buildStepEnds(
  steps: readonly RouteStepModel[],
  cumulative: readonly number[],
  coordinateCount: number,
  distanceScale: number,
): RouteStepEnd[] {
  return steps.map((step, index) => {
    const wayPoints = Array.isArray(step.way_points) ? step.way_points : [];
    const fallbackIndex = Math.round(
      ((index + 1) / Math.max(1, steps.length)) * (coordinateCount - 1),
    );
    const rawIndex = finiteNumber(
      wayPoints[1],
      finiteNumber(wayPoints[0], fallbackIndex),
    );
    const pointIndex = clamp(
      Math.round(rawIndex ?? fallbackIndex),
      0,
      Math.max(0, coordinateCount - 1),
    );
    return {
      pointIndex,
      alongDistance: (cumulative[pointIndex] ?? 0) * distanceScale,
    };
  });
}

export function buildRouteGeometryModel(
  routeData: unknown,
): RouteGeometryModel | null {
  const coordinates = normalizeRouteCoordinates(routeData);
  if (coordinates.length < 2) return null;

  const feature = getRouteFeature(routeData);
  const segment = getRouteSegment(routeData);
  const steps = getRouteSteps(routeData);
  const geometry = buildCumulativeDistances(coordinates);
  if (!(geometry.geometryDistance > 0)) return null;

  const summary = getPath(feature, ["properties", "summary"]);
  const routePropertiesSummary = getPath(routeData, ["properties", "summary"]);
  const selectedSummary = isRecord(summary)
    ? summary
    : isRecord(routePropertiesSummary)
      ? routePropertiesSummary
      : {};
  const stepDistance = sumPositive(steps, "distance");
  const stepDuration = sumPositive(steps, "duration");
  const totalDistance = positiveNumber(
    selectedSummary.distance,
    getPath(segment, ["distance"]),
    getPath(routeData, ["distance"]),
    stepDistance,
    geometry.geometryDistance,
  );
  const totalDuration = positiveNumber(
    selectedSummary.duration,
    getPath(segment, ["duration"]),
    getPath(routeData, ["duration"]),
    stepDuration,
    totalDistance / DEFAULT_WALKING_SPEED_MPS,
  );
  const distanceScale =
    totalDistance > 0 ? totalDistance / geometry.geometryDistance : 1;
  const first = coordinates[0];
  const last = coordinates.at(-1);
  if (!first || !last) return null;

  return {
    routeData,
    coordinates,
    segmentLengths: geometry.segmentLengths,
    cumulative: geometry.cumulative,
    geometryDistance: geometry.geometryDistance,
    totalDistance,
    totalDuration,
    distanceScale,
    steps,
    stepEnds: buildStepEnds(
      steps,
      geometry.cumulative,
      coordinates.length,
      distanceScale,
    ),
    identity: [
      coordinates.length,
      first.join(","),
      last.join(","),
      Math.round(totalDistance),
      Math.round(totalDuration),
    ].join(":"),
  };
}

function projectPointToSegment(
  userLongitude: number,
  userLatitude: number,
  start: GeometryCoordinate,
  end: GeometryCoordinate,
) {
  const latitudeReference = toRadians(userLatitude);
  const metersPerLongitudeDegree =
    111_320 * Math.max(0.01, Math.cos(latitudeReference));
  const metersPerLatitudeDegree = 110_540;
  const ax = (start[0] - userLongitude) * metersPerLongitudeDegree;
  const ay = (start[1] - userLatitude) * metersPerLatitudeDegree;
  const bx = (end[0] - userLongitude) * metersPerLongitudeDegree;
  const by = (end[1] - userLatitude) * metersPerLatitudeDegree;
  const dx = bx - ax;
  const dy = by - ay;
  const denominator = dx * dx + dy * dy;
  const rawT = denominator > 0 ? -(ax * dx + ay * dy) / denominator : 0;
  const t = clamp(rawT, 0, 1);
  const projectedX = ax + dx * t;
  const projectedY = ay + dy * t;

  return {
    t,
    distance: Math.hypot(projectedX, projectedY),
    coordinate: [
      start[0] + (end[0] - start[0]) * t,
      start[1] + (end[1] - start[1]) * t,
    ] as GeometryCoordinate,
  };
}

export function projectLocationOntoRoute(
  model: RouteGeometryModel,
  position: NavigationPosition,
): RouteProjection | null {
  const longitude = finiteNumber(
    position.longitude,
    finiteNumber(position.lon, finiteNumber(position.lng)),
  );
  const latitude = finiteNumber(position.latitude, finiteNumber(position.lat));
  if (longitude === null || latitude === null) return null;

  let best: Omit<
    RouteProjection,
    "scaledAlongDistance" | "rawProgress"
  > | null = null;

  for (let index = 0; index < model.coordinates.length - 1; index += 1) {
    const start = model.coordinates[index];
    const end = model.coordinates[index + 1];
    if (!start || !end) continue;
    const projection = projectPointToSegment(longitude, latitude, start, end);
    if (!best || projection.distance < best.offRouteDistance) {
      best = {
        segmentIndex: index,
        segmentProgress: projection.t,
        projectedCoordinate: projection.coordinate,
        offRouteDistance: projection.distance,
        geometryAlongDistance:
          (model.cumulative[index] ?? 0) +
          (model.segmentLengths[index] ?? 0) * projection.t,
      };
    }
  }

  if (!best) return null;
  const scaledAlongDistance = best.geometryAlongDistance * model.distanceScale;
  const rawProgress =
    model.totalDistance > 0
      ? clamp(scaledAlongDistance / model.totalDistance, 0, 1)
      : clamp(best.geometryAlongDistance / model.geometryDistance, 0, 1);

  return { ...best, scaledAlongDistance, rawProgress };
}

function coordinateAtGeometryDistance(
  model: RouteGeometryModel,
  targetDistance: number,
): GeometryCoordinate {
  const distance = clamp(targetDistance, 0, model.geometryDistance);
  const first = model.coordinates[0];
  const last = model.coordinates.at(-1);
  if (!first || !last) return [0, 0];
  if (distance <= 0) return first;
  if (distance >= model.geometryDistance) return last;

  let segmentIndex = 0;
  while (
    segmentIndex < model.segmentLengths.length - 1 &&
    (model.cumulative[segmentIndex + 1] ?? 0) < distance
  ) {
    segmentIndex += 1;
  }

  const segmentStartDistance = model.cumulative[segmentIndex] ?? 0;
  const segmentLength = model.segmentLengths[segmentIndex] || 1;
  const start = model.coordinates[segmentIndex] ?? first;
  const end = model.coordinates[segmentIndex + 1] ?? last;
  const progress = clamp(
    (distance - segmentStartDistance) / segmentLength,
    0,
    1,
  );

  return [
    start[0] + (end[0] - start[0]) * progress,
    start[1] + (end[1] - start[1]) * progress,
  ];
}

function getRouteTangentBearing(
  model: RouteGeometryModel,
  projection: RouteProjection,
  lookAheadMeters: number,
): number {
  const lookAheadGeometry = Math.max(
    5,
    lookAheadMeters / Math.max(0.01, model.distanceScale),
  );
  const aheadDistance = Math.min(
    model.geometryDistance,
    projection.geometryAlongDistance + lookAheadGeometry,
  );
  let from = projection.projectedCoordinate;
  let to = coordinateAtGeometryDistance(model, aheadDistance);

  if (
    calculateRoutePointDistance(from, to) < 1 &&
    projection.geometryAlongDistance > 1
  ) {
    from = coordinateAtGeometryDistance(
      model,
      Math.max(0, projection.geometryAlongDistance - lookAheadGeometry),
    );
    to = projection.projectedCoordinate;
  }

  return calculateRouteBearing(from, to);
}

export function createRouteGeometryTracker(
  routeData: unknown,
  options: {
    readonly bearingSmoothing?: number;
    readonly maxBackwardProgress?: number;
  } = {},
): RouteGeometryTracker | null {
  const model = buildRouteGeometryModel(routeData);
  if (!model) return null;

  const bearingSmoothing = clamp(
    finiteNumber(options.bearingSmoothing, 0.55) ?? 0.55,
    0.05,
    1,
  );
  const maxBackwardProgress = clamp(
    finiteNumber(options.maxBackwardProgress, 0.015) ?? 0.015,
    0,
    0.2,
  );
  let lastProgress = 0;
  let lastBearing: number | null = null;
  let lastSnapshot: RouteGeometrySnapshot | null = null;

  return {
    model,
    snapshot(position = null, snapshotOptions = {}) {
      const first = model.coordinates[0];
      if (!first) return null;
      const fallbackPosition: NavigationPosition = {
        longitude: first[0],
        latitude: first[1],
      };
      const projection = projectLocationOntoRoute(
        model,
        position ?? fallbackPosition,
      );
      if (!projection) return null;

      const progress = clamp(
        Math.max(projection.rawProgress, lastProgress - maxBackwardProgress),
        0,
        1,
      );
      lastProgress = progress;

      const remainingDistance = Math.max(
        0,
        model.totalDistance * (1 - progress),
      );
      const completedDistance = Math.max(
        0,
        model.totalDistance - remainingDistance,
      );
      const remainingDuration =
        model.totalDistance > 0
          ? Math.max(
              0,
              model.totalDuration * (remainingDistance / model.totalDistance),
            )
          : 0;
      const lookAheadMeters = clamp(
        finiteNumber(snapshotOptions.lookAheadMeters, 20) ?? 20,
        8,
        45,
      );
      const rawBearing = getRouteTangentBearing(
        model,
        projection,
        lookAheadMeters,
      );
      const bearing =
        lastBearing === null
          ? rawBearing
          : normalizeAngle(
              lastBearing +
                angleDelta(lastBearing, rawBearing) * bearingSmoothing,
            );
      lastBearing = bearing;

      const scaledAlongDistance = progress * model.totalDistance;
      const stepIndex = clamp(
        Math.trunc(finiteNumber(snapshotOptions.stepIndex, 0) ?? 0),
        0,
        Math.max(0, model.stepEnds.length - 1),
      );
      const stepEnd = model.stepEnds[stepIndex];
      const maneuverDistance = stepEnd
        ? Math.max(0, stepEnd.alongDistance - scaledAlongDistance)
        : remainingDistance;

      lastSnapshot = {
        routeIdentity: model.identity,
        projectedCoordinate: projection.projectedCoordinate,
        segmentIndex: projection.segmentIndex,
        offRouteDistance: projection.offRouteDistance,
        totalDistance: model.totalDistance,
        totalDuration: model.totalDuration,
        completedDistance,
        remainingDistance,
        remainingDuration,
        progress,
        progressPercent: clamp(progress * 100, 0, 100),
        rawBearing,
        bearing,
        distanceToNextManeuver:
          maneuverDistance > 0 ? maneuverDistance : remainingDistance,
      };
      return lastSnapshot;
    },
    getLastSnapshot() {
      return lastSnapshot;
    },
    reset() {
      lastProgress = 0;
      lastBearing = null;
      lastSnapshot = null;
    },
  };
}

export function formatRouteDistance(distance: unknown): string {
  const meters = Math.max(0, finiteNumber(distance, 0) ?? 0);
  return meters >= 1_000
    ? `${(meters / 1_000).toFixed(meters >= 10_000 ? 0 : 1)} km`
    : `${Math.round(meters)} m`;
}

export function formatRouteDuration(durationSeconds: unknown): string {
  const seconds = Math.max(0, finiteNumber(durationSeconds, 0) ?? 0);
  const minutes = Math.max(0, Math.ceil(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder > 0 ? `${hours}h ${remainder}min` : `${hours}h`;
}
