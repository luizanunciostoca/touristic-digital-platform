export type PrivacyRecordClass =
  | "journey_operational"
  | "security_audit"
  | "analytics_projection";

export interface PrivacyRetentionPolicy {
  readonly version: string;
  readonly maximumDays: Readonly<Record<PrivacyRecordClass, number>>;
}

export interface LocationEvidenceInput {
  readonly destinationId: string;
  readonly placeId: string;
  readonly proofDigest: string;
  readonly occurredAt: string;
  readonly rawLatitude?: number;
  readonly rawLongitude?: number;
  readonly accuracyMeters?: number;
}

export interface MinimizedLocationEvidence {
  readonly destinationId: string;
  readonly placeId: string;
  readonly proofDigest: string;
  readonly occurredAt: string;
  readonly locationGranularity: "place";
}

export interface PseudonymousAnalyticsSubject {
  readonly subjectDigest: string;
  readonly source: "server_pseudonym";
}

const SHA_256 = /^[a-f0-9]{64}$/;
const UTC_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

const FORBIDDEN_PERSISTED_KEYS = new Set([
  "email",
  "phone",
  "phoneNumber",
  "latitude",
  "longitude",
  "rawLatitude",
  "rawLongitude",
  "preciseLocation",
  "ipAddress",
]);

function isUtc(value: string): boolean {
  return UTC_TIMESTAMP.test(value) && Number.isFinite(Date.parse(value));
}

export function validatePrivacyRetentionPolicy(
  policy: PrivacyRetentionPolicy,
): PrivacyRetentionPolicy {
  if (!policy.version) throw new Error("PRIVACY_POLICY_VERSION_REQUIRED");

  for (const days of Object.values(policy.maximumDays)) {
    if (!Number.isSafeInteger(days) || days < 1) {
      throw new Error("PRIVACY_RETENTION_DAYS_INVALID");
    }
  }

  return policy;
}

export function retentionDeadline(
  occurredAt: string,
  recordClass: PrivacyRecordClass,
  policy: PrivacyRetentionPolicy,
): string {
  validatePrivacyRetentionPolicy(policy);
  if (!isUtc(occurredAt)) throw new Error("PRIVACY_TIMESTAMP_INVALID");

  const days = policy.maximumDays[recordClass];
  return new Date(Date.parse(occurredAt) + days * 86_400_000).toISOString();
}

export function isPastRetention(
  occurredAt: string,
  now: string,
  recordClass: PrivacyRecordClass,
  policy: PrivacyRetentionPolicy,
): boolean {
  if (!isUtc(now)) throw new Error("PRIVACY_NOW_INVALID");
  return (
    Date.parse(now) >=
    Date.parse(retentionDeadline(occurredAt, recordClass, policy))
  );
}

export function minimizeLocationEvidence(
  input: LocationEvidenceInput,
): MinimizedLocationEvidence {
  if (!input.destinationId || !input.placeId) {
    throw new Error("LOCATION_EVIDENCE_SCOPE_INVALID");
  }
  if (!SHA_256.test(input.proofDigest)) {
    throw new Error("LOCATION_EVIDENCE_DIGEST_INVALID");
  }
  if (!isUtc(input.occurredAt)) {
    throw new Error("LOCATION_EVIDENCE_TIME_INVALID");
  }

  return Object.freeze({
    destinationId: input.destinationId,
    placeId: input.placeId,
    proofDigest: input.proofDigest,
    occurredAt: input.occurredAt,
    locationGranularity: "place",
  });
}

export function createPseudonymousAnalyticsSubject(
  subjectDigest: string,
): PseudonymousAnalyticsSubject {
  if (!SHA_256.test(subjectDigest)) {
    throw new Error("ANALYTICS_SUBJECT_DIGEST_INVALID");
  }
  return Object.freeze({
    subjectDigest,
    source: "server_pseudonym",
  });
}

function findForbiddenKey(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findForbiddenKey(item);
      if (found) return found;
    }
    return null;
  }

  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_PERSISTED_KEYS.has(key)) return key;
    const nested = findForbiddenKey(child);
    if (nested) return nested;
  }

  return null;
}

export function assertPrivacySafeProjectionPayload(
  payload: Readonly<Record<string, unknown>>,
): void {
  const forbidden = findForbiddenKey(payload);
  if (forbidden) {
    throw new Error(`PRIVACY_FORBIDDEN_PERSISTED_KEY:${forbidden}`);
  }
}
