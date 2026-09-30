import type { BadgeGrant, CollectionProgress } from "./badges-collections.js";
import type { LevelDefinition, LevelProgress } from "./levels.js";
import { resolveLevelProgress } from "./levels.js";
import type { XpLedgerEntry } from "./xp-ledger.js";
import { calculateXpBalance } from "./xp-ledger.js";

export interface EngagementProfileProjection {
  readonly subjectId: string;
  readonly destinationId: string;
  readonly xp: number;
  readonly level: LevelProgress;
  readonly badges: readonly BadgeGrant[];
  readonly collections: readonly CollectionProgress[];
  readonly projectedAt: string;
}

export function projectEngagementProfile(
  input: Readonly<{
    subjectId: string;
    destinationId: string;
    ledgerEntries: readonly XpLedgerEntry[];
    levels: readonly LevelDefinition[];
    badges: readonly BadgeGrant[];
    collections: readonly CollectionProgress[];
    projectedAt: string;
  }>,
): EngagementProfileProjection {
  const xp = calculateXpBalance(
    input.ledgerEntries,
    input.subjectId,
    input.destinationId,
  );

  if (xp < 0) {
    throw new Error("ENGAGEMENT_PROJECTED_XP_NEGATIVE");
  }

  return Object.freeze({
    subjectId: input.subjectId,
    destinationId: input.destinationId,
    xp,
    level: resolveLevelProgress(xp, input.levels),
    badges: Object.freeze(
      input.badges.filter(
        (grant) =>
          grant.subjectId === input.subjectId &&
          grant.destinationId === input.destinationId,
      ),
    ),
    collections: Object.freeze([...input.collections]),
    projectedAt: input.projectedAt,
  });
}
