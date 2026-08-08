export {
  NavigationSessionCancelledError,
  addNavigationEventListener,
  assertNavigationSessionActive,
  beginNavigationSession,
  cancelNavigationSession,
  getActiveNavigationSession,
  getActiveNavigationSessionId,
  isNavigationSessionActive,
  registerNavigationCleanup,
  resetNavigationSessionManagerForTests,
  scheduleNavigationInterval,
  scheduleNavigationTimeout,
  waitForNavigationSession,
  type NavigationCleanup,
  type NavigationSession,
  type NavigationSessionMetadata,
} from "./session.js";

export {
  RoutingError,
  createSameOriginRoutingProvider,
  isValidRouteFeatureCollection,
  normalizeCoordinatePair,
  normalizeRouteRequest,
  requestRoute,
  shouldUseRoutingFallback,
  type FetchLike,
  type FetchResponseLike,
  type RouteCoordinate,
  type RouteFeature,
  type RouteFeatureCollection,
  type RouteGeometry,
  type RouteRequestInput,
  type RoutingLanguage,
  type RoutingProfile,
  type RoutingProvider,
  type RoutingProviderContext,
  type RoutingRequestPayload,
} from "./routing.js";

export {
  buildRouteGeometryModel,
  calculateRouteBearing,
  calculateRoutePointDistance,
  createRouteGeometryTracker,
  formatRouteDistance,
  formatRouteDuration,
  normalizeRouteCoordinates,
  projectLocationOntoRoute,
  type GeometryCoordinate,
  type NavigationPosition,
  type RouteGeometryModel,
  type RouteGeometrySnapshot,
  type RouteGeometryTracker,
  type RouteProjection,
  type RouteStepEnd,
  type RouteStepModel,
} from "./geometry.js";

export {
  createNavigationVisualStabilizer,
  navigationVisualDistanceMeters,
  type NavigationVisualStabilizer,
  type NavigationVisualStabilizerResult,
  type NormalizedVisualLocation,
  type VisualLocationInput,
  type VisualSnapshotInput,
} from "./stabilizer.js";

export {
  createNavigationRuntimeCoordinator,
  type NavigationGuidanceSnapshot,
  type NavigationInstructionInput,
  type NavigationRuntimeCoordinator,
  type NavigationRuntimeCoordinatorPorts,
  type NavigationRuntimeSnapshot,
  type NavigationRuntimeUpdateInput,
} from "./runtime.js";

export {
  calculateArrivalDistanceMeters,
  createArrivalLifecycle,
  type ArrivalApproachDetail,
  type ArrivalCoordinate,
  type ArrivalDetail,
  type ArrivalLifecycle,
  type ArrivalLifecycleOptions,
  type ArrivalLifecyclePorts,
  type ArrivalUpdateResult,
} from "./arrival.js";

export {
  createRouteRecalculationController,
  evaluateRouteRecalculation,
  getRecalculationThresholdMeters,
  type RecalculationEligibility,
  type RecalculationEligibilityInput,
  type RouteRecalculationController,
  type RouteRecalculationControllerOptions,
  type RouteRecalculationInput,
  type RouteRecalculationRequest,
  type RouteRecalculationResult,
} from "./recalculation.js";
