import { createHash } from "node:crypto";

export const GROWTH_CLASSIFICATIONS = Object.freeze([
  "CANONICALIZATION_READY",
  "READY_WITH_ADAPTER",
  "NEEDS_VERSIONED_CONTRACT",
  "NEEDS_PERSISTENCE",
  "NEEDS_AUTHORIZATION_MODEL",
  "FINANCIAL_BOUNDARY_BLOCKED",
  "EXPERIMENTAL_ONLY",
] as const);

export type GrowthClassification = (typeof GROWTH_CLASSIFICATIONS)[number];

export interface GrowthContractDecision {
  readonly id: string;
  readonly classification: GrowthClassification;
  readonly ownerApproved: false;
  readonly versionedContractApproved: false;
  readonly productionAuthority: false;
}

export const GROWTH_CONTRACT_DECISIONS = Object.freeze([
  { id: "IF-AFF-013", classification: "READY_WITH_ADAPTER", ownerApproved: false, versionedContractApproved: false, productionAuthority: false },
  { id: "IF-GRW-001", classification: "EXPERIMENTAL_ONLY", ownerApproved: false, versionedContractApproved: false, productionAuthority: false },
  { id: "IF-GRW-002", classification: "NEEDS_AUTHORIZATION_MODEL", ownerApproved: false, versionedContractApproved: false, productionAuthority: false },
  { id: "IF-GRW-003", classification: "NEEDS_VERSIONED_CONTRACT", ownerApproved: false, versionedContractApproved: false, productionAuthority: false },
  { id: "IF-GRW-004", classification: "CANONICALIZATION_READY", ownerApproved: false, versionedContractApproved: false, productionAuthority: false },
  { id: "IF-GRW-005", classification: "CANONICALIZATION_READY", ownerApproved: false, versionedContractApproved: false, productionAuthority: false },
  { id: "IF-GRW-006", classification: "FINANCIAL_BOUNDARY_BLOCKED", ownerApproved: false, versionedContractApproved: false, productionAuthority: false },
  { id: "IF-GRW-007", classification: "READY_WITH_ADAPTER", ownerApproved: false, versionedContractApproved: false, productionAuthority: false },
  { id: "IF-GRW-008", classification: "CANONICALIZATION_READY", ownerApproved: false, versionedContractApproved: false, productionAuthority: false },
  { id: "IF-GRW-009", classification: "NEEDS_VERSIONED_CONTRACT", ownerApproved: false, versionedContractApproved: false, productionAuthority: false },
  { id: "IF-GRW-010", classification: "READY_WITH_ADAPTER", ownerApproved: false, versionedContractApproved: false, productionAuthority: false },
  { id: "IF-GRW-011", classification: "NEEDS_AUTHORIZATION_MODEL", ownerApproved: false, versionedContractApproved: false, productionAuthority: false },
  { id: "IF-GRW-012", classification: "READY_WITH_ADAPTER", ownerApproved: false, versionedContractApproved: false, productionAuthority: false },
  { id: "IF-GRW-013", classification: "NEEDS_PERSISTENCE", ownerApproved: false, versionedContractApproved: false, productionAuthority: false },
  { id: "IF-GRW-014", classification: "NEEDS_AUTHORIZATION_MODEL", ownerApproved: false, versionedContractApproved: false, productionAuthority: false },
] as const satisfies readonly GrowthContractDecision[]);

export type GrowthContractId = (typeof GROWTH_CONTRACT_DECISIONS)[number]["id"];

export const FEATURE_DEFAULTS = Object.freeze({
  GROWTH_FABRIC_ENABLED: false,
  MISSIONS_ENABLED: false,
  ENGAGEMENT_ENABLED: false,
  REWARDS_ELIGIBILITY_ENABLED: false,
  JOURNEY_ENABLED: false,
  ORCHESTRATOR_ENABLED: false,
  AFFILIATE_GROWTH_ENABLED: false,
  TRUST_RISK_ENABLED: false,
  RISK_ENFORCEMENT_ENABLED: false,
  EXPERIMENTATION_ENABLED: false,
  GROWTH_ANALYTICS_ENABLED: false,
  GROWTH_CONTROL_PLANE_ENABLED: false,
});

