export const authRoles = Object.freeze([
  "owner",
  "manager",
  "viewer",
  "admin",
] as const);

export type AuthRole = (typeof authRoles)[number];

export interface AuthSessionIdentity {
  readonly subject: string;
  readonly email: string;
  readonly role: AuthRole;
  readonly businessIds: readonly string[];
  readonly issuedAt: number;
  readonly expiresAt: number;
  readonly sessionId: string;
}

export interface AuthSessionIdentityInput {
  readonly subject: unknown;
  readonly email: unknown;
  readonly role: unknown;
  readonly businessIds?: unknown;
  readonly issuedAt: unknown;
  readonly expiresAt: unknown;
  readonly sessionId: unknown;
}

export type AuthAuthorizationReason =
  | "allowed"
  | "authentication_required"
  | "session_expired"
  | "invalid_business_id"
  | "business_access_denied"
  | "read_only_role";

export interface AuthAuthorizationDecision {
  readonly allowed: boolean;
  readonly reason: AuthAuthorizationReason;
  readonly businessId: string | null;
}

export interface BusinessAuthorizationOptions {
  readonly mutation?: boolean;
  readonly nowEpochSeconds?: number;
}

const BUSINESS_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{1,79}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function safeString(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function normalizeAuthEmail(value: unknown): string | null {
  const email = safeString(value, 160).toLowerCase();
  return EMAIL_PATTERN.test(email) ? email : null;
}

export function isAuthRole(value: unknown): value is AuthRole {
  return typeof value === "string" && authRoles.includes(value as AuthRole);
}

export function normalizeBusinessId(value: unknown): string | null {
  const businessId = safeString(value, 80).toLowerCase();
  return BUSINESS_ID_PATTERN.test(businessId) ? businessId : null;
}

export function normalizeBusinessScopes(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return Object.freeze([]);

  const normalized = value.flatMap((entry) => {
    const businessId = normalizeBusinessId(entry);
    return businessId ? [businessId] : [];
  });

  return Object.freeze([...new Set(normalized)]);
}

function finiteEpochSecond(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const normalized = Math.floor(value);
  return normalized >= 0 ? normalized : null;
}

export function normalizeAuthSessionIdentity(
  input: AuthSessionIdentityInput,
): AuthSessionIdentity | null {
  const subject = safeString(input.subject, 100);
  const email = normalizeAuthEmail(input.email);
  const role = isAuthRole(input.role) ? input.role : null;
  const issuedAt = finiteEpochSecond(input.issuedAt);
  const expiresAt = finiteEpochSecond(input.expiresAt);
  const sessionId = safeString(input.sessionId, 200);
  const businessIds = normalizeBusinessScopes(input.businessIds);

  if (
    !subject ||
    !email ||
    !role ||
    issuedAt === null ||
    expiresAt === null ||
    expiresAt <= issuedAt ||
    !sessionId ||
    (role !== "admin" && businessIds.length === 0)
  ) {
    return null;
  }

  return Object.freeze({
    subject,
    email,
    role,
    businessIds,
    issuedAt,
    expiresAt,
    sessionId,
  });
}

export function isAuthSessionActive(
  session: AuthSessionIdentity,
  nowEpochSeconds = Math.floor(Date.now() / 1000),
): boolean {
  return Number.isFinite(nowEpochSeconds) && session.expiresAt > nowEpochSeconds;
}

export function isReadOnlyAuthRole(role: AuthRole): boolean {
  return role === "viewer";
}

export function hasBusinessScope(
  session: AuthSessionIdentity,
  businessId: unknown,
): boolean {
  const normalizedBusinessId = normalizeBusinessId(businessId);
  if (!normalizedBusinessId) return false;
  return (
    session.role === "admin" ||
    session.businessIds.includes(normalizedBusinessId)
  );
}

function decision(
  allowed: boolean,
  reason: AuthAuthorizationReason,
  businessId: string | null,
): AuthAuthorizationDecision {
  return Object.freeze({ allowed, reason, businessId });
}

export function authorizeBusinessAccess(
  session: AuthSessionIdentity | null,
  businessId: unknown,
  options: BusinessAuthorizationOptions = {},
): AuthAuthorizationDecision {
  if (!session) {
    return decision(false, "authentication_required", null);
  }

  const nowEpochSeconds =
    options.nowEpochSeconds ?? Math.floor(Date.now() / 1000);
  if (!isAuthSessionActive(session, nowEpochSeconds)) {
    return decision(false, "session_expired", null);
  }

  const normalizedBusinessId = normalizeBusinessId(businessId);
  if (!normalizedBusinessId) {
    return decision(false, "invalid_business_id", null);
  }

  if (!hasBusinessScope(session, normalizedBusinessId)) {
    return decision(false, "business_access_denied", normalizedBusinessId);
  }

  if (options.mutation && isReadOnlyAuthRole(session.role)) {
    return decision(false, "read_only_role", normalizedBusinessId);
  }

  return decision(true, "allowed", normalizedBusinessId);
}
