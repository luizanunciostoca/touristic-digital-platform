const EARTH_RADIUS_METERS = 6_371_000;

export interface VisualLocationInput {
  readonly latitude?: number;
  readonly longitude?: number;
  readonly lat?: number;
  readonly lon?: number;
  readonly lng?: number;
  readonly accuracy?: number;
  readonly speed?: number | null;
  readonly timestamp?: number;
  readonly [key: string]: unknown;
}

export interface VisualSnapshotInput {
  readonly projectedCoordinate?: readonly unknown[];
  readonly offRouteDistance?: number;
  readonly bearing?: number;
  readonly rawBearing?: number;
  readonly progress?: number;
}

export interface NormalizedVisualLocation extends VisualLocationInput {
  readonly latitude: number;
  readonly longitude: number;
  readonly lat: number;
  readonly lon: number;
  readonly lng: number;
  readonly accuracy: number;
  readonly speed: number | null;
  readonly usedRouteSnap?: boolean;
}

export interface NavigationVisualStabilizerResult {
  readonly location: NormalizedVisualLocation;
  readonly bearing: number;
  readonly rawBearing: number;
  readonly deadZoneMeters: number;
  readonly snapThresholdMeters: number;
  readonly snapEnterThresholdMeters: number;
  readonly snapExitThresholdMeters: number;
  readonly movementMeters: number;
  readonly heldByDeadZone: boolean;
  readonly heldByBackwardGuard: boolean;
  readonly routeSnapActive: boolean;
  readonly ignoredStaleUpdate: boolean;
  readonly usedRouteSnap: boolean;
}

export interface NavigationVisualStabilizer {
  stabilize(
    location: VisualLocationInput,
    snapshot?: VisualSnapshotInput,
  ): NavigationVisualStabilizerResult | null;
  getLastLocation(): NormalizedVisualLocation | null;
  getLastBearing(): number | null;
  reset(): void;
}