export const OWNERSHIP_BOUNDARIES = Object.freeze({
  growthFinancialAuthority: false,
  growthPaymentAuthority: false,
  growthPayoutAuthority: false,
  growthCommissionAuthority: false,
  growthSettlementAuthority: false,
  growthRefundAuthority: false,
  growthCanonicalOrderAuthority: false,
  growthCanonicalTicketAuthority: false,
  growthAffiliateAttributionAuthority: false,
});

export const EXTERNAL_PROVIDER_BINDINGS = Object.freeze([] as const);

export const PERSISTENCE_POLICY = Object.freeze({
  authority: "non-authoritative-projection",
  productionSchemaAuthorized: false,
  destructiveWritesAuthorized: false,
  rebuildableFromOwnerEvidence: true,
  rollbackRequiresCanonicalOwnerRollback: false,
});

const FORBIDDEN_AUTHORITY_KEY =
  /^(?:payment|payout|settlement|refund|commission|currency|price|minor_?units|money|monetary|amount|canonical_?order|canonical_?ticket|affiliate_?attribution|referral_?attribution)(?:$|_)/iu;
const UTC =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => stable(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, stable(item)]),
    );
  }
  return value;
}

export function stableJson(value: unknown): string {
  return JSON.stringify(stable(value));
}

export function semanticDigest(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

export function deterministicId(namespace: string, ...parts: unknown[]): string {
  if (!namespace.trim() || parts.some((value) => value === null || value === undefined || value === "")) {
    throw new Error("DETERMINISTIC_ID_INPUT_INVALID");
  }
  const digest = semanticDigest(parts);
  return `${namespace}:${digest.slice(0, 32)}`;
}

export function assertNoForbiddenAuthorityFields(
  value: unknown,
  path = "payload",
): true {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertNoForbiddenAuthorityFields(item, `${path}[${index}]`),
    );
    return true;
  }
  if (!value || typeof value !== "object") return true;

  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const normalized = key
      .replace(/[A-Z]/gu, (character) => `_${character.toLowerCase()}`)
      .replace(/-/gu, "_");
    if (FORBIDDEN_AUTHORITY_KEY.test(normalized)) {
      throw new Error(`FORBIDDEN_OWNER_AUTHORITY_FIELD:${path}.${key}`);
    }
    assertNoForbiddenAuthorityFields(item, `${path}.${key}`);
  }
  return true;
}

export interface GrowthScope {
  readonly tenantId: string | null;
  readonly destinationId: string;
}

export type EvidenceSurface =
  | "server_owner_adapter"
  | "browser"
  | "assistant"
  | "client";

