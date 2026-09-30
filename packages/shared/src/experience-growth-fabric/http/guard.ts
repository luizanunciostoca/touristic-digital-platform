import type { GrowthHttpRouteContract } from "./contracts.js";

export type GrowthCredentialKind =
  | "none"
  | "anonymous_subject"
  | "authenticated_session"
  | "service_identity";

export interface GrowthRequestContext {
  readonly credentialKind: GrowthCredentialKind;
  readonly subjectId: string | null;
  readonly requestDestinationId: string;
  readonly credentialDestinationIds: ReadonlySet<string>;
  readonly requestTenantId: string | null;
  readonly credentialTenantIds: ReadonlySet<string>;
  readonly capabilities: ReadonlySet<string>;
  readonly sessionCookiePresent: boolean;
  readonly csrfTokenPresent: boolean;
  readonly csrfTokenMatchesSession: boolean;
  readonly idempotencyKey: string | null;
  readonly requestCountInWindow: number;
  readonly rateLimitMaximum: number;
}

export type GrowthRequestGuardDecision =
  | Readonly<{ allowed: true; code: "ALLOWED" }>
  | Readonly<{ allowed: false; code: string }>;

function authenticationFailure(
  route: GrowthHttpRouteContract,
  context: GrowthRequestContext,
): string | null {
  if (route.auth === "anonymous" || route.auth === "optional_subject") {
    return null;
  }
  if (
    route.auth === "authenticated_subject" &&
    context.credentialKind !== "authenticated_session"
  ) {
    return "AUTHENTICATED_SUBJECT_REQUIRED";
  }
  if (
    route.auth === "control_plane" &&
    context.credentialKind !== "service_identity"
  ) {
    return "CONTROL_PLANE_IDENTITY_REQUIRED";
  }
  return null;
}

function scopeFailure(
  route: GrowthHttpRouteContract,
  context: GrowthRequestContext,
): string | null {
  if (!context.requestDestinationId) {
    return "DESTINATION_SCOPE_REQUIRED";
  }

  if (
    context.credentialKind !== "none" &&
    context.credentialDestinationIds.size > 0 &&
    !context.credentialDestinationIds.has(context.requestDestinationId)
  ) {
    return "DESTINATION_SCOPE_DENIED";
  }

  if (route.scope === "tenant_and_destination") {
    if (!context.requestTenantId) return "TENANT_SCOPE_REQUIRED";
    if (!context.credentialTenantIds.has(context.requestTenantId)) {
      return "TENANT_SCOPE_DENIED";
    }
  }

  return null;
}

export function evaluateGrowthRequestGuard(
  route: GrowthHttpRouteContract,
  context: GrowthRequestContext,
): GrowthRequestGuardDecision {
  const authFailure = authenticationFailure(route, context);
  if (authFailure) return { allowed: false, code: authFailure };

  const scope = scopeFailure(route, context);
  if (scope) return { allowed: false, code: scope };

  if (
    route.capability &&
    !context.capabilities.has(route.capability)
  ) {
    return { allowed: false, code: "CAPABILITY_DENIED" };
  }

  if (
    route.csrf === "required_for_session_mutation" &&
    context.sessionCookiePresent &&
    (!context.csrfTokenPresent || !context.csrfTokenMatchesSession)
  ) {
    return { allowed: false, code: "CSRF_INVALID" };
  }

  if (route.idempotencyRequired && !context.idempotencyKey) {
    return { allowed: false, code: "IDEMPOTENCY_KEY_REQUIRED" };
  }

  if (
    !Number.isSafeInteger(context.requestCountInWindow) ||
    !Number.isSafeInteger(context.rateLimitMaximum) ||
    context.rateLimitMaximum < 1
  ) {
    return { allowed: false, code: "RATE_LIMIT_POLICY_INVALID" };
  }

  if (context.requestCountInWindow >= context.rateLimitMaximum) {
    return { allowed: false, code: "RATE_LIMIT_EXCEEDED" };
  }

  return { allowed: true, code: "ALLOWED" };
}
