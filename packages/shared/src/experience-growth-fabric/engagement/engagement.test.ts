import { describe, expect, it } from "vitest";

import {
  appendXpEntry,
  calculateXpBalance,
  createCompensatingXpEntry,
  createEmptyXpLedgerState,
  evaluateBadgeGrant,
  evaluateLevelTransition,
  projectCollectionProgress,
  projectEngagementProfile,
  reduceXpLedger,
  resolveLevelProgress,
} from "./index.js";
import type { XpLedgerEntry } from "./index.js";

const levels = [
  { levelId: "level_1", ordinal: 1, minimumXp: 0, label: "Explorer" },
  { levelId: "level_2", ordinal: 2, minimumXp: 100, label: "Navigator" },
  { levelId: "level_3", ordinal: 3, minimumXp: 250, label: "Insider" },
] as const;

const entry: XpLedgerEntry = {
  entryId: "xp_00000001",
  subjectId: "asub_00000001",
  journeyId: "journey_00000001",
  destinationId: "morro",
  amountSigned: 120,
  reasonCode: "VERIFIED_VISIT",
  sourceEventId: "event_00000001",
  evidenceReference: "proof_00000001",
  idempotencyKey: "xp:visit:00000001",
  policyVersion: "ENGAGEMENT-POLICY-V1",
  trustClass: "experience_verified",
  occurredAt: "2026-09-29T12:00:00.000Z",
};

describe("engagement core", () => {
  it("appends XP idempotently instead of mutating a counter", () => {
    const empty = createEmptyXpLedgerState();
    const first = appendXpEntry(empty, entry);
    expect(first.kind).toBe("appended");

    const state = reduceXpLedger(empty, first);
    expect(calculateXpBalance(state.entries, entry.subjectId, "morro")).toBe(
      120,
    );

    const replay = appendXpEntry(state, entry);
    expect(replay.kind).toBe("replayed");
    expect(reduceXpLedger(state, replay).entries).toHaveLength(1);
  });

  it("rejects conflicting reuse of an idempotency key", () => {
    const first = appendXpEntry(createEmptyXpLedgerState(), entry);
    const state = reduceXpLedger(createEmptyXpLedgerState(), first);
    const conflict = appendXpEntry(state, {
      ...entry,
      entryId: "xp_00000002",
      amountSigned: 999,
    });

    expect(conflict).toEqual({
      kind: "rejected",
      code: "XP_IDEMPOTENCY_CONFLICT",
    });
  });

  it("uses compensating ledger entries instead of deleting history", () => {
    const compensating = createCompensatingXpEntry(entry, {
      entryId: "xp_00000002",
      sourceEventId: "event_00000002",
      evidenceReference: "reversal_00000001",
      idempotencyKey: "xp:reversal:00000001",
      occurredAt: "2026-09-30T12:00:00.000Z",
      reasonCode: "VERIFIED_VISIT_REVERSED",
    });

    expect(compensating.amountSigned).toBe(-120);
    expect(
      calculateXpBalance([entry, compensating], entry.subjectId, "morro"),
    ).toBe(0);
  });

  it("resolves deterministic levels and level advancement", () => {
    const progress = resolveLevelProgress(120, levels);
    expect(progress.level.levelId).toBe("level_2");
    expect(progress.xpToNextLevel).toBe(130);

    const transition = evaluateLevelTransition(90, 120, levels);
    expect(transition.advanced).toBe(true);
    if (!transition.advanced) return;
    expect(transition.event).toBe("LevelAdvanced");
    expect(transition.to.levelId).toBe("level_2");
  });

  it("grants badges only with distinct evidence", () => {
    const insufficient = evaluateBadgeGrant(
      {
        badgeId: "badge_beaches",
        version: 1,
        label: "Praias",
        requiredEvidenceCount: 2,
      },
      {
        grantId: "grant_1",
        subjectId: entry.subjectId,
        destinationId: "morro",
        evidenceReferences: ["proof_1", "proof_1"],
        grantedAt: "2026-09-30T12:00:00.000Z",
      },
      null,
    );
    expect(insufficient).toEqual({
      granted: false,
      code: "BADGE_EVIDENCE_INSUFFICIENT",
    });

    const granted = evaluateBadgeGrant(
      {
        badgeId: "badge_beaches",
        version: 1,
        label: "Praias",
        requiredEvidenceCount: 2,
      },
      {
        grantId: "grant_1",
        subjectId: entry.subjectId,
        destinationId: "morro",
        evidenceReferences: ["proof_1", "proof_2"],
        grantedAt: "2026-09-30T12:00:00.000Z",
      },
      null,
    );
    expect(granted.granted).toBe(true);
  });

  it("projects collections from verified component completions", () => {
    const progress = projectCollectionProgress(
      {
        collectionId: "collection_beaches",
        version: 1,
        componentIds: ["place_1", "place_2", "place_3"],
      },
      ["place_1", "place_2", "unknown"],
    );

    expect(progress.completedComponentIds).toEqual(["place_1", "place_2"]);
    expect(progress.completed).toBe(false);
  });

  it("builds a read-only engagement profile from ledger authority", () => {
    const profile = projectEngagementProfile({
      subjectId: entry.subjectId,
      destinationId: "morro",
      ledgerEntries: [entry],
      levels,
      badges: [],
      collections: [],
      projectedAt: "2026-09-30T12:00:00.000Z",
    });

    expect(profile.xp).toBe(120);
    expect(profile.level.level.levelId).toBe("level_2");
  });
});
