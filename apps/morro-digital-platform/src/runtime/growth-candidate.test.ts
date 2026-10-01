import { describe, expect, it } from "vitest";
import {
  EXTERNAL_PROVIDER_BINDINGS,
  FEATURE_DEFAULTS,
  GROWTH_CONTRACT_DECISIONS,
  OWNERSHIP_BOUNDARIES,
  PERSISTENCE_POLICY,
  GrowthCandidateStore,
  assertNoForbiddenAuthorityFields,
  assistantMayMintGrowthAuthority,
  browserMayMintGrowthAuthority,
  createCandidateEventV1,
  deterministicId,
  growthClassificationCounts,
  growthMayMutateFinancialAuthority,
  orchestrateDeterministically,
  semanticDigest,
  validateOwnerEvidenceV1,
  verifyReadyWithAdapterEvidence,
  type GrowthScope,
  type OwnerEvidenceV1,
} from "./growth-candidate.js";

const scope: GrowthScope = Object.freeze({
  tenantId: "tenant-a",
  destinationId: "morro-de-sao-paulo",
});

function ownerEvidence(
  overrides: Partial<OwnerEvidenceV1> = {},
): OwnerEvidenceV1 {
  return {
    version: 1,
    eventId: "owner-event-1",
    eventType: "PlaceVisitVerified.v1",
    sourceOwner: "place",
    sourceSurface: "server_owner_adapter",
    authority: "owner-issued",
    tenantId: "tenant-a",
    destinationId: "morro-de-sao-paulo",
    occurredAt: "2026-10-01T02:00:00Z",
    payload: { placeId: "place-1", subjectId: "subject-1" },
    ...overrides,
  };
}

