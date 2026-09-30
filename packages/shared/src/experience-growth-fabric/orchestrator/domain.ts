export type NextBestActionType =
  | "assistant_prompt"
  | "open_map"
  | "navigate"
  | "view_place"
  | "mission"
  | "reward";

export type CandidateSource =
  | "assistant"
  | "map"
  | "search"
  | "catalog"
  | "mission"
  | "reward";

export interface JourneyOrchestratorContext {
  readonly journeyId: string;
  readonly subjectId: string;
  readonly destinationId: string;
  readonly profileType: "tourist" | "resident" | "visitor" | "unknown";
  readonly locale: string;
  readonly interests: readonly string[];
  readonly occurredAt: string;
}

export interface OrchestratorCandidate {
  readonly actionType: NextBestActionType;
  readonly targetReference: string;
  readonly source: CandidateSource;
  readonly baseScore: number;
  readonly tags: readonly string[];
  readonly distanceMeters: number | null;
  readonly expiresAt: string | null;
}

export interface OrchestrationSignals {
  readonly activeMissionTargets: ReadonlySet<string>;
  readonly availableRewardTargets: ReadonlySet<string>;
  readonly validTargetReferences: ReadonlySet<string>;
}

export interface NextBestAction {
  readonly actionType: NextBestActionType;
  readonly targetReference: string;
  readonly rationaleCode: string;
  readonly relevanceScore: number;
  readonly expiresAt: string | null;
  readonly requiredCapabilities: readonly string[];
  readonly authority: "advisory";
}

export type CandidateSourceSnapshot =
  | Readonly<{
      status: "available";
      candidates: readonly OrchestratorCandidate[];
    }>
  | Readonly<{
      status: "unavailable";
      code: string;
    }>;

const REQUIRED_CAPABILITIES: Readonly<
  Record<NextBestActionType, readonly string[]>
> = {
  assistant_prompt: ["assistant.read"],
  open_map: ["map.read"],
  navigate: ["navigation.read"],
  view_place: ["catalog.read"],
  mission: ["engagement.read"],
  reward: ["rewards.read"],
};

const UTC_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

function isUtc(value: string): boolean {
  return UTC_TIMESTAMP.test(value) && Number.isFinite(Date.parse(value));
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function flattenCandidateSources(
  sources: readonly CandidateSourceSnapshot[],
): readonly OrchestratorCandidate[] {
  return Object.freeze(
    sources.flatMap((source) =>
      source.status === "available" ? source.candidates : [],
    ),
  );
}

function scoreCandidate(
  context: JourneyOrchestratorContext,
  candidate: OrchestratorCandidate,
  signals: OrchestrationSignals,
): Readonly<{ score: number; rationaleCode: string }> {
  let score = candidate.baseScore;
  let rationaleCode = "GENERAL_RELEVANCE";

  const hasInterest = candidate.tags.some((tag) =>
    context.interests.includes(tag),
  );
  if (hasInterest) {
    score += 15;
    rationaleCode = "MATCHES_INTEREST";
  }

  if (signals.activeMissionTargets.has(candidate.targetReference)) {
    score += 20;
    rationaleCode = "ACTIVE_MISSION";
  }

  if (signals.availableRewardTargets.has(candidate.targetReference)) {
    score += 10;
    rationaleCode = "AVAILABLE_REWARD";
  }

  if (
    candidate.distanceMeters !== null &&
    Number.isFinite(candidate.distanceMeters) &&
    candidate.distanceMeters >= 0
  ) {
    if (candidate.distanceMeters <= 500) {
      score += 10;
      rationaleCode = "NEARBY";
    } else if (candidate.distanceMeters <= 1500) {
      score += 5;
    }
  }

  return {
    score: clampScore(score),
    rationaleCode,
  };
}

export function orchestrateNextBestActions(
  context: JourneyOrchestratorContext,
  candidates: readonly OrchestratorCandidate[],
  signals: OrchestrationSignals,
  limit = 5,
): readonly NextBestAction[] {
  if (!context.journeyId || !context.subjectId || !context.destinationId) {
    throw new Error("ORCHESTRATOR_CONTEXT_IDENTITY_INVALID");
  }
  if (!context.locale || !isUtc(context.occurredAt)) {
    throw new Error("ORCHESTRATOR_CONTEXT_INVALID");
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20) {
    throw new Error("ORCHESTRATOR_LIMIT_INVALID");
  }

  const now = Date.parse(context.occurredAt);
  const scored = candidates
    .filter((candidate) => {
      if (!candidate.targetReference) return false;
      if (!signals.validTargetReferences.has(candidate.targetReference)) {
        return false;
      }
      if (
        candidate.expiresAt !== null &&
        (!isUtc(candidate.expiresAt) ||
          Date.parse(candidate.expiresAt) <= now)
      ) {
        return false;
      }
      return Number.isFinite(candidate.baseScore);
    })
    .map((candidate) => {
      const result = scoreCandidate(context, candidate, signals);
      return {
        actionType: candidate.actionType,
        targetReference: candidate.targetReference,
        rationaleCode: result.rationaleCode,
        relevanceScore: result.score,
        expiresAt: candidate.expiresAt,
        requiredCapabilities: REQUIRED_CAPABILITIES[candidate.actionType],
        authority: "advisory" as const,
      };
    });

  const deduplicated = new Map<string, NextBestAction>();
  for (const action of scored) {
    const key = [action.actionType, action.targetReference].join(":");
    const existing = deduplicated.get(key);
    if (!existing || action.relevanceScore > existing.relevanceScore) {
      deduplicated.set(key, action);
    }
  }

  return Object.freeze(
    [...deduplicated.values()]
      .sort(
        (left, right) =>
          right.relevanceScore - left.relevanceScore ||
          left.targetReference.localeCompare(right.targetReference) ||
          left.actionType.localeCompare(right.actionType),
      )
      .slice(0, limit),
  );
}

export function nextBestActionMayAuthorizeValue(): false {
  return false;
}
