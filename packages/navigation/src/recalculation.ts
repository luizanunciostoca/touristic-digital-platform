import {
  getActiveNavigationSession,
  isNavigationSessionActive,
} from "./session.js";
import {
  isValidRouteFeatureCollection,
  type RouteCoordinate,
  type RouteFeatureCollection,
} from "./routing.js";

const DEFAULT_GPS_ACCURACY_METERS = 15;
const RECALCULATION_MARGIN_METERS = 30;
const MINIMUM_MOVING_SPEED_MPS = 0.5;
const DEFAULT_COOLDOWN_MS = 30_000;
const DEFAULT_MAX_ATTEMPTS = 3;

export interface RecalculationEligibilityInput {
  readonly sessionId: number;
  readonly offRouteDistance: number;
  readonly accuracy?: number | null;
  readonly speed?: number | null;
  readonly hasInstructions: boolean;
  readonly suspended?: boolean;
  readonly inProgress?: boolean;
}

export interface RecalculationEligibility {
  readonly eligible: boolean;
  readonly thresholdMeters: number;
  readonly reason:
    | "eligible"
    | "inactive-session"
    | "in-progress"
    | "suspended"
    | "missing-instructions"
    | "stationary"
    | "within-route-tolerance";
}

export interface RouteRecalculationRequest {
  readonly start: RouteCoordinate;
  readonly end: RouteCoordinate;
  readonly signal: AbortSignal;
  readonly attempt: number;
}

export interface RouteRecalculationControllerOptions {
  readonly sessionId: number;
  readonly requestRoute: (
    request: RouteRecalculationRequest,
  ) => Promise<RouteFeatureCollection | null>;
  readonly onRouteAvailable?: (route: RouteFeatureCollection) => void;
  readonly cooldownMs?: number;
  readonly maxAttempts?: number;
  readonly now?: () => number;
}

export interface RouteRecalculationInput {
  readonly start: RouteCoordinate;
  readonly end: RouteCoordinate;
  readonly force?: boolean;
}

export interface RouteRecalculationResult {
  readonly success: boolean;
  readonly attempts: number;
  readonly reason:
    "success" | "inactive-session" | "in-progress" | "cooldown" | "failed";
  readonly route: RouteFeatureCollection | null;
}

export interface RouteRecalculationController {
  recalculate(
    input: RouteRecalculationInput,
  ): Promise<RouteRecalculationResult>;
  isInProgress(): boolean;
  getLastRecalculationAt(): number;
  resetCooldown(): void;
}

function finiteNonNegative(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function normalizedPositiveInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.max(1, Math.trunc(parsed))
    : fallback;
}

export function getRecalculationThresholdMeters(
  accuracy?: number | null,
): number {
  return (
    finiteNonNegative(accuracy, DEFAULT_GPS_ACCURACY_METERS) * 2 +
    RECALCULATION_MARGIN_METERS
  );
}

export function evaluateRouteRecalculation(
  input: RecalculationEligibilityInput,
): RecalculationEligibility {
  const thresholdMeters = getRecalculationThresholdMeters(input.accuracy);
  if (!isNavigationSessionActive(input.sessionId)) {
    return { eligible: false, thresholdMeters, reason: "inactive-session" };
  }
  if (input.inProgress) {
    return { eligible: false, thresholdMeters, reason: "in-progress" };
  }
  if (input.suspended) {
    return { eligible: false, thresholdMeters, reason: "suspended" };
  }
  if (!input.hasInstructions) {
    return { eligible: false, thresholdMeters, reason: "missing-instructions" };
  }
  if (
    typeof input.speed === "number" &&
    input.speed < MINIMUM_MOVING_SPEED_MPS
  ) {
    return { eligible: false, thresholdMeters, reason: "stationary" };
  }
  if (!(Number(input.offRouteDistance) > thresholdMeters)) {
    return {
      eligible: false,
      thresholdMeters,
      reason: "within-route-tolerance",
    };
  }
  return { eligible: true, thresholdMeters, reason: "eligible" };
}

export function createRouteRecalculationController(
  options: RouteRecalculationControllerOptions,
): RouteRecalculationController {
  const cooldownMs = finiteNonNegative(options.cooldownMs, DEFAULT_COOLDOWN_MS);
  const maxAttempts = normalizedPositiveInteger(
    options.maxAttempts,
    DEFAULT_MAX_ATTEMPTS,
  );
  const now = options.now ?? Date.now;
  let inProgress = false;
  let lastRecalculationAt = 0;

  async function recalculate(
    input: RouteRecalculationInput,
  ): Promise<RouteRecalculationResult> {
    if (!isNavigationSessionActive(options.sessionId)) {
      return {
        success: false,
        attempts: 0,
        reason: "inactive-session",
        route: null,
      };
    }
    if (inProgress && !input.force) {
      return {
        success: false,
        attempts: 0,
        reason: "in-progress",
        route: null,
      };
    }

    const currentTime = now();
    if (
      !input.force &&
      lastRecalculationAt > 0 &&
      currentTime - lastRecalculationAt < cooldownMs
    ) {
      return {
        success: false,
        attempts: 0,
        reason: "cooldown",
        route: null,
      };
    }

    const session = getActiveNavigationSession();
    if (!session || session.id !== options.sessionId) {
      return {
        success: false,
        attempts: 0,
        reason: "inactive-session",
        route: null,
      };
    }

    lastRecalculationAt = currentTime;
    inProgress = true;
    let attempts = 0;

    try {
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        if (!session.isActive()) {
          return {
            success: false,
            attempts,
            reason: "inactive-session",
            route: null,
          };
        }
        attempts = attempt;

        try {
          const route = await options.requestRoute({
            start: input.start,
            end: input.end,
            signal: session.signal,
            attempt,
          });
          if (!session.isActive()) {
            return {
              success: false,
              attempts,
              reason: "inactive-session",
              route: null,
            };
          }
          if (route && isValidRouteFeatureCollection(route)) {
            options.onRouteAvailable?.(route);
            return { success: true, attempts, reason: "success", route };
          }
        } catch {
          if (!session.isActive()) {
            return {
              success: false,
              attempts,
              reason: "inactive-session",
              route: null,
            };
          }
        }

        if (attempt < maxAttempts) {
          const shouldContinue = await session.wait(attempt * 2_000);
          if (!shouldContinue) {
            return {
              success: false,
              attempts,
              reason: "inactive-session",
              route: null,
            };
          }
        }
      }

      return { success: false, attempts, reason: "failed", route: null };
    } finally {
      inProgress = false;
    }
  }

  return Object.freeze({
    recalculate,
    isInProgress: () => inProgress,
    getLastRecalculationAt: () => lastRecalculationAt,
    resetCooldown(): void {
      lastRecalculationAt = 0;
    },
  });
}
