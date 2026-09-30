export interface BadgeDefinition {
  readonly badgeId: string;
  readonly version: number;
  readonly label: string;
  readonly requiredEvidenceCount: number;
}

export interface BadgeGrant {
  readonly grantId: string;
  readonly subjectId: string;
  readonly destinationId: string;
  readonly badgeId: string;
  readonly badgeVersion: number;
  readonly evidenceReferences: readonly string[];
  readonly grantedAt: string;
}

export type BadgeGrantDecision =
  | Readonly<{ granted: true; grant: BadgeGrant; event: "BadgeGranted" }>
  | Readonly<{ granted: false; code: string }>;

export interface CollectionDefinition {
  readonly collectionId: string;
  readonly version: number;
  readonly componentIds: readonly string[];
}

export interface CollectionProgress {
  readonly collectionId: string;
  readonly collectionVersion: number;
  readonly completedComponentIds: readonly string[];
  readonly totalComponents: number;
  readonly completed: boolean;
}

export function evaluateBadgeGrant(
  definition: BadgeDefinition,
  input: Omit<BadgeGrant, "badgeId" | "badgeVersion">,
  existingGrant: BadgeGrant | null,
): BadgeGrantDecision {
  if (existingGrant) {
    return { granted: false, code: "BADGE_ALREADY_GRANTED" };
  }
  if (!definition.badgeId || !definition.label || definition.version < 1) {
    return { granted: false, code: "BADGE_DEFINITION_INVALID" };
  }
  if (
    !Number.isSafeInteger(definition.requiredEvidenceCount) ||
    definition.requiredEvidenceCount < 1
  ) {
    return { granted: false, code: "BADGE_EVIDENCE_POLICY_INVALID" };
  }

  const distinctEvidence = new Set(input.evidenceReferences);
  if (distinctEvidence.size < definition.requiredEvidenceCount) {
    return { granted: false, code: "BADGE_EVIDENCE_INSUFFICIENT" };
  }

  return {
    granted: true,
    grant: Object.freeze({
      ...input,
      badgeId: definition.badgeId,
      badgeVersion: definition.version,
      evidenceReferences: Object.freeze([...distinctEvidence]),
    }),
    event: "BadgeGranted",
  };
}

export function projectCollectionProgress(
  definition: CollectionDefinition,
  completedComponentIds: readonly string[],
): CollectionProgress {
  if (!definition.collectionId || definition.version < 1) {
    throw new Error("COLLECTION_DEFINITION_INVALID");
  }

  const components = new Set(definition.componentIds);
  if (
    components.size !== definition.componentIds.length ||
    components.size < 1
  ) {
    throw new Error("COLLECTION_COMPONENTS_INVALID");
  }

  const completed = [...new Set(completedComponentIds)].filter((componentId) =>
    components.has(componentId),
  );

  return {
    collectionId: definition.collectionId,
    collectionVersion: definition.version,
    completedComponentIds: completed,
    totalComponents: components.size,
    completed: completed.length === components.size,
  };
}
