export const legacyAuthRoles = Object.freeze([
  "owner",
  "manager",
  "viewer",
  "admin",
] as const);

/**
 * Backward-compatible V1 role vocabulary. Keep this export stable while
 * canonical platform roles are introduced through canonicalAuthRoles.
 */
export const authRoles = legacyAuthRoles;

export const canonicalAuthRoles = Object.freeze([
  "PLATFORM_OWNER",
  "PLATFORM_ADMIN",
  "SUPPORT",
  "AUDITOR",
  "BUSINESS_OWNER",
  "BUSINESS_MANAGER",
  "BUSINESS_VIEWER",
  "AFFILIATE",
] as const);

export const allAuthRoles = Object.freeze([
  ...legacyAuthRoles,
  ...canonicalAuthRoles,
] as const);

export type LegacyAuthRole = (typeof legacyAuthRoles)[number];
export type CanonicalAuthRole = (typeof canonicalAuthRoles)[number];
export type AuthRole = LegacyAuthRole | CanonicalAuthRole;

export const authCapabilities = Object.freeze([
  "platform.read",
  "platform.manage",
  "business.read",
  "business.create",
  "business.update",
  "business.suspend",
  "business.delete",
  "affiliate.read",
  "affiliate.create",
  "affiliate.update",
  "affiliate.suspend",
  "affiliate.commission.manage",
  "crm.read",
  "crm.manage",
  "users.read",
  "users.manage",
  "users.sessions.revoke",
  "ticketing.read",
  "ticketing.manage",
  "financial.read",
  "financial.refund",
  "financial.reconcile",
  "content.read",
  "content.manage",
  "support.impersonate",
  "audit.read",
  "system.read",
  "system.manage",
] as const);

export type AuthCapability = (typeof authCapabilities)[number];

const allCapabilities = Object.freeze([...authCapabilities]);

const canonicalRoleCapabilities: Readonly<
  Record<CanonicalAuthRole, readonly AuthCapability[]>
> = Object.freeze({
  PLATFORM_OWNER: allCapabilities,
  PLATFORM_ADMIN: Object.freeze(
    allCapabilities.filter(
      (capability) =>
        capability !== "platform.manage" && capability !== "system.manage",
    ),
  ),
  SUPPORT: Object.freeze([
    "platform.read",
    "business.read",
    "affiliate.read",
    "crm.read",
    "users.read",
    "users.sessions.revoke",
    "ticketing.read",
    "financial.read",
    "content.read",
    "support.impersonate",
    "audit.read",
    "system.read",
  ]),
  AUDITOR: Object.freeze([
    "platform.read",
    "business.read",
    "affiliate.read",
    "crm.read",
    "users.read",
    "ticketing.read",
    "financial.read",
    "content.read",
    "audit.read",
    "system.read",
  ]),
  BUSINESS_OWNER: Object.freeze([
    "business.read",
    "business.update",
    "crm.read",
    "crm.manage",
    "ticketing.read",
    "ticketing.manage",
    "financial.read",
    "content.read",
    "content.manage",
  ]),
  BUSINESS_MANAGER: Object.freeze([
    "business.read",
    "business.update",
    "crm.read",
    "crm.manage",
    "ticketing.read",
    "ticketing.manage",
    "financial.read",
    "content.read",
  ]),
  BUSINESS_VIEWER: Object.freeze([
    "business.read",
    "crm.read",
    "ticketing.read",
    "financial.read",
    "content.read",
  ]),
  AFFILIATE: Object.freeze(["affiliate.read", "affiliate.update"]),
});

const legacyCanonicalMapping: Readonly<
  Record<LegacyAuthRole, CanonicalAuthRole>
> = Object.freeze({
  admin: "PLATFORM_ADMIN",
  owner: "BUSINESS_OWNER",
  manager: "BUSINESS_MANAGER",
  viewer: "BUSINESS_VIEWER",
});

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

export type CapabilityAuthorizationReason =
  | AuthAuthorizationReason
  | "capability_denied";

export interface CapabilityAuthorizationDecision {
  readonly allowed: boolean;
  readonly reason: CapabilityAuthorizationReason;
  readonly capability: AuthCapability;
  readonly businessId: string | null;
}

export interface BusinessAuthorizationOptions {
  readonly mutation?: boolean;
  readonly nowEpochSeconds?: number;
}

export interface CapabilityAuthorizationOptions
  extends BusinessAuthorizationOptions {
  readonly businessId?: unknown;
}

