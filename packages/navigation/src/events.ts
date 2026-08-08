export type NavigationPhase =
  | "idle"
  | "initializing"
  | "route_ready"
  | "active"
  | "recalculating"
  | "ui_ready"
  | "arrived"
  | "failed"
  | "ended";

export interface NavigationHealthSnapshot {
  readonly phase: NavigationPhase;
  readonly hasRoute: boolean;
  readonly hasInstructions: boolean;
  readonly hasUserLocation: boolean;
  readonly isActive: boolean;
  readonly isPaused: boolean;
  readonly currentStepIndex: number;
  readonly totalSteps: number;
  readonly routeDistance: number;
  readonly routeDuration: number;
  readonly routeProgress: number;
  readonly navigationSessionId: number | null;
  readonly recalculations: number;
  readonly destination: string;
  readonly timestamp: number;
}

export interface NavigationHealthSnapshotInput {
  readonly phase?: NavigationPhase;
  readonly hasRoute?: boolean;
  readonly hasInstructions?: boolean;
  readonly hasUserLocation?: boolean;
  readonly isActive?: boolean;
  readonly isPaused?: boolean;
  readonly currentStepIndex?: number;
  readonly totalSteps?: number;
  readonly routeDistance?: number;
  readonly routeDuration?: number;
  readonly routeProgress?: number;
  readonly navigationSessionId?: number | null;
  readonly recalculations?: number;
  readonly destination?: string;
  readonly timestamp?: number;
}

export interface NavigationStartedEventDetail {
  readonly destination: string;
  readonly sessionId: number;
  readonly timestamp: number;
}

export interface NavigationEndedEventDetail {
  readonly reason: string;
  readonly destination: string;
  readonly timestamp: number;
}

export interface UserLocationUpdatedEventDetail {
  readonly latitude: number;
  readonly longitude: number;
  readonly accuracy: number | null;
  readonly speed: number | null;
  readonly timestamp: number;
  readonly sessionId: number;
}

export interface NavigationRouteRuntimeUpdatedEventDetail {
  readonly sessionId: number;
  readonly routeIdentity: string;
  readonly offRouteDistance: number;
  readonly remainingDistance: number;
  readonly remainingDuration: number;
  readonly progress: number;
  readonly progressPercent: number;
  readonly bearing: number;
  readonly distanceToNextManeuver: number;
  readonly timestamp: number;
}

export interface NavigationEventMap {
  readonly navigationStarted: NavigationStartedEventDetail;
  readonly navigationStatusChanged: NavigationHealthSnapshot;
  readonly userLocationUpdated: UserLocationUpdatedEventDetail;
  readonly navigationRouteRuntimeUpdated: NavigationRouteRuntimeUpdatedEventDetail;
  readonly navigationEnded: NavigationEndedEventDetail;
}

function finiteNonNegative(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function integerNonNegative(value: unknown, fallback = 0): number {
  return Math.trunc(finiteNonNegative(value, fallback));
}

function normalizeProgress(value: unknown): number {
  return Math.min(1, finiteNonNegative(value, 0));
}

function normalizeDestination(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 160) : "";
}

export function createNavigationHealthSnapshot(
  input: NavigationHealthSnapshotInput = {},
): NavigationHealthSnapshot {
  const sessionId = Number(input.navigationSessionId);
  return Object.freeze({
    phase: input.phase ?? "idle",
    hasRoute: input.hasRoute === true,
    hasInstructions: input.hasInstructions === true,
    hasUserLocation: input.hasUserLocation === true,
    isActive: input.isActive === true,
    isPaused: input.isPaused === true,
    currentStepIndex: integerNonNegative(input.currentStepIndex),
    totalSteps: integerNonNegative(input.totalSteps),
    routeDistance: finiteNonNegative(input.routeDistance),
    routeDuration: finiteNonNegative(input.routeDuration),
    routeProgress: normalizeProgress(input.routeProgress),
    navigationSessionId:
      Number.isInteger(sessionId) && sessionId > 0 ? sessionId : null,
    recalculations: integerNonNegative(input.recalculations),
    destination: normalizeDestination(input.destination),
    timestamp: finiteNonNegative(input.timestamp, Date.now()),
  });
}
