import {
  createRouteGeometryTracker,
  formatRouteDistance,
  formatRouteDuration,
  type NavigationPosition,
  type RouteGeometrySnapshot,
  type RouteGeometryTracker,
} from "./geometry.js";
import {
  createNavigationVisualStabilizer,
  type NavigationVisualStabilizer,
  type NavigationVisualStabilizerResult,
  type VisualLocationInput,
} from "./stabilizer.js";

const RUNTIME_BEARING_SMOOTHING = 0.62;
const RUNTIME_MAX_BACKWARD_PROGRESS = 0.01;
const RUNTIME_LOOK_AHEAD_METERS = 22;

export interface NavigationInstructionInput {
  readonly original?: string;
  readonly instruction?: string;
  readonly text?: string;
  readonly maneuver?: Readonly<Record<string, unknown>>;
  readonly [key: string]: unknown;
}

export interface NavigationGuidanceSnapshot {
  readonly instruction: string;
  readonly original: string;
  readonly formattedDistance: string;
  readonly remainingDistance: string;
  readonly estimatedTime: string;
  readonly progress: number;
  readonly stepIndex: number;
}

export interface NavigationRuntimeSnapshot extends RouteGeometrySnapshot {
  readonly visualLocation: {
    readonly latitude: number;
    readonly longitude: number;
  };
  readonly visualDeadZoneMeters: number;
  readonly visualHeldByDeadZone: boolean;
  readonly visualHeldByBackwardGuard: boolean;
  readonly visualRouteSnapped: boolean;
  readonly visualIgnoredStaleUpdate: boolean;
  readonly guidance: NavigationGuidanceSnapshot;
}

export interface NavigationRuntimeUpdateInput {
  readonly routeData: unknown;
  readonly location?: (NavigationPosition & VisualLocationInput) | null;
  readonly instructions?: readonly NavigationInstructionInput[];
  readonly stepIndex?: number;
}

export interface NavigationRuntimeCoordinatorPorts {
  readonly onSnapshot?: (snapshot: NavigationRuntimeSnapshot) => void;
  readonly onVisualUpdate?: (
    update: NavigationVisualStabilizerResult,
    snapshot: NavigationRuntimeSnapshot,
  ) => void;
}

export interface NavigationRuntimeCoordinator {
  update(input: NavigationRuntimeUpdateInput): NavigationRuntimeSnapshot | null;
  getSnapshot(): NavigationRuntimeSnapshot | null;
  getTracker(): RouteGeometryTracker | null;
  reset(): void;
}

function finiteNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeStepIndex(value: unknown, instructionCount: number): number {
  const parsed = Math.max(0, Math.trunc(finiteNumber(value, 0)));
  return Math.min(parsed, Math.max(0, instructionCount - 1));
}

function instructionText(
  instruction: NavigationInstructionInput | undefined,
): string {
  if (!instruction) return "Continue pela rota";
  const maneuver = instruction.maneuver;
  const maneuverInstruction =
    maneuver && typeof maneuver.instruction === "string"
      ? maneuver.instruction
      : "";
  const candidates = [
    instruction.instruction,
    instruction.original,
    instruction.text,
    maneuverInstruction,
  ];
  return (
    candidates.find(
      (candidate): candidate is string =>
        typeof candidate === "string" && candidate.trim().length > 0,
    ) ?? "Continue pela rota"
  );
}

function buildGuidance(
  geometry: RouteGeometrySnapshot,
  instructions: readonly NavigationInstructionInput[],
  requestedStepIndex: unknown,
): NavigationGuidanceSnapshot {
  const stepIndex = normalizeStepIndex(requestedStepIndex, instructions.length);
  const instruction = instructions[stepIndex];
  const text = instructionText(instruction);
  const maneuverDistance =
    geometry.distanceToNextManeuver > 0
      ? geometry.distanceToNextManeuver
      : geometry.remainingDistance;

  return {
    instruction: text,
    original: text,
    formattedDistance: formatRouteDistance(maneuverDistance),
    remainingDistance: formatRouteDistance(geometry.remainingDistance),
    estimatedTime: formatRouteDuration(geometry.remainingDuration),
    progress: geometry.progressPercent,
    stepIndex,
  };
}

function visualInputFromLocation(
  location: (NavigationPosition & VisualLocationInput) | null | undefined,
): VisualLocationInput | null {
  if (!location) return null;
  return location;
}

export function createNavigationRuntimeCoordinator(
  ports: NavigationRuntimeCoordinatorPorts = {},
): NavigationRuntimeCoordinator {
  let tracker: RouteGeometryTracker | null = null;
  let trackedRouteData: unknown = null;
  let lastSnapshot: NavigationRuntimeSnapshot | null = null;
  const stabilizer: NavigationVisualStabilizer =
    createNavigationVisualStabilizer();

  function ensureTracker(routeData: unknown): RouteGeometryTracker | null {
    if (tracker && trackedRouteData === routeData) return tracker;
    const next = createRouteGeometryTracker(routeData, {
      bearingSmoothing: RUNTIME_BEARING_SMOOTHING,
      maxBackwardProgress: RUNTIME_MAX_BACKWARD_PROGRESS,
    });
    if (!next) return null;

    tracker = next;
    trackedRouteData = routeData;
    lastSnapshot = null;
    stabilizer.reset();
    return tracker;
  }

  return {
    update(input) {
      const activeTracker = ensureTracker(input.routeData);
      if (!activeTracker) return null;

      const instructions = input.instructions ?? [];
      const stepIndex = normalizeStepIndex(
        input.stepIndex,
        instructions.length,
      );
      const geometry = activeTracker.snapshot(input.location ?? null, {
        stepIndex,
        lookAheadMeters: RUNTIME_LOOK_AHEAD_METERS,
      });
      if (!geometry) return null;

      const visualInput = visualInputFromLocation(input.location);
      const firstCoordinate = activeTracker.model.coordinates[0];
      const fallbackVisualInput: VisualLocationInput | null = firstCoordinate
        ? {
            longitude: firstCoordinate[0],
            latitude: firstCoordinate[1],
            accuracy: 15,
          }
        : null;
      const visual = stabilizer.stabilize(
        visualInput ?? fallbackVisualInput ?? {},
        {
          projectedCoordinate: geometry.projectedCoordinate,
          offRouteDistance: geometry.offRouteDistance,
          bearing: geometry.bearing,
          rawBearing: geometry.rawBearing,
          progress: geometry.progress,
        },
      );
      if (!visual) return null;

      const guidance = buildGuidance(geometry, instructions, stepIndex);
      lastSnapshot = {
        ...geometry,
        bearing: visual.bearing,
        visualLocation: {
          latitude: visual.location.latitude,
          longitude: visual.location.longitude,
        },
        visualDeadZoneMeters: visual.deadZoneMeters,
        visualHeldByDeadZone: visual.heldByDeadZone,
        visualHeldByBackwardGuard: visual.heldByBackwardGuard,
        visualRouteSnapped: visual.usedRouteSnap,
        visualIgnoredStaleUpdate: visual.ignoredStaleUpdate,
        guidance,
      };

      ports.onSnapshot?.(lastSnapshot);
      ports.onVisualUpdate?.(visual, lastSnapshot);
      return lastSnapshot;
    },
    getSnapshot() {
      return lastSnapshot;
    },
    getTracker() {
      return tracker;
    },
    reset() {
      tracker?.reset();
      tracker = null;
      trackedRouteData = null;
      lastSnapshot = null;
      stabilizer.reset();
    },
  };
}
