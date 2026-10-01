import {
  hasAuthCapability,
  isAuthSessionActive,
  isReadOnlyAuthRole,
  type AuthSessionIdentity,
} from "@touristic/auth";

export type CrmAuthorizationReason =
  | "allowed"
  | "authentication_required"
  | "session_expired"
  | "read_only_role"
  | "capability_denied";

export interface CrmAuthorizationDecision {
  readonly allowed: boolean;
  readonly reason: CrmAuthorizationReason;
}

export interface CrmAuthorizationOptions {
  readonly mutation?: boolean;
  readonly nowEpochSeconds?: number;
}

function decision(
  allowed: boolean,
  reason: CrmAuthorizationReason,
): CrmAuthorizationDecision {
  return Object.freeze({ allowed, reason });
}

export function authorizeCrmAccess(
  session: AuthSessionIdentity | null,
  options: CrmAuthorizationOptions = {},
): CrmAuthorizationDecision {
  if (!session) {
    return decision(false, "authentication_required");
  }

  const nowEpochSeconds =
    options.nowEpochSeconds ?? Math.floor(Date.now() / 1000);
  if (!isAuthSessionActive(session, nowEpochSeconds)) {
    return decision(false, "session_expired");
  }

  if (options.mutation && isReadOnlyAuthRole(session.role)) {
    return decision(false, "read_only_role");
  }

  const capability = options.mutation ? "crm.manage" : "crm.read";
  if (!hasAuthCapability(session.role, capability)) {
    return decision(false, "capability_denied");
  }

  return decision(true, "allowed");
}
