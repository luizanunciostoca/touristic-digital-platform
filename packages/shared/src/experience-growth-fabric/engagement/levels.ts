export interface LevelDefinition {
  readonly levelId: string;
  readonly ordinal: number;
  readonly minimumXp: number;
  readonly label: string;
}

export interface LevelProgress {
  readonly level: LevelDefinition;
  readonly nextLevel: LevelDefinition | null;
  readonly xp: number;
  readonly xpIntoLevel: number;
  readonly xpToNextLevel: number | null;
}

export type LevelTransition =
  | Readonly<{ advanced: false; current: LevelDefinition }>
  | Readonly<{
      advanced: true;
      from: LevelDefinition;
      to: LevelDefinition;
      event: "LevelAdvanced";
    }>;

export function validateLevelDefinitions(
  levels: readonly LevelDefinition[],
): readonly LevelDefinition[] {
  if (levels.length === 0) throw new Error("LEVEL_DEFINITIONS_EMPTY");

  const ordered = [...levels].sort((a, b) => a.ordinal - b.ordinal);
  const ids = new Set<string>();
  let previousMinimum = -1;

  for (const [index, level] of ordered.entries()) {
    if (!level.levelId || !level.label) {
      throw new Error("LEVEL_DEFINITION_IDENTITY_INVALID");
    }
    if (ids.has(level.levelId)) {
      throw new Error("LEVEL_DEFINITION_DUPLICATE");
    }
    ids.add(level.levelId);

    if (!Number.isSafeInteger(level.ordinal) || level.ordinal !== index + 1) {
      throw new Error("LEVEL_ORDINAL_INVALID");
    }
    if (!Number.isSafeInteger(level.minimumXp) || level.minimumXp < 0) {
      throw new Error("LEVEL_THRESHOLD_INVALID");
    }
    if (level.minimumXp <= previousMinimum) {
      throw new Error("LEVEL_THRESHOLD_NOT_STRICTLY_INCREASING");
    }
    previousMinimum = level.minimumXp;
  }

  if (ordered[0]?.minimumXp !== 0) {
    throw new Error("LEVEL_FIRST_THRESHOLD_MUST_BE_ZERO");
  }

  return ordered;
}

export function resolveLevelProgress(
  xp: number,
  levels: readonly LevelDefinition[],
): LevelProgress {
  if (!Number.isSafeInteger(xp) || xp < 0) {
    throw new Error("LEVEL_XP_INVALID");
  }

  const ordered = validateLevelDefinitions(levels);
  let current = ordered[0] as LevelDefinition;

  for (const level of ordered) {
    if (xp >= level.minimumXp) current = level;
    else break;
  }

  const currentIndex = ordered.findIndex(
    (level) => level.levelId === current.levelId,
  );
  const nextLevel = ordered[currentIndex + 1] ?? null;

  return {
    level: current,
    nextLevel,
    xp,
    xpIntoLevel: xp - current.minimumXp,
    xpToNextLevel: nextLevel ? nextLevel.minimumXp - xp : null,
  };
}

export function evaluateLevelTransition(
  beforeXp: number,
  afterXp: number,
  levels: readonly LevelDefinition[],
): LevelTransition {
  const before = resolveLevelProgress(beforeXp, levels).level;
  const after = resolveLevelProgress(afterXp, levels).level;

  if (after.ordinal <= before.ordinal) {
    return { advanced: false, current: after };
  }

  return {
    advanced: true,
    from: before,
    to: after,
    event: "LevelAdvanced",
  };
}
