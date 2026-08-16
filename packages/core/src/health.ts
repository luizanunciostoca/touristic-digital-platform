export type PlatformHealthCheckStatus = "pass" | "warn" | "fail";
export type PlatformHealthStatus = "healthy" | "degraded" | "unhealthy";
export type PlatformReadinessStatus = "ready" | "not_ready";

export interface PlatformHealthCheckInput {
  readonly name: string;
  readonly status: PlatformHealthCheckStatus;
  readonly critical: boolean;
  readonly detail?: string;
}

export type PlatformHealthCheck = Readonly<PlatformHealthCheckInput>;

export interface PlatformHealthSnapshot {
  readonly contractVersion: 1;
  readonly service: string;
  readonly status: PlatformHealthStatus;
  readonly readiness: PlatformReadinessStatus;
  readonly checkedAt: string;
  readonly destinationId: string;
  readonly tenantId?: string;
  readonly correlationId: string;
  readonly checks: readonly PlatformHealthCheck[];
}

export interface PlatformHealthSnapshotInput {
  readonly service: string;
  readonly checkedAt?: string;
  readonly destinationId: string;
  readonly tenantId?: string;
  readonly correlationId?: string;
  readonly checks: readonly PlatformHealthCheckInput[];
}

export interface PlatformHealthRuntimeOptions {
  readonly createCorrelationId?: () => string;
  readonly now?: () => string;
}

const MAX_CONTEXT_LENGTH = 160;
const MAX_DETAIL_LENGTH = 500;
const MAX_CHECKS = 50;
const HEALTH_CHECK_STATUSES = new Set<PlatformHealthCheckStatus>([
  "pass",
  "warn",
  "fail",
]);

function requireBoundedString(
  value: string | undefined,
  field: string,
  maxLength = MAX_CONTEXT_LENGTH,
): string {
  if (typeof value !== "string") throw new Error(`${field} is required.`);
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} is required.`);
  if (normalized.length > maxLength) {
    throw new Error(`${field} exceeds ${maxLength} characters.`);
  }
  return normalized;
}

function requireIsoTimestamp(value: string, field: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new Error(`${field} must be ISO-8601.`);
  }
  return value;
}

function createSecureCorrelationId(): string {
  if (typeof globalThis.crypto?.randomUUID !== "function") {
    throw new Error(
      "Secure randomUUID support is required for platform health contracts.",
    );
  }
  return `corr_${globalThis.crypto.randomUUID()}`;
}

function normalizeCheck(input: PlatformHealthCheckInput): PlatformHealthCheck {
  if (!HEALTH_CHECK_STATUSES.has(input.status)) {
    throw new Error(
      `Health check ${input.name || "unknown"} has invalid status.`,
    );
  }
  if (typeof input.critical !== "boolean") {
    throw new Error(
      `Health check ${input.name || "unknown"} critical is required.`,
    );
  }

  const name = requireBoundedString(input.name, "Health check name");
  const detail = input.detail
    ? requireBoundedString(
        input.detail,
        "Health check detail",
        MAX_DETAIL_LENGTH,
      )
    : undefined;

  return Object.freeze({
    name,
    status: input.status,
    critical: input.critical,
    ...(detail ? { detail } : {}),
  });
}

export function createPlatformHealthSnapshot(
  input: PlatformHealthSnapshotInput,
  options: PlatformHealthRuntimeOptions = {},
): PlatformHealthSnapshot {
  const rawChecks: unknown = input.checks;
  if (!Array.isArray(rawChecks) || rawChecks.length === 0) {
    throw new Error("Platform health requires at least one check.");
  }
  if (input.checks.length > MAX_CHECKS) {
    throw new Error(`Platform health supports at most ${MAX_CHECKS} checks.`);
  }

  const checks = Object.freeze(
    input.checks.map((check) => normalizeCheck(check)),
  );
  const names = checks.map((check) => check.name);
  if (new Set(names).size !== names.length) {
    throw new Error("Platform health check names must be unique.");
  }

  const hasCriticalFailure = checks.some(
    (check) => check.critical && check.status === "fail",
  );
  const hasDegradation = checks.some((check) => check.status !== "pass");
  const status: PlatformHealthStatus = hasCriticalFailure
    ? "unhealthy"
    : hasDegradation
      ? "degraded"
      : "healthy";
  const readiness: PlatformReadinessStatus = hasCriticalFailure
    ? "not_ready"
    : "ready";
  const now = options.now ?? (() => new Date().toISOString());
  const createCorrelationId =
    options.createCorrelationId ?? createSecureCorrelationId;

  return Object.freeze({
    contractVersion: 1,
    service: requireBoundedString(input.service, "Health service"),
    status,
    readiness,
    checkedAt: requireIsoTimestamp(
      input.checkedAt ?? now(),
      "Health checkedAt",
    ),
    destinationId: requireBoundedString(
      input.destinationId,
      "Health destinationId",
    ),
    ...(input.tenantId
      ? {
          tenantId: requireBoundedString(input.tenantId, "Health tenantId"),
        }
      : {}),
    correlationId: requireBoundedString(
      input.correlationId ?? createCorrelationId(),
      "Health correlationId",
    ),
    checks,
  });
}