function finiteNumber(value: unknown, fallback: number | null = null): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeAngle(value: unknown): number {
  const normalized = (finiteNumber(value, 0) ?? 0) % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function angleDelta(from: number, to: number): number {
  let delta = normalizeAngle(to) - normalizeAngle(from);
  while (delta > 180) delta -= 360;
  while (delta < -180) delta += 360;
  return delta;
}

function isValidCoordinate(
  latitude: number | null,
  longitude: number | null,
): latitude is number {
  return Boolean(
    latitude !== null &&
      longitude !== null &&
      Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      latitude >= -90 &&
      latitude <= 90 &&
      longitude >= -180 &&
      longitude <= 180,
  );
}

function normalizeLocation(
  location: VisualLocationInput | null | undefined,
): NormalizedVisualLocation | null {
  if (!location || typeof location !== "object") return null;
  const latitude = finiteNumber(location.latitude, finiteNumber(location.lat));
  const longitude = finiteNumber(
    location.longitude,
    finiteNumber(location.lon, finiteNumber(location.lng)),
  );
  if (!isValidCoordinate(latitude, longitude) || longitude === null) return null;

  return {
    ...location,
    latitude,
    longitude,
    lat: latitude,
    lon: longitude,
    lng: longitude,
    accuracy: Math.max(0, finiteNumber(location.accuracy, 15) ?? 15),
    speed: finiteNumber(location.speed),
  };
}

export function navigationVisualDistanceMeters(
  first: VisualLocationInput | null | undefined,
  second: VisualLocationInput | null | undefined,
): number {
  const normalizedFirst = normalizeLocation(first);
  const normalizedSecond = normalizeLocation(second);
  if (!normalizedFirst || !normalizedSecond) return Infinity;

  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const phi1 = toRadians(normalizedFirst.latitude);
  const phi2 = toRadians(normalizedSecond.latitude);
  const deltaPhi = toRadians(
    normalizedSecond.latitude - normalizedFirst.latitude,
  );
  const deltaLambda = toRadians(
    normalizedSecond.longitude - normalizedFirst.longitude,
  );
  const haversine =
    Math.sin(deltaPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;

  return (
    EARTH_RADIUS_METERS *
    2 *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  );
}

function getProjectedLocation(
  location: NormalizedVisualLocation,
  snapshot: VisualSnapshotInput,
  useProjected: boolean,
): NormalizedVisualLocation {
  const projected = snapshot.projectedCoordinate;
  if (
    !useProjected ||
    !Array.isArray(projected) ||
    projected.length < 2
  ) {
    return { ...location, usedRouteSnap: false };
  }

  const longitude = finiteNumber(projected[0]);
  const latitude = finiteNumber(projected[1]);
  if (!isValidCoordinate(latitude, longitude) || longitude === null) {
    return { ...location, usedRouteSnap: false };
  }

  return {
    ...location,
    latitude,
    longitude,
    lat: latitude,
    lon: longitude,
    lng: longitude,
    usedRouteSnap: true,
  };
}

export function createNavigationVisualStabilizer(
  options: {
    readonly minDeadZoneMeters?: number;
    readonly maxDeadZoneMeters?: number;
    readonly stationaryDeadZoneMeters?: number;
    readonly stationarySpeedMps?: number;
    readonly movingSpeedMps?: number;
    readonly bearingDeadBandDegrees?: number;
    readonly bearingResponse?: number;
  } = {},
): NavigationVisualStabilizer {
  const minDeadZoneMeters = clamp(
    finiteNumber(options.minDeadZoneMeters, 1.8) ?? 1.8,
    0.5,
    8,
  );
  const maxDeadZoneMeters = clamp(
    finiteNumber(options.maxDeadZoneMeters, 4.2) ?? 4.2,
    minDeadZoneMeters,
    12,
  );
  const stationaryDeadZoneMeters = clamp(
    finiteNumber(options.stationaryDeadZoneMeters, 5) ?? 5,
    minDeadZoneMeters,
    15,
  );
  const stationarySpeedMps = clamp(
    finiteNumber(options.stationarySpeedMps, 0.45) ?? 0.45,
    0,
    3,
  );
  const movingSpeedMps = clamp(
    finiteNumber(options.movingSpeedMps, 0.8) ?? 0.8,
    stationarySpeedMps,
    5,
  );
  const bearingDeadBandDegrees = clamp(
    finiteNumber(options.bearingDeadBandDegrees, 3) ?? 3,
    0,
    20,
  );
  const bearingResponse = clamp(
    finiteNumber(options.bearingResponse, 0.45) ?? 0.45,
    0.05,
    1,
  );

  let lastVisualLocation: NormalizedVisualLocation | null = null;
  let lastVisualBearing: number | null = null;
  let lastVisualProgress: number | null = null;
  let lastAcceptedTimestamp: number | null = null;
  let lastResult: NavigationVisualStabilizerResult | null = null;
  let routeSnapActive = false;
  let snapReleaseSamples = 0;

  return {
    stabilize(locationInput, snapshot = {}) {
      const location = normalizeLocation(locationInput);
      if (!location) return null;

      const accuracy = Math.max(1, finiteNumber(location.accuracy, 15) ?? 15);
      const speed = finiteNumber(location.speed);
      const timestamp = finiteNumber(location.timestamp);

      if (
        timestamp !== null &&
        lastAcceptedTimestamp !== null &&
        timestamp < lastAcceptedTimestamp - 250 &&
        lastResult
      ) {
        return { ...lastResult, ignoredStaleUpdate: true };
      }
      if (timestamp !== null) {
        lastAcceptedTimestamp =
          lastAcceptedTimestamp === null
            ? timestamp
            : Math.max(lastAcceptedTimestamp, timestamp);
      }

      const snapEnterThresholdMeters = clamp(accuracy * 1.25, 8, 24);
      const snapExitThresholdMeters = clamp(
        snapEnterThresholdMeters * 1.65,
        12,
        36,
      );
      const offRouteDistance = finiteNumber(
        snapshot.offRouteDistance,
        Infinity,
      ) ?? Infinity;

      if (!routeSnapActive && offRouteDistance <= snapEnterThresholdMeters) {
        routeSnapActive = true;
        snapReleaseSamples = 0;
      } else if (routeSnapActive) {
        if (offRouteDistance > snapExitThresholdMeters) {
          snapReleaseSamples += 1;
          if (snapReleaseSamples >= 2) {
            routeSnapActive = false;
            snapReleaseSamples = 0;
          }
        } else {
          snapReleaseSamples = 0;
        }
      }

      const snapThresholdMeters = routeSnapActive
        ? snapExitThresholdMeters
        : snapEnterThresholdMeters;
      const candidate = getProjectedLocation(
        location,
        snapshot,
        routeSnapActive,
      );

      let deadZoneMeters = clamp(
        accuracy * 0.22,
        minDeadZoneMeters,
        maxDeadZoneMeters,
      );
      if (speed !== null && speed <= stationarySpeedMps) {
        deadZoneMeters = Math.max(deadZoneMeters, stationaryDeadZoneMeters);
      } else if (speed !== null && speed >= movingSpeedMps) {
        deadZoneMeters = Math.max(1.2, deadZoneMeters * 0.7);
      }

      let visualLocation = candidate;
      let heldByDeadZone = false;
      let heldByBackwardGuard = false;
      let movementMeters = Infinity;
      const progress = finiteNumber(snapshot.progress);

      if (lastVisualLocation) {
        movementMeters = navigationVisualDistanceMeters(
          lastVisualLocation,
          candidate,
        );
        const smallBackwardRegression = Boolean(
          routeSnapActive &&
            lastVisualProgress !== null &&
            progress !== null &&
            progress < lastVisualProgress - 0.0005,
        );

        if (smallBackwardRegression || movementMeters < deadZoneMeters) {
          visualLocation = {
            ...candidate,
            latitude: lastVisualLocation.latitude,
            longitude: lastVisualLocation.longitude,
            lat: lastVisualLocation.latitude,
            lon: lastVisualLocation.longitude,
            lng: lastVisualLocation.longitude,
            usedRouteSnap: lastVisualLocation.usedRouteSnap,
          };
          heldByDeadZone = movementMeters < deadZoneMeters;
          heldByBackwardGuard = smallBackwardRegression;
        }
      }

      if (progress !== null && !heldByBackwardGuard) {
        lastVisualProgress =
          lastVisualProgress === null
            ? progress
            : Math.max(lastVisualProgress, progress);
      }

      const rawBearing = normalizeAngle(
        finiteNumber(snapshot.bearing, finiteNumber(snapshot.rawBearing, 0)) ?? 0,
      );
      let visualBearing = rawBearing;
      if (lastVisualBearing !== null) {
        const delta = angleDelta(lastVisualBearing, rawBearing);
        if (Math.abs(delta) < bearingDeadBandDegrees) {
          visualBearing = lastVisualBearing;
        } else {
          visualBearing = normalizeAngle(
            lastVisualBearing + delta * bearingResponse,
          );
        }
      }

      lastVisualLocation = { ...visualLocation };
      lastVisualBearing = visualBearing;

      const result: NavigationVisualStabilizerResult = {
        location: visualLocation,
        bearing: visualBearing,
        rawBearing,
        deadZoneMeters,
        snapThresholdMeters,
        snapEnterThresholdMeters,
        snapExitThresholdMeters,
        movementMeters,
        heldByDeadZone,
        heldByBackwardGuard,
        routeSnapActive,
        ignoredStaleUpdate: false,
        usedRouteSnap: Boolean(visualLocation.usedRouteSnap),
      };
      lastResult = result;
      return result;
    },
    getLastLocation() {
      return lastVisualLocation ? { ...lastVisualLocation } : null;
    },
    getLastBearing() {
      return lastVisualBearing;
    },
    reset() {
      lastVisualLocation = null;
      lastVisualBearing = null;
      lastVisualProgress = null;
      lastAcceptedTimestamp = null;
      lastResult = null;
      routeSnapActive = false;
      snapReleaseSamples = 0;
    },
  };
}
