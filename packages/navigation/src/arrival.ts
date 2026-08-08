import {
  isNavigationSessionActive,
  scheduleNavigationTimeout,
} from "./session.js";

const EARTH_RADIUS_METERS = 6_371_000;

export interface ArrivalCoordinate {
  readonly latitude: number;
  readonly longitude: number;
}

export interface ArrivalLifecyclePorts {
  readonly onApproaching?: (detail: ArrivalApproachDetail) => void;
  readonly onArrived?: (detail: ArrivalDetail) => void;
  readonly onAutoEnd?: (detail: ArrivalDetail) => void;
}

export interface ArrivalApproachDetail {
  readonly sessionId: number;
  readonly distanceMeters: number;
}

export interface ArrivalDetail extends ArrivalApproachDetail {
  readonly reason: "arrived";
}

export interface ArrivalLifecycleOptions {
  readonly sessionId: number;
  readonly destination: ArrivalCoordinate;
  readonly approachThresholdMeters?: number;
  readonly arrivalThresholdMeters?: number;
  readonly autoEndDelayMs?: number;
  readonly ports?: ArrivalLifecyclePorts;
}

export interface ArrivalLifecycle {
  update(position: ArrivalCoordinate): ArrivalUpdateResult;
  isApproachNotified(): boolean;
  isArrivalNotified(): boolean;
  reset(): void;
}

export interface ArrivalUpdateResult {
  readonly distanceMeters: number;
  readonly approaching: boolean;
  readonly arrived: boolean;
  readonly notifiedApproach: boolean;
  readonly notifiedArrival: boolean;
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function validateCoordinate(value: ArrivalCoordinate): ArrivalCoordinate {
  const latitude = Number(value.latitude);
  const longitude = Number(value.longitude);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new Error("INVALID_ARRIVAL_COORDINATE");
  }
  return Object.freeze({ latitude, longitude });
}

function clampThreshold(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(parsed, 10_000));
}

export function calculateArrivalDistanceMeters(
  from: ArrivalCoordinate,
  to: ArrivalCoordinate,
): number {
  const start = validateCoordinate(from);
  const end = validateCoordinate(to);
  const latitudeDelta = toRadians(end.latitude - start.latitude);
  const longitudeDelta = toRadians(end.longitude - start.longitude);
  const latitude1 = toRadians(start.latitude);
  const latitude2 = toRadians(end.latitude);

  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitude1) *
      Math.cos(latitude2) *
      Math.sin(longitudeDelta / 2) ** 2;
  const angularDistance =
    2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  return EARTH_RADIUS_METERS * angularDistance;
}

export function createArrivalLifecycle(
  options: ArrivalLifecycleOptions,
): ArrivalLifecycle {
  const destination = validateCoordinate(options.destination);
  const approachThresholdMeters = clampThreshold(
    options.approachThresholdMeters,
    100,
  );
  const arrivalThresholdMeters = clampThreshold(
    options.arrivalThresholdMeters,
    30,
  );
  const autoEndDelayMs = clampThreshold(options.autoEndDelayMs, 5_000);
  const ports = options.ports ?? {};

  let approachNotified = false;
  let arrivalNotified = false;

  function reset(): void {
    approachNotified = false;
    arrivalNotified = false;
  }

  return Object.freeze({
    update(position: ArrivalCoordinate): ArrivalUpdateResult {
      if (!isNavigationSessionActive(options.sessionId)) {
        return Object.freeze({
          distanceMeters: Number.POSITIVE_INFINITY,
          approaching: false,
          arrived: false,
          notifiedApproach: false,
          notifiedArrival: false,
        });
      }

      const current = validateCoordinate(position);
      const distanceMeters = calculateArrivalDistanceMeters(
        current,
        destination,
      );
      const approaching = distanceMeters <= approachThresholdMeters;
      const arrived = distanceMeters <= arrivalThresholdMeters;
      let notifiedApproach = false;
      let notifiedArrival = false;

      if (approaching && !approachNotified) {
        approachNotified = true;
        notifiedApproach = true;
        ports.onApproaching?.({
          sessionId: options.sessionId,
          distanceMeters,
        });
      }

      if (arrived && !arrivalNotified) {
        arrivalNotified = true;
        notifiedArrival = true;
        const detail: ArrivalDetail = {
          sessionId: options.sessionId,
          distanceMeters,
          reason: "arrived",
        };
        ports.onArrived?.(detail);
        scheduleNavigationTimeout(
          options.sessionId,
          () => {
            ports.onAutoEnd?.(detail);
          },
          autoEndDelayMs,
        );
      }

      return Object.freeze({
        distanceMeters,
        approaching,
        arrived,
        notifiedApproach,
        notifiedArrival,
      });
    },
    isApproachNotified: () => approachNotified,
    isArrivalNotified: () => arrivalNotified,
    reset,
  });
}