export interface OwnerEvidenceV1 extends GrowthScope {
  readonly version: 1;
  readonly eventId: string;
  readonly eventType: string;
  readonly sourceOwner: string;
  readonly sourceSurface: EvidenceSurface;
  readonly authority: "owner-issued" | "untrusted";
  readonly occurredAt: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface VerifiedOwnerEvidence extends OwnerEvidenceV1 {
  readonly sourceSurface: "server_owner_adapter";
  readonly authority: "owner-issued";
  readonly semanticDigest: string;
}

export function assertScope(scope: GrowthScope, scoped: GrowthScope): true {
  if (!scope.destinationId || !scoped.destinationId) {
    throw new Error("DESTINATION_SCOPE_REQUIRED");
  }
  if (scope.destinationId !== scoped.destinationId) {
    throw new Error("CROSS_DESTINATION_DENIED");
  }
  if (scope.tenantId !== scoped.tenantId) {
    throw new Error("CROSS_TENANT_DENIED");
  }
  return true;
}

export function validateOwnerEvidenceV1(
  scope: GrowthScope,
  evidence: OwnerEvidenceV1,
): VerifiedOwnerEvidence {
  if (!evidence || evidence.version !== 1) {
    throw new Error("OWNER_EVIDENCE_VERSION_UNSUPPORTED");
  }
  if (
    !evidence.eventId ||
    !evidence.eventType ||
    !evidence.sourceOwner ||
    !evidence.occurredAt
  ) {
    throw new Error("OWNER_EVIDENCE_FIELD_REQUIRED");
  }
  if (evidence.sourceSurface !== "server_owner_adapter") {
    throw new Error("UNTRUSTED_AUTHORITY_SURFACE");
  }
  if (evidence.authority !== "owner-issued") {
    throw new Error("OWNER_EVIDENCE_AUTHORITY_REQUIRED");
  }
  if (
    !UTC.test(evidence.occurredAt) ||
    !Number.isFinite(Date.parse(evidence.occurredAt))
  ) {
    throw new Error("OWNER_EVIDENCE_TIME_INVALID");
  }
  assertScope(scope, evidence);
  assertNoForbiddenAuthorityFields(evidence.payload);

  return Object.freeze({
    ...evidence,
    sourceSurface: "server_owner_adapter",
    authority: "owner-issued",
    semanticDigest: semanticDigest(evidence),
  });
}

function decisionFor(contractId: GrowthContractId): (typeof GROWTH_CONTRACT_DECISIONS)[number] {
  const decision = GROWTH_CONTRACT_DECISIONS.find(
    (candidate) => candidate.id === contractId,
  );
  if (!decision) throw new Error("GROWTH_CONTRACT_UNKNOWN");
  return decision;
}

export function verifyReadyWithAdapterEvidence(
  contractId: GrowthContractId,
  scope: GrowthScope,
  evidence: OwnerEvidenceV1,
): VerifiedOwnerEvidence {
  const decision = decisionFor(contractId);
  if (decision.classification !== "READY_WITH_ADAPTER") {
    throw new Error("GROWTH_CONTRACT_NOT_READY_WITH_ADAPTER");
  }
  return validateOwnerEvidenceV1(scope, evidence);
}

export type GrowthCandidateEventType =
  | "BadgeGrantedCandidate.v1"
  | "CollectionProgressedCandidate.v1"
  | "CollectionCompletedCandidate.v1"
  | "NextBestActionComputedCandidate.v1";

const EVENT_CONTRACT: Readonly<Record<GrowthCandidateEventType, GrowthContractId>> =
  Object.freeze({
    "BadgeGrantedCandidate.v1": "IF-GRW-004",
    "CollectionProgressedCandidate.v1": "IF-GRW-005",
    "CollectionCompletedCandidate.v1": "IF-GRW-005",
    "NextBestActionComputedCandidate.v1": "IF-GRW-008",
  });

export interface GrowthCandidateEventV1 extends GrowthScope {
  readonly version: 1;
  readonly eventId: string;
  readonly eventType: GrowthCandidateEventType;
  readonly sourceOwner: "growth-candidate";
  readonly authority: "non-authoritative-candidate";
  readonly occurredAt: string;
  readonly ownerEvidenceId: string;
  readonly ownerEvidenceDigest: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export function createCandidateEventV1(input: {
  readonly scope: GrowthScope;
  readonly evidence: OwnerEvidenceV1;
  readonly eventType: GrowthCandidateEventType;
  readonly payload: Readonly<Record<string, unknown>>;
}): GrowthCandidateEventV1 {
  const decision = decisionFor(EVENT_CONTRACT[input.eventType]);
  if (decision.classification !== "CANONICALIZATION_READY") {
    throw new Error("GROWTH_EVENT_CONTRACT_NOT_CANDIDATE_READY");
  }
  const evidence = validateOwnerEvidenceV1(input.scope, input.evidence);
  assertNoForbiddenAuthorityFields(input.payload);
  const payloadDigest = semanticDigest(input.payload);

  return Object.freeze({
    version: 1,
    eventId: deterministicId(
      "growth-candidate-event",
      input.eventType,
      evidence.eventId,
      payloadDigest,
      input.scope.tenantId ?? "public",
      input.scope.destinationId,
    ),
    eventType: input.eventType,
    sourceOwner: "growth-candidate",
    authority: "non-authoritative-candidate",
    tenantId: input.scope.tenantId,
    destinationId: input.scope.destinationId,
    occurredAt: evidence.occurredAt,
    ownerEvidenceId: evidence.eventId,
    ownerEvidenceDigest: evidence.semanticDigest,
    payload: Object.freeze({ ...input.payload }),
  });
}

interface Receipt {
  readonly digest: string;
}

export interface BadgeGrantState extends GrowthScope {
  readonly grantId: string;
  readonly subjectId: string;
  readonly badgeId: string;
  readonly badgeVersion: number;
  readonly ownerEvidenceDigest: string;
}

export interface CollectionState extends GrowthScope {
  readonly stateId: string;
  readonly subjectId: string;
  readonly collectionId: string;
  readonly collectionVersion: number;
  readonly completedComponentIds: readonly string[];
  readonly completed: boolean;
}

export interface GrowthCandidateSnapshot {
  readonly receipts: readonly (readonly [string, Receipt])[];
  readonly badges: readonly (readonly [string, BadgeGrantState])[];
  readonly collections: readonly (readonly [string, CollectionState])[];
}

export interface GrowthCandidateSnapshotPort {
  load(scope: GrowthScope): Promise<GrowthCandidateSnapshot | null>;
  save(scope: GrowthScope, snapshot: GrowthCandidateSnapshot): Promise<void>;
}

export class GrowthCandidateStore {
  readonly receipts: Map<string, Receipt>;
  readonly badges: Map<string, BadgeGrantState>;
  readonly collections: Map<string, CollectionState>;

