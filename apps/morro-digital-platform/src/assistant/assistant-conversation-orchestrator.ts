export type ConversationPriority =
  | "emergency"
  | "transaction"
  | "navigation"
  | "explicit"
  | "contextual"
  | "proactive"
  | "passive";

export interface ConversationStateSnapshot {
  readonly sessionId: string;
  readonly previousAssistantMessage: string | null;
  readonly previousUserAction: string | null;
  readonly previousIntent: string | null;
  readonly currentIntent: string | null;
  readonly currentCategory: string | null;
  readonly previousCategory: string | null;
  readonly currentPlace: string | null;
  readonly previousPlace: string | null;
  readonly currentFilters: readonly string[];
  readonly currentSearch: string | null;
  readonly resultCount: number | null;
  readonly currentJourney: string | null;
  readonly currentJourneyStep: string | null;
  readonly navigationDestination: string | null;
  readonly navigationPhase: string | null;
  readonly locationPermission: string | null;
  readonly networkState: "online" | "offline" | "unknown";
  readonly paymentState: string | null;
  readonly lastMeaningfulTurn: string | null;
  readonly source: string | null;
  readonly timestamp: number;
}

export interface ConversationAction {
  readonly id: string;
  readonly label: string;
}

export interface ConversationTurn {
  readonly id: string;
  readonly previousTurnId: string | null;
  readonly cause: string;
  readonly previousState: ConversationStateSnapshot;
  readonly nextState: ConversationStateSnapshot;
  readonly userAction?: string;
  readonly intent?: string;
  readonly entities: Readonly<Record<string, string>>;
  readonly messageKey: string;
  readonly renderedText: string;
  readonly voiceText?: string;
  readonly actions: readonly ConversationAction[];
  readonly priority: ConversationPriority;
  readonly timestamp: number;
}

export interface ConversationTransitionInput {
  readonly cause: string;
  readonly messageKey: string;
  readonly renderedText: string;
  readonly voiceText?: string;
  readonly userAction?: string;
  readonly intent?: string;
  readonly source?: string;
  readonly category?: string | null;
  readonly place?: string | null;
  readonly filters?: readonly string[];
  readonly search?: string | null;
  readonly resultCount?: number | null;
  readonly journey?: string | null;
  readonly journeyStep?: string | null;
  readonly navigationDestination?: string | null;
  readonly navigationPhase?: string | null;
  readonly locationPermission?: string | null;
  readonly networkState?: "online" | "offline" | "unknown";
  readonly paymentState?: string | null;
  readonly entities?: Readonly<Record<string, string>>;
  readonly actions?: readonly ConversationAction[];
  readonly priority?: ConversationPriority;
  readonly timestamp?: number;
}

export interface ConversationObservabilitySnapshot {
  readonly turnsCreated: number;
  readonly duplicateAttempts: number;
  readonly asyncSequence: number;
}

export interface AssistantConversationOrchestrator {
  transition(input: ConversationTransitionInput): ConversationTurn;
  snapshot(): ConversationStateSnapshot;
  recentTurns(): readonly ConversationTurn[];
  issueSequence(): number;
  isCurrentSequence(sequence: number): boolean;
  observability(): ConversationObservabilitySnapshot;
}

function initialState(sessionId: string, now: number): ConversationStateSnapshot {
  return Object.freeze({
    sessionId,
    previousAssistantMessage: null,
    previousUserAction: null,
    previousIntent: null,
    currentIntent: null,
    currentCategory: null,
    previousCategory: null,
    currentPlace: null,
    previousPlace: null,
    currentFilters: Object.freeze([]),
    currentSearch: null,
    resultCount: null,
    currentJourney: null,
    currentJourneyStep: null,
    navigationDestination: null,
    navigationPhase: null,
    locationPermission: null,
    networkState: "unknown",
    paymentState: null,
    lastMeaningfulTurn: null,
    source: null,
    timestamp: now,
  });
}

function nextState(
  previous: ConversationStateSnapshot,
  input: ConversationTransitionInput,
  turnId: string,
  now: number,
): ConversationStateSnapshot {
  const has = <K extends keyof ConversationTransitionInput>(key: K): boolean =>
    Object.prototype.hasOwnProperty.call(input, key);

  return Object.freeze({
    ...previous,
    previousAssistantMessage: input.renderedText,
    previousUserAction: input.userAction ?? previous.previousUserAction,
    previousIntent: previous.currentIntent,
    currentIntent: input.intent ?? previous.currentIntent,
    previousCategory:
      has("category") && input.category !== previous.currentCategory
        ? previous.currentCategory
        : previous.previousCategory,
    currentCategory: has("category") ? (input.category ?? null) : previous.currentCategory,
    previousPlace:
      has("place") && input.place !== previous.currentPlace
        ? previous.currentPlace
        : previous.previousPlace,
    currentPlace: has("place") ? (input.place ?? null) : previous.currentPlace,
    currentFilters: has("filters")
      ? Object.freeze([...(input.filters ?? [])])
      : previous.currentFilters,
    currentSearch: has("search") ? (input.search ?? null) : previous.currentSearch,
    resultCount: has("resultCount") ? (input.resultCount ?? null) : previous.resultCount,
    currentJourney: has("journey") ? (input.journey ?? null) : previous.currentJourney,
    currentJourneyStep: has("journeyStep")
      ? (input.journeyStep ?? null)
      : previous.currentJourneyStep,
    navigationDestination: has("navigationDestination")
      ? (input.navigationDestination ?? null)
      : previous.navigationDestination,
    navigationPhase: has("navigationPhase")
      ? (input.navigationPhase ?? null)
      : previous.navigationPhase,
    locationPermission: has("locationPermission")
      ? (input.locationPermission ?? null)
      : previous.locationPermission,
    networkState: input.networkState ?? previous.networkState,
    paymentState: has("paymentState") ? (input.paymentState ?? null) : previous.paymentState,
    lastMeaningfulTurn: turnId,
    source: input.source ?? previous.source,
    timestamp: now,
  });
}

