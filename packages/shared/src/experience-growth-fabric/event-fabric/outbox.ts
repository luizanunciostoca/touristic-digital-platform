export type OutboxStatus =
  "pending" | "dispatching" | "delivered" | "dead_letter";

export interface OutboxEventRecord {
  readonly eventId: string;
  readonly eventType: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly contractVersion: number;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly correlationId: string;
  readonly causationId: string | null;
  readonly status: OutboxStatus;
  readonly attempts: number;
  readonly availableAt: string;
  readonly leasedBy: string | null;
  readonly leaseExpiresAt: string | null;
  readonly deliveredAt: string | null;
  readonly lastErrorCode: string | null;
}

export interface OutboxRetryPolicy {
  readonly maximumAttempts: number;
  readonly baseDelaySeconds: number;
  readonly maximumDelaySeconds: number;
  readonly leaseSeconds: number;
}

export interface ConsumerClaim {
  readonly consumerName: string;
  readonly eventId: string;
  readonly semanticDigest: string;
  readonly claimedAt: string;
}

export type ConsumerClaimDecision =
  | Readonly<{ kind: "claimed"; claim: ConsumerClaim }>
  | Readonly<{ kind: "replayed"; claim: ConsumerClaim }>
  | Readonly<{ kind: "conflict"; claim: ConsumerClaim }>;

const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const SHA_256 = /^[a-f0-9]{64}$/;

function isUtc(value: string): boolean {
  return UTC_TIMESTAMP.test(value) && Number.isFinite(Date.parse(value));
}

function addSeconds(value: string, seconds: number): string {
  if (!isUtc(value)) throw new Error("OUTBOX_TIMESTAMP_INVALID");
  return new Date(Date.parse(value) + seconds * 1000).toISOString();
}

export function validateOutboxRetryPolicy(
  policy: OutboxRetryPolicy,
): OutboxRetryPolicy {
  const values = [
    policy.maximumAttempts,
    policy.baseDelaySeconds,
    policy.maximumDelaySeconds,
    policy.leaseSeconds,
  ];
  if (!values.every((value) => Number.isSafeInteger(value) && value > 0)) {
    throw new Error("OUTBOX_RETRY_POLICY_INVALID");
  }
  if (policy.maximumDelaySeconds < policy.baseDelaySeconds) {
    throw new Error("OUTBOX_RETRY_POLICY_DELAY_INVALID");
  }
  return policy;
}

export function createOutboxEvent(
  input: Omit<
    OutboxEventRecord,
    | "status"
    | "attempts"
    | "leasedBy"
    | "leaseExpiresAt"
    | "deliveredAt"
    | "lastErrorCode"
  >,
): OutboxEventRecord {
  if (
    !input.eventId ||
    !input.eventType ||
    !input.aggregateType ||
    !input.aggregateId ||
    !input.correlationId
  ) {
    throw new Error("OUTBOX_EVENT_IDENTITY_INVALID");
  }
  if (
    !Number.isSafeInteger(input.contractVersion) ||
    input.contractVersion < 1
  ) {
    throw new Error("OUTBOX_CONTRACT_VERSION_INVALID");
  }
  if (!isUtc(input.availableAt)) {
    throw new Error("OUTBOX_AVAILABLE_AT_INVALID");
  }

  return Object.freeze({
    ...input,
    status: "pending",
    attempts: 0,
    leasedBy: null,
    leaseExpiresAt: null,
    deliveredAt: null,
    lastErrorCode: null,
  });
}

export function claimOutboxEvent(
  record: OutboxEventRecord,
  input: Readonly<{
    workerId: string;
    occurredAt: string;
    policy: OutboxRetryPolicy;
  }>,
): OutboxEventRecord | null {
  validateOutboxRetryPolicy(input.policy);
  if (!input.workerId || !isUtc(input.occurredAt)) {
    throw new Error("OUTBOX_CLAIM_INPUT_INVALID");
  }
  if (record.status === "delivered" || record.status === "dead_letter") {
    return null;
  }

  const now = Date.parse(input.occurredAt);
  if (Date.parse(record.availableAt) > now) return null;

  if (
    record.status === "dispatching" &&
    record.leaseExpiresAt &&
    Date.parse(record.leaseExpiresAt) > now
  ) {
    return null;
  }

  return Object.freeze({
    ...record,
    status: "dispatching",
    leasedBy: input.workerId,
    leaseExpiresAt: addSeconds(input.occurredAt, input.policy.leaseSeconds),
  });
}

export function markOutboxDelivered(
  record: OutboxEventRecord,
  workerId: string,
  deliveredAt: string,
): OutboxEventRecord {
  if (record.status === "delivered") return record;
  if (
    record.status !== "dispatching" ||
    record.leasedBy !== workerId ||
    !isUtc(deliveredAt)
  ) {
    throw new Error("OUTBOX_DELIVERY_OWNERSHIP_INVALID");
  }

  return Object.freeze({
    ...record,
    status: "delivered",
    deliveredAt,
    leasedBy: null,
    leaseExpiresAt: null,
    lastErrorCode: null,
  });
}

export function markOutboxFailure(
  record: OutboxEventRecord,
  input: Readonly<{
    workerId: string;
    occurredAt: string;
    errorCode: string;
    policy: OutboxRetryPolicy;
  }>,
): OutboxEventRecord {
  validateOutboxRetryPolicy(input.policy);
  if (
    record.status !== "dispatching" ||
    record.leasedBy !== input.workerId ||
    !input.errorCode ||
    !isUtc(input.occurredAt)
  ) {
    throw new Error("OUTBOX_FAILURE_OWNERSHIP_INVALID");
  }

  const attempts = record.attempts + 1;
  if (attempts >= input.policy.maximumAttempts) {
    return Object.freeze({
      ...record,
      status: "dead_letter",
      attempts,
      leasedBy: null,
      leaseExpiresAt: null,
      lastErrorCode: input.errorCode,
    });
  }

  const exponential =
    input.policy.baseDelaySeconds * 2 ** Math.max(0, attempts - 1);
  const delaySeconds = Math.min(exponential, input.policy.maximumDelaySeconds);

  return Object.freeze({
    ...record,
    status: "pending",
    attempts,
    availableAt: addSeconds(input.occurredAt, delaySeconds),
    leasedBy: null,
    leaseExpiresAt: null,
    lastErrorCode: input.errorCode,
  });
}

export function claimConsumerEvent(
  input: Readonly<{
    consumerName: string;
    eventId: string;
    semanticDigest: string;
    claimedAt: string;
  }>,
  existing: ConsumerClaim | null,
): ConsumerClaimDecision {
  if (
    !input.consumerName ||
    !input.eventId ||
    !SHA_256.test(input.semanticDigest) ||
    !isUtc(input.claimedAt)
  ) {
    throw new Error("CONSUMER_CLAIM_INPUT_INVALID");
  }

  if (existing) {
    if (
      existing.consumerName === input.consumerName &&
      existing.eventId === input.eventId &&
      existing.semanticDigest === input.semanticDigest
    ) {
      return { kind: "replayed", claim: existing };
    }
    return { kind: "conflict", claim: existing };
  }

  return {
    kind: "claimed",
    claim: Object.freeze({ ...input }),
  };
}