  constructor(snapshot?: GrowthCandidateSnapshot) {
    this.receipts = new Map(snapshot?.receipts ?? []);
    this.badges = new Map(snapshot?.badges ?? []);
    this.collections = new Map(snapshot?.collections ?? []);
  }

  snapshot(): GrowthCandidateSnapshot {
    return Object.freeze({
      receipts: Object.freeze([...this.receipts.entries()]),
      badges: Object.freeze([...this.badges.entries()]),
      collections: Object.freeze([...this.collections.entries()]),
    });
  }

  ingestCandidateEvent(
    scope: GrowthScope,
    event: GrowthCandidateEventV1,
  ): "accepted" | "replayed" {
    if (
      event.version !== 1 ||
      event.sourceOwner !== "growth-candidate" ||
      event.authority !== "non-authoritative-candidate"
    ) {
      throw new Error("GROWTH_CANDIDATE_EVENT_AUTHORITY_INVALID");
    }
    assertScope(scope, event);
    assertNoForbiddenAuthorityFields(event.payload);

    const expectedContract = decisionFor(EVENT_CONTRACT[event.eventType]);
    if (expectedContract.classification !== "CANONICALIZATION_READY") {
      throw new Error("GROWTH_EVENT_CONTRACT_NOT_CANDIDATE_READY");
    }

    const digest = semanticDigest(event);
    const prior = this.receipts.get(event.eventId);
    if (prior) {
      if (prior.digest !== digest) {
        throw new Error("GROWTH_EVENT_REPLAY_SEMANTIC_CONFLICT");
      }
      return "replayed";
    }
    this.receipts.set(event.eventId, Object.freeze({ digest }));
    return "accepted";
  }

  grantBadge(input: {
    readonly scope: GrowthScope;
    readonly evidence: OwnerEvidenceV1;
    readonly subjectId: string;
    readonly badgeId: string;
    readonly badgeVersion: number;
  }): Readonly<{ kind: "granted" | "replayed"; state: BadgeGrantState }> {
    if (
      !input.subjectId ||
      !input.badgeId ||
      !Number.isSafeInteger(input.badgeVersion) ||
      input.badgeVersion < 1
    ) {
      throw new Error("BADGE_INPUT_INVALID");
    }

    const evidence = validateOwnerEvidenceV1(input.scope, input.evidence);
    const grantId = deterministicId(
      "growth-badge",
      input.scope.tenantId ?? "public",
      input.scope.destinationId,
      input.subjectId,
      input.badgeId,
      input.badgeVersion,
    );
    const state = Object.freeze({
      grantId,
      tenantId: input.scope.tenantId,
      destinationId: input.scope.destinationId,
      subjectId: input.subjectId,
      badgeId: input.badgeId,
      badgeVersion: input.badgeVersion,
      ownerEvidenceDigest: evidence.semanticDigest,
    });
    const event = createCandidateEventV1({
      scope: input.scope,
      evidence: input.evidence,
      eventType: "BadgeGrantedCandidate.v1",
      payload: {
        grantId,
        subjectId: input.subjectId,
        badgeId: input.badgeId,
        badgeVersion: input.badgeVersion,
        ownerEvidenceDigest: evidence.semanticDigest,
      },
    });
    const eventResult = this.ingestCandidateEvent(input.scope, event);
    const prior = this.badges.get(grantId);
    if (prior) {
      if (semanticDigest(prior) !== semanticDigest(state)) {
        throw new Error("BADGE_GRANT_SEMANTIC_CONFLICT");
      }
      return Object.freeze({ kind: "replayed", state: prior });
    }
    this.badges.set(grantId, state);
    return Object.freeze({
      kind: eventResult === "replayed" ? "replayed" : "granted",
      state,
    });
  }