const BUSINESS_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{1,79}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function stripControlCharacters(value: string): string {
  return Array.from(value, (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127 ? " " : character;
  }).join("");
}

function safeString(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return stripControlCharacters(value)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function normalizeAuthEmail(value: unknown): string | null {
  const email = safeString(value, 160).toLowerCase();
  return EMAIL_PATTERN.test(email) ? email : null;
}

export function isAuthRole(value: unknown): value is AuthRole {
  return (
    typeof value === "string" &&
    allAuthRoles.includes(value as (typeof allAuthRoles)[number])
  );
}

export function isAuthCapability(value: unknown): value is AuthCapability {
  return (
    typeof value === "string" &&
    authCapabilities.includes(value as AuthCapability)
  );
}

export function canonicalAuthRole(role: AuthRole): CanonicalAuthRole {
  return (legacyCanonicalMapping as Partial<Record<AuthRole, CanonicalAuthRole>>)[
    role
  ] ?? (role as CanonicalAuthRole);
}

export function capabilitiesForRole(
  role: AuthRole,
): readonly AuthCapability[] {
  return canonicalRoleCapabilities[canonicalAuthRole(role)];
}

export function hasAuthCapability(
  role: AuthRole,
  capability: AuthCapability,
): boolean {
  return capabilitiesForRole(role).includes(capability);
}

export function isPlatformWideAuthRole(role: AuthRole): boolean {
  const canonical = canonicalAuthRole(role);
  return (
    canonical === "PLATFORM_OWNER" ||
    canonical === "PLATFORM_ADMIN" ||
    canonical === "SUPPORT" ||
    canonical === "AUDITOR"
  );
}

export function requiresBusinessScope(role: AuthRole): boolean {
  const canonical = canonicalAuthRole(role);
  return (
    canonical === "BUSINESS_OWNER" ||
    canonical === "BUSINESS_MANAGER" ||
    canonical === "BUSINESS_VIEWER"
  );
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
    (requiresBusinessScope(role) && businessIds.length === 0)
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
  return (
    Number.isFinite(nowEpochSeconds) && session.expiresAt > nowEpochSeconds
  );
}

export function isReadOnlyAuthRole(role: AuthRole): boolean {
  const canonical = canonicalAuthRole(role);
  return (
    canonical === "BUSINESS_VIEWER" ||
    canonical === "SUPPORT" ||
    canonical === "AUDITOR"
  );
}

export function hasBusinessScope(
  session: AuthSessionIdentity,
  businessId: unknown,
): boolean {
  const normalizedBusinessId = normalizeBusinessId(businessId);
  if (!normalizedBusinessId) return false;
  return (
    isPlatformWideAuthRole(session.role) ||
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

export function authorizeCapability(
  session: AuthSessionIdentity | null,
  capability: AuthCapability,
  options: CapabilityAuthorizationOptions = {},
): CapabilityAuthorizationDecision {
  if (!session) {
    return Object.freeze({
      allowed: false,
      reason: "authentication_required",
      capability,
      businessId: null,
    });
  }

  const nowEpochSeconds =
    options.nowEpochSeconds ?? Math.floor(Date.now() / 1000);
  if (!isAuthSessionActive(session, nowEpochSeconds)) {
    return Object.freeze({
      allowed: false,
      reason: "session_expired",
      capability,
      businessId: null,
    });
  }

  if (!hasAuthCapability(session.role, capability)) {
    return Object.freeze({
      allowed: false,
      reason: "capability_denied",
      capability,
      businessId: null,
    });
  }

  const hasBusinessInput = options.businessId !== undefined;
  const businessId = hasBusinessInput
    ? normalizeBusinessId(options.businessId)
    : null;
  if (hasBusinessInput && !businessId) {
    return Object.freeze({
      allowed: false,
      reason: "invalid_business_id",
      capability,
      businessId: null,
    });
  }
  if (businessId && !hasBusinessScope(session, businessId)) {
    return Object.freeze({
      allowed: false,
      reason: "business_access_denied",
      capability,
      businessId,
    });
  }
  if (options.mutation && isReadOnlyAuthRole(session.role)) {
    return Object.freeze({
      allowed: false,
      reason: "read_only_role",
      capability,
      businessId,
    });
  }

  return Object.freeze({
    allowed: true,
    reason: "allowed",
    capability,
    businessId,
  });
}
