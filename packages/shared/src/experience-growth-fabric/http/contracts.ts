export type GrowthHttpMethod = "GET" | "POST";

export type GrowthHttpAuthPolicy =
  "anonymous" | "optional_subject" | "authenticated_subject" | "control_plane";

export type GrowthHttpScopePolicy =
  "destination" | "tenant_and_destination" | "control_plane_destination";

export type GrowthHttpCsrfPolicy =
  "not_applicable" | "required_for_session_mutation";

export interface GrowthHttpRouteContract {
  readonly operationId: string;
  readonly method: GrowthHttpMethod;
  readonly path: string;
  readonly auth: GrowthHttpAuthPolicy;
  readonly scope: GrowthHttpScopePolicy;
  readonly csrf: GrowthHttpCsrfPolicy;
  readonly idempotencyRequired: boolean;
  readonly capability: string | null;
  readonly rateLimitBucket: string;
  readonly runtimeMounted: false;
}

export const GROWTH_HTTP_ROUTES = [
  {
    operationId: "growth.acquisition.resolve",
    method: "POST",
    path: "/v1/growth/acquisition/resolve",
    auth: "anonymous",
    scope: "destination",
    csrf: "not_applicable",
    idempotencyRequired: true,
    capability: null,
    rateLimitBucket: "growth-public-acquisition",
    runtimeMounted: false,
  },
  {
    operationId: "growth.journeys.create",
    method: "POST",
    path: "/v1/growth/journeys",
    auth: "optional_subject",
    scope: "destination",
    csrf: "required_for_session_mutation",
    idempotencyRequired: true,
    capability: "growth.write",
    rateLimitBucket: "growth-subject-write",
    runtimeMounted: false,
  },
  {
    operationId: "growth.journeys.read",
    method: "GET",
    path: "/v1/growth/journeys/:journeyId",
    auth: "authenticated_subject",
    scope: "destination",
    csrf: "not_applicable",
    idempotencyRequired: false,
    capability: "growth.read",
    rateLimitBucket: "growth-subject-read",
    runtimeMounted: false,
  },
  {
    operationId: "growth.engagement.profile",
    method: "GET",
    path: "/v1/growth/engagement/profile",
    auth: "authenticated_subject",
    scope: "destination",
    csrf: "not_applicable",
    idempotencyRequired: false,
    capability: "growth.read",
    rateLimitBucket: "growth-subject-read",
    runtimeMounted: false,
  },
  {
    operationId: "growth.missions.list",
    method: "GET",
    path: "/v1/growth/missions",
    auth: "optional_subject",
    scope: "destination",
    csrf: "not_applicable",
    idempotencyRequired: false,
    capability: null,
    rateLimitBucket: "growth-public-read",
    runtimeMounted: false,
  },
  {
    operationId: "growth.rewards.list",
    method: "GET",
    path: "/v1/growth/rewards",
    auth: "authenticated_subject",
    scope: "destination",
    csrf: "not_applicable",
    idempotencyRequired: false,
    capability: "growth.read",
    rateLimitBucket: "growth-subject-read",
    runtimeMounted: false,
  },
  {
    operationId: "growth.rewards.redeem",
    method: "POST",
    path: "/v1/growth/rewards/:entitlementId/redeem",
    auth: "authenticated_subject",
    scope: "tenant_and_destination",
    csrf: "required_for_session_mutation",
    idempotencyRequired: true,
    capability: "growth.write",
    rateLimitBucket: "growth-value-write",
    runtimeMounted: false,
  },
  {
    operationId: "growth.risk.decision",
    method: "POST",
    path: "/v1/growth/risk/decision",
    auth: "control_plane",
    scope: "control_plane_destination",
    csrf: "not_applicable",
    idempotencyRequired: true,
    capability: "growth.control.write",
    rateLimitBucket: "growth-control-write",
    runtimeMounted: false,
  },
  {
    operationId: "growth.experiments.assignment",
    method: "POST",
    path: "/v1/growth/experiments/assignment",
    auth: "authenticated_subject",
    scope: "destination",
    csrf: "required_for_session_mutation",
    idempotencyRequired: true,
    capability: "growth.write",
    rateLimitBucket: "growth-subject-write",
    runtimeMounted: false,
  },
  {
    operationId: "growth.control.read-models",
    method: "GET",
    path: "/v1/growth/control/read-models",
    auth: "control_plane",
    scope: "control_plane_destination",
    csrf: "not_applicable",
    idempotencyRequired: false,
    capability: "growth.control.read",
    rateLimitBucket: "growth-control-read",
    runtimeMounted: false,
  },
] as const satisfies readonly GrowthHttpRouteContract[];

export function validateGrowthHttpRoutes(
  routes: readonly GrowthHttpRouteContract[],
): readonly GrowthHttpRouteContract[] {
  const operations = new Set<string>();
  const methodPaths = new Set<string>();

  for (const route of routes) {
    if (!route.operationId || !route.path.startsWith("/v1/growth/")) {
      throw new Error("GROWTH_HTTP_ROUTE_IDENTITY_INVALID");
    }
    if (!route.rateLimitBucket) {
      throw new Error("GROWTH_HTTP_RATE_LIMIT_BUCKET_REQUIRED");
    }
    if (route.runtimeMounted !== false) {
      throw new Error("GROWTH_HTTP_RUNTIME_MUST_REMAIN_UNMOUNTED");
    }
    if (operations.has(route.operationId)) {
      throw new Error("GROWTH_HTTP_OPERATION_DUPLICATE");
    }

    const methodPath = [route.method, route.path].join(" ");
    if (methodPaths.has(methodPath)) {
      throw new Error("GROWTH_HTTP_METHOD_PATH_DUPLICATE");
    }

    operations.add(route.operationId);
    methodPaths.add(methodPath);
  }

  return routes;
}