  progressCollection(input: {
    readonly scope: GrowthScope;
    readonly evidence: OwnerEvidenceV1;
    readonly subjectId: string;
    readonly collectionId: string;
    readonly collectionVersion: number;
    readonly componentId: string;
    readonly requiredComponentIds: readonly string[];
  }): CollectionState {
    if (
      !input.subjectId ||
      !input.collectionId ||
      !input.componentId ||
      !Number.isSafeInteger(input.collectionVersion) ||
      input.collectionVersion < 1 ||
      input.requiredComponentIds.length === 0 ||
      !input.requiredComponentIds.includes(input.componentId)
    ) {
      throw new Error("COLLECTION_INPUT_INVALID");
    }

    const stateId = deterministicId(
      "growth-collection",
      input.scope.tenantId ?? "public",
      input.scope.destinationId,
      input.subjectId,
      input.collectionId,
      input.collectionVersion,
    );
    const prior = this.collections.get(stateId);
    const completedComponentIds = Object.freeze(
      [
        ...new Set([
          ...(prior?.completedComponentIds ?? []),
          input.componentId,
        ]),
      ].sort(),
    );
    const completed = input.requiredComponentIds.every((componentId) =>
      completedComponentIds.includes(componentId),
    );
    const state = Object.freeze({
      stateId,
      tenantId: input.scope.tenantId,
      destinationId: input.scope.destinationId,
      subjectId: input.subjectId,
      collectionId: input.collectionId,
      collectionVersion: input.collectionVersion,
      completedComponentIds,
      completed,
    });
    const event = createCandidateEventV1({
      scope: input.scope,
      evidence: input.evidence,
      eventType: completed
        ? "CollectionCompletedCandidate.v1"
        : "CollectionProgressedCandidate.v1",
      payload: {
        stateId,
        subjectId: input.subjectId,
        collectionId: input.collectionId,
        collectionVersion: input.collectionVersion,
        completedComponentIds,
        completed,
      },
    });
    this.ingestCandidateEvent(input.scope, event);
    this.collections.set(stateId, state);
    return state;
  }
}

export interface AdvisoryAction {
  readonly actionType: string;
  readonly targetReference: string;
  readonly relevanceScore: number;
}

export interface AdvisoryActionResult extends AdvisoryAction {
  readonly authority: "advisory";
  readonly effectRequiresOwnerAuthorization: true;
}

export function orchestrateDeterministically(
  candidates: readonly AdvisoryAction[],
  limit = 5,
): readonly AdvisoryActionResult[] {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20) {
    throw new Error("ORCHESTRATOR_LIMIT_INVALID");
  }

  return Object.freeze(
    candidates
      .filter(
        (item) =>
          Boolean(item?.actionType) &&
          Boolean(item?.targetReference) &&
          Number.isFinite(item?.relevanceScore),
      )
      .map((item) =>
        Object.freeze({
          actionType: item.actionType,
          targetReference: item.targetReference,
          relevanceScore: Math.max(
            0,
            Math.min(100, Math.round(item.relevanceScore)),
          ),
          authority: "advisory" as const,
          effectRequiresOwnerAuthorization: true as const,
        }),
      )
      .sort(
        (left, right) =>
          right.relevanceScore - left.relevanceScore ||
          left.targetReference.localeCompare(right.targetReference) ||
          left.actionType.localeCompare(right.actionType),
      )
      .slice(0, limit),
  );
}

export function growthMayMutateFinancialAuthority(): false {
  return false;
}

export function browserMayMintGrowthAuthority(): false {
  return false;
}

export function assistantMayMintGrowthAuthority(): false {
  return false;
}

export function growthClassificationCounts(): Readonly<
  Record<GrowthClassification, number>
> {
  const counts = Object.fromEntries(
    GROWTH_CLASSIFICATIONS.map((classification) => [classification, 0]),
  ) as Record<GrowthClassification, number>;

  for (const decision of GROWTH_CONTRACT_DECISIONS) {
    counts[decision.classification] += 1;
  }
  return Object.freeze({ ...counts });
}