function transitionFingerprint(input: ConversationTransitionInput): string {
  const entities = Object.entries(input.entities ?? {}).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  return JSON.stringify({
    cause: input.cause,
    messageKey: input.messageKey,
    renderedText: input.renderedText,
    voiceText: input.voiceText ?? null,
    userAction: input.userAction ?? null,
    intent: input.intent ?? null,
    source: input.source ?? null,
    category: input.category ?? null,
    place: input.place ?? null,
    filters: input.filters ?? [],
    search: input.search ?? null,
    resultCount: input.resultCount ?? null,
    journey: input.journey ?? null,
    journeyStep: input.journeyStep ?? null,
    navigationDestination: input.navigationDestination ?? null,
    navigationPhase: input.navigationPhase ?? null,
    locationPermission: input.locationPermission ?? null,
    networkState: input.networkState ?? null,
    paymentState: input.paymentState ?? null,
    entities,
    actions: input.actions ?? [],
    priority: input.priority ?? "contextual",
  });
}

const CONVERSATION_BY_DOCUMENT = new WeakMap<Document, AssistantConversationOrchestrator>();

export function getAssistantConversationOrchestrator(
  document: Document,
): AssistantConversationOrchestrator {
  const existing = CONVERSATION_BY_DOCUMENT.get(document);
  if (existing) return existing;
  const created = createAssistantConversationOrchestrator();
  CONVERSATION_BY_DOCUMENT.set(document, created);
  return created;
}

export function createAssistantConversationOrchestrator(options?: {
  readonly sessionId?: string;
  readonly maxRecentTurns?: number;
  readonly now?: () => number;
}): AssistantConversationOrchestrator {
  const now = options?.now ?? (() => Date.now());
  const sessionId =
    options?.sessionId ?? `assistant-${now().toString(36)}`;
  const maxRecentTurns = Math.max(4, Math.min(50, options?.maxRecentTurns ?? 16));
  let state = initialState(sessionId, now());
  let turns: ConversationTurn[] = [];
  let turnSequence = 0;
  let asyncSequence = 0;
  let duplicateAttempts = 0;
  let turnsCreated = 0;
  let lastTransitionFingerprint: string | null = null;

  return Object.freeze({
    transition(input: ConversationTransitionInput): ConversationTurn {
      const timestamp = input.timestamp ?? now();
      const previousState = state;
      const previousTurn = turns.at(-1);
      const fingerprint = transitionFingerprint(input);
      if (previousTurn && lastTransitionFingerprint === fingerprint) {
        duplicateAttempts += 1;
        return previousTurn;
      }

      const previousTurnId = previousTurn?.id ?? null;
      const id = `${sessionId}:${++turnSequence}`;
      asyncSequence += 1;
      const updated = nextState(previousState, input, id, timestamp);
      const turn = Object.freeze({
        id,
        previousTurnId,
        cause: input.cause,
        previousState,
        nextState: updated,
        ...(input.userAction ? { userAction: input.userAction } : {}),
        ...(input.intent ? { intent: input.intent } : {}),
        entities: Object.freeze({ ...(input.entities ?? {}) }),
        messageKey: input.messageKey,
        renderedText: input.renderedText,
        ...(input.voiceText ? { voiceText: input.voiceText } : {}),
        actions: Object.freeze([...(input.actions ?? [])]),
        priority: input.priority ?? "contextual",
        timestamp,
      });
      state = updated;
      turns = [...turns, turn].slice(-maxRecentTurns);
      turnsCreated += 1;
      lastTransitionFingerprint = fingerprint;
      return turn;
    },
    snapshot: () => state,
    recentTurns: () => Object.freeze([...turns]),
    issueSequence(): number {
      return ++asyncSequence;
    },
    isCurrentSequence(candidate: number): boolean {
      return candidate === asyncSequence;
    },
    observability(): ConversationObservabilitySnapshot {
      return Object.freeze({
        turnsCreated,
        duplicateAttempts,
        asyncSequence,
      });
    },
  });
}
