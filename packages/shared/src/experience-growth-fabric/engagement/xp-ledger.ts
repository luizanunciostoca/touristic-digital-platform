export type EngagementTrustClass =
  | "behavioral"
  | "session_verified"
  | "experience_verified"
  | "financial_authoritative";

export interface XpLedgerEntry {
  readonly entryId: string;
  readonly subjectId: string;
  readonly journeyId: string;
  readonly destinationId: string;
  readonly amountSigned: number;
  readonly reasonCode: string;
  readonly sourceEventId: string;
  readonly evidenceReference: string;
  readonly idempotencyKey: string;
  readonly policyVersion: string;
  readonly trustClass: EngagementTrustClass;
  readonly occurredAt: string;
}

export interface XpLedgerState {
  readonly entries: readonly XpLedgerEntry[];
  readonly byIdempotencyKey: ReadonlyMap<string, XpLedgerEntry>;
}

export type AppendXpResult =
  | Readonly<{ kind: "appended"; entry: XpLedgerEntry; event: "XpGranted" }>
  | Readonly<{ kind: "replayed"; entry: XpLedgerEntry }>
  | Readonly<{ kind: "rejected"; code: string }>;

const UTC_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

function isValidUtc(value: string): boolean {
  return UTC_TIMESTAMP.test(value) && Number.isFinite(Date.parse(value));
}

function sameSemanticEntry(left: XpLedgerEntry, right: XpLedgerEntry): boolean {
  return (
    left.subjectId === right.subjectId &&
    left.journeyId === right.journeyId &&
    left.destinationId === right.destinationId &&
    left.amountSigned === right.amountSigned &&
    left.reasonCode === right.reasonCode &&
    left.sourceEventId === right.sourceEventId &&
    left.evidenceReference === right.evidenceReference &&
    left.policyVersion === right.policyVersion &&
    left.trustClass === right.trustClass
  );
}

export function createEmptyXpLedgerState(): XpLedgerState {
  return {
    entries: [],
    byIdempotencyKey: new Map(),
  };
}

export function appendXpEntry(
  state: XpLedgerState,
  entry: XpLedgerEntry,
): AppendXpResult {
  if (!entry.entryId || !entry.subjectId || !entry.journeyId) {
    return { kind: "rejected", code: "XP_IDENTITY_INVALID" };
  }
  if (!entry.destinationId || !entry.reasonCode || !entry.sourceEventId) {
    return { kind: "rejected", code: "XP_SCOPE_INVALID" };
  }
  if (!entry.evidenceReference || !entry.idempotencyKey) {
    return { kind: "rejected", code: "XP_EVIDENCE_INVALID" };
  }
  if (!entry.policyVersion) {
    return { kind: "rejected", code: "XP_POLICY_VERSION_REQUIRED" };
  }
  if (!Number.isSafeInteger(entry.amountSigned) || entry.amountSigned === 0) {
    return { kind: "rejected", code: "XP_AMOUNT_INVALID" };
  }
  if (!isValidUtc(entry.occurredAt)) {
    return { kind: "rejected", code: "XP_OCCURRED_AT_INVALID" };
  }

  const existing = state.byIdempotencyKey.get(entry.idempotencyKey);
  if (existing) {
    if (!sameSemanticEntry(existing, entry)) {
      return { kind: "rejected", code: "XP_IDEMPOTENCY_CONFLICT" };
    }
    return { kind: "replayed", entry: existing };
  }

  return { kind: "appended", entry, event: "XpGranted" };
}

export function reduceXpLedger(
  state: XpLedgerState,
  result: AppendXpResult,
): XpLedgerState {
  if (result.kind !== "appended") return state;

  const byIdempotencyKey = new Map(state.byIdempotencyKey);
  byIdempotencyKey.set(result.entry.idempotencyKey, result.entry);
  return {
    entries: [...state.entries, result.entry],
    byIdempotencyKey,
  };
}

export function calculateXpBalance(
  entries: readonly XpLedgerEntry[],
  subjectId: string,
  destinationId: string,
): number {
  return entries
    .filter(
      (entry) =>
        entry.subjectId === subjectId &&
        entry.destinationId === destinationId,
    )
    .reduce((total, entry) => total + entry.amountSigned, 0);
}

export function createCompensatingXpEntry(
  original: XpLedgerEntry,
  input: Readonly<{
    entryId: string;
    sourceEventId: string;
    evidenceReference: string;
    idempotencyKey: string;
    occurredAt: string;
    reasonCode: string;
  }>,
): XpLedgerEntry {
  return Object.freeze({
    ...original,
    entryId: input.entryId,
    amountSigned: -original.amountSigned,
    reasonCode: input.reasonCode,
    sourceEventId: input.sourceEventId,
    evidenceReference: input.evidenceReference,
    idempotencyKey: input.idempotencyKey,
    occurredAt: input.occurredAt,
  });
}