describe("Phase20 Growth candidate canonicalization", () => {
  it("preserves all Phase17 top-level classifications without promotion", () => {
    expect(GROWTH_CONTRACT_DECISIONS).toHaveLength(15);
    expect(growthClassificationCounts()).toEqual({
      CANONICALIZATION_READY: 3,
      READY_WITH_ADAPTER: 4,
      NEEDS_VERSIONED_CONTRACT: 2,
      NEEDS_PERSISTENCE: 1,
      NEEDS_AUTHORIZATION_MODEL: 3,
      FINANCIAL_BOUNDARY_BLOCKED: 1,
      EXPERIMENTAL_ONLY: 1,
    });
    expect(
      GROWTH_CONTRACT_DECISIONS.every(
        (decision) =>
          decision.ownerApproved === false &&
          decision.versionedContractApproved === false &&
          decision.productionAuthority === false,
      ),
    ).toBe(true);
  });

  it("keeps every Growth feature flag off by default", () => {
    expect(Object.keys(FEATURE_DEFAULTS).length).toBeGreaterThanOrEqual(10);
    expect(Object.values(FEATURE_DEFAULTS).every((value) => value === false)).toBe(
      true,
    );
  });

  it("preserves financial, order, ticket and affiliate authority boundaries", () => {
    expect(Object.values(OWNERSHIP_BOUNDARIES).every((value) => value === false)).toBe(
      true,
    );
    expect(growthMayMutateFinancialAuthority()).toBe(false);
    expect(EXTERNAL_PROVIDER_BINDINGS).toEqual([]);
  });

  it("rejects browser and assistant minted owner evidence", () => {
    expect(() =>
      validateOwnerEvidenceV1(
        scope,
        ownerEvidence({ sourceSurface: "browser", authority: "untrusted" }),
      ),
    ).toThrow("UNTRUSTED_AUTHORITY_SURFACE");
    expect(() =>
      validateOwnerEvidenceV1(
        scope,
        ownerEvidence({ sourceSurface: "assistant", authority: "untrusted" }),
      ),
    ).toThrow("UNTRUSTED_AUTHORITY_SURFACE");
    expect(browserMayMintGrowthAuthority()).toBe(false);
    expect(assistantMayMintGrowthAuthority()).toBe(false);
  });

  it("denies cross-tenant and cross-destination evidence", () => {
    expect(() =>
      validateOwnerEvidenceV1(scope, ownerEvidence({ tenantId: "tenant-b" })),
    ).toThrow("CROSS_TENANT_DENIED");
    expect(() =>
      validateOwnerEvidenceV1(
        scope,
        ownerEvidence({ destinationId: "itacare" }),
      ),
    ).toThrow("CROSS_DESTINATION_DENIED");
  });

  it("accepts only owner-issued server adapter evidence", () => {
    const verified = validateOwnerEvidenceV1(scope, ownerEvidence());
    expect(verified.sourceSurface).toBe("server_owner_adapter");
    expect(verified.authority).toBe("owner-issued");
    expect(verified.semanticDigest).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("keeps READY_WITH_ADAPTER contracts conditional on adapter validation", () => {
    expect(
      verifyReadyWithAdapterEvidence("IF-GRW-007", scope, ownerEvidence())
        .semanticDigest,
    ).toHaveLength(64);
    expect(() =>
      verifyReadyWithAdapterEvidence("IF-GRW-004", scope, ownerEvidence()),
    ).toThrow("GROWTH_CONTRACT_NOT_READY_WITH_ADAPTER");
  });

  it("rejects money and canonical owner fields recursively", () => {
    expect(() =>
      assertNoForbiddenAuthorityFields({ nested: { payout: 100 } }),
    ).toThrow("FORBIDDEN_OWNER_AUTHORITY_FIELD");
    expect(() =>
      assertNoForbiddenAuthorityFields({ canonicalOrder: "order-1" }),
    ).toThrow("FORBIDDEN_OWNER_AUTHORITY_FIELD");
    expect(() =>
      assertNoForbiddenAuthorityFields({ affiliateAttribution: "affiliate-1" }),
    ).toThrow("FORBIDDEN_OWNER_AUTHORITY_FIELD");
  });

  it("creates typed candidate-only events only for CANONICALIZATION_READY contracts", () => {
    const event = createCandidateEventV1({
      scope,
      evidence: ownerEvidence(),
      eventType: "BadgeGrantedCandidate.v1",
      payload: { badgeId: "explorer", subjectId: "subject-1" },
    });
    expect(event.authority).toBe("non-authoritative-candidate");
    expect(event.sourceOwner).toBe("growth-candidate");
    expect(event.version).toBe(1);
    expect(event.eventId).toMatch(/^growth-candidate-event:[a-f0-9]{32}$/u);
  });

  it("uses deterministic scope-sensitive IDs", () => {
    const a = deterministicId(
      "growth-test",
      "tenant-a",
      "morro-de-sao-paulo",
      "subject-1",
    );
    const b = deterministicId(
      "growth-test",
      "tenant-a",
      "morro-de-sao-paulo",
      "subject-1",
    );
    const c = deterministicId(
      "growth-test",
      "tenant-a",
      "itacare",
      "subject-1",
    );
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("deduplicates exact candidate replay and fails closed on semantic conflict", () => {
    const store = new GrowthCandidateStore();
    const event = createCandidateEventV1({
      scope,
      evidence: ownerEvidence(),
      eventType: "BadgeGrantedCandidate.v1",
      payload: { badgeId: "explorer", subjectId: "subject-1" },
    });
    expect(store.ingestCandidateEvent(scope, event)).toBe("accepted");
    expect(store.ingestCandidateEvent(scope, event)).toBe("replayed");

    const conflicting = {
      ...event,
      payload: { badgeId: "different", subjectId: "subject-1" },
    };
    expect(() => store.ingestCandidateEvent(scope, conflicting)).toThrow(
      "GROWTH_EVENT_REPLAY_SEMANTIC_CONFLICT",
    );
  });

  it("grants a badge idempotently from verified owner evidence", () => {
    const store = new GrowthCandidateStore();
    const input = {
      scope,
      evidence: ownerEvidence(),
      subjectId: "subject-1",
      badgeId: "explorer",
      badgeVersion: 1,
    } as const;
    expect(store.grantBadge(input).kind).toBe("granted");
    expect(store.grantBadge(input).kind).toBe("replayed");
    expect(store.badges.size).toBe(1);
  });

  it("maintains collection set semantics without monetary authority", () => {
    const store = new GrowthCandidateStore();
    const base = {
      scope,
      subjectId: "subject-1",
      collectionId: "beaches",
      collectionVersion: 1,
      requiredComponentIds: ["badge-a", "badge-b"],
    } as const;

    store.progressCollection({
      ...base,
      evidence: ownerEvidence({ eventId: "evt-a" }),
      componentId: "badge-a",
    });
    const replayed = store.progressCollection({
      ...base,
      evidence: ownerEvidence({ eventId: "evt-a" }),
      componentId: "badge-a",
    });
    expect(replayed.completedComponentIds).toEqual(["badge-a"]);

    const completed = store.progressCollection({
      ...base,
      evidence: ownerEvidence({ eventId: "evt-b" }),
      componentId: "badge-b",
    });
    expect(completed.completedComponentIds).toEqual(["badge-a", "badge-b"]);
    expect(completed.completed).toBe(true);
  });

  it("keeps next-best-action ordering deterministic and advisory", () => {
    const candidates = [
      { actionType: "mission", targetReference: "b", relevanceScore: 80 },
      { actionType: "view_place", targetReference: "a", relevanceScore: 80 },
      { actionType: "reward", targetReference: "c", relevanceScore: 90 },
    ];
    const first = orchestrateDeterministically(candidates);
    const second = orchestrateDeterministically([...candidates].reverse());
    expect(first).toEqual(second);
    expect(
      first.every(
        (item) =>
          item.authority === "advisory" &&
          item.effectRequiresOwnerAuthorization === true,
      ),
    ).toBe(true);
  });

  it("restores non-authoritative state across snapshot restart", () => {
    const store = new GrowthCandidateStore();
    const input = {
      scope,
      evidence: ownerEvidence(),
      subjectId: "subject-1",
      badgeId: "explorer",
      badgeVersion: 1,
    } as const;
    store.grantBadge(input);
    const snapshot = JSON.parse(
      JSON.stringify(store.snapshot()),
    ) as ReturnType<GrowthCandidateStore["snapshot"]>;
    const restarted = new GrowthCandidateStore(snapshot);
    expect(restarted.grantBadge(input).kind).toBe("replayed");
    expect(restarted.badges.size).toBe(1);
    expect(PERSISTENCE_POLICY.authority).toBe("non-authoritative-projection");
    expect(PERSISTENCE_POLICY.productionSchemaAuthorized).toBe(false);
  });

  it("semantic digest is stable across object key order", () => {
    expect(semanticDigest({ a: 1, b: 2 })).toBe(
      semanticDigest({ b: 2, a: 1 }),
    );
  });
});
