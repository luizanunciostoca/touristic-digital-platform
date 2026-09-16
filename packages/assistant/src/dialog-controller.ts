import type {
  AssistantAwaitingState,
  AssistantContext,
} from "./context-manager.js";
import { analyzeAssistantIntent } from "./intent-engine.js";
import type { AssistantIntentResult } from "./intent-engine.js";
import { assistantRequiresLLM } from "./llm-policy.js";

export interface AssistantDialogOption {
  label: string;
  value: string;
}

export interface AssistantDialogResponse {
  text: string;
  options?: AssistantDialogOption[];
  metadata?: Record<string, unknown>;
}

export interface AssistantDialogContextPort {
  getContext(): AssistantContext;
  updateContext(updates: Partial<AssistantContext>): void;
  addToHistory(entry: {
    input?: string;
    response?: string;
    timestamp?: number;
  }): void;
}

export interface AssistantDialogProfilePort {
  recordInteraction(
    input: string,
    category?: string | null,
    place?: { name: string; category?: string | null } | null,
  ): void;
}

export interface AssistantDialogIntentHandlerContext {
  input: string;
  intent: AssistantIntentResult;
  context: AssistantContext;
}

export type AssistantDialogIntentHandler = (
  request: AssistantDialogIntentHandlerContext,
) => Promise<AssistantDialogResponse | null> | AssistantDialogResponse | null;

export interface AssistantDialogControllerOptions {
  context: AssistantDialogContextPort;
  profile?: AssistantDialogProfilePort;
  handlers?: Partial<
    Record<AssistantIntentResult["intent"], AssistantDialogIntentHandler>
  >;
  llm?: AssistantDialogIntentHandler;
  defaultResponse?: () => AssistantDialogResponse;
  errorResponse?: () => AssistantDialogResponse;
}

const CATEGORY_BY_INTENT: Partial<
  Record<AssistantIntentResult["intent"], string>
> = {
  category_beaches: "beaches",
  category_restaurants: "restaurants",
  category_hotels: "hotels",
  category_shops: "shops",
  category_attractions: "attractions",
  category_nightlife: "nightlife",
  category_tours: "tours",
  category_emergencies: "emergencies",
  transport: "transport",
};

const PLACE_AWAITING_INTENTS = new Set<AssistantIntentResult["intent"]>([
  "photos",
  "price",
  "hours",
  "open_now",
  "more_info",
  "navigate",
  "favorites",
]);

const CATEGORY_AWAITING_INTENTS = new Set<AssistantIntentResult["intent"]>([
  "nearby",
]);

const AWAITING_INTERRUPT_INTENTS = new Set<AssistantIntentResult["intent"]>([
  "cancel_navigation",
  "deny",
  "greeting",
  "thanks",
  "help",
  "weather",
  "my_location",
]);

function defaultDialogResponse(): AssistantDialogResponse {
  return { text: "Como posso ajudar?" };
}

function defaultErrorResponse(): AssistantDialogResponse {
  return { text: "Desculpe, ocorreu um erro ao processar sua solicitação." };
}

function toIntentContext(context: AssistantContext) {
  return {
    lastIntent: context.lastIntent,
    lastPlace: context.lastPlace,
    lastCategory: context.lastCategory,
    awaiting: context.awaiting,
  };
}

function requestedAwaitingIntent(
  awaiting: AssistantAwaitingState | null,
  allowed: ReadonlySet<AssistantIntentResult["intent"]>,
): AssistantIntentResult["intent"] | null {
  const candidate = awaiting?.intent;
  if (typeof candidate !== "string") return null;
  return allowed.has(candidate as AssistantIntentResult["intent"])
    ? (candidate as AssistantIntentResult["intent"])
    : null;
}

function resolveIntentForContext(
  input: string,
  context: AssistantContext,
): AssistantIntentResult {
  const analyzed = analyzeAssistantIntent(input, toIntentContext(context));
  const awaiting = context.awaiting;
  if (!awaiting?.type || AWAITING_INTERRUPT_INTENTS.has(analyzed.intent)) {
    return analyzed;
  }

  const inputLooksLikeExplicitCategory =
    analyzed.intent.startsWith("category_") && !analyzed.entities.place;

  if (awaiting.type === "awaiting_destination") {
    if (inputLooksLikeExplicitCategory) return analyzed;
    return {
      ...analyzed,
      intent: "navigate",
      confidence: Math.max(analyzed.confidence, 0.95),
      entities: { ...analyzed.entities, place: input.trim() },
      requiresLLM: false,
      contextual: true,
    };
  }

  if (awaiting.type === "awaiting_place") {
    const requested = requestedAwaitingIntent(awaiting, PLACE_AWAITING_INTENTS);
    if (!requested || inputLooksLikeExplicitCategory) return analyzed;
    return {
      ...analyzed,
      intent: requested,
      confidence: Math.max(analyzed.confidence, 0.95),
      entities: { ...analyzed.entities, place: input.trim() },
      requiresLLM: false,
      contextual: true,
    };
  }

  if (awaiting.type === "awaiting_category") {
    const requested = requestedAwaitingIntent(
      awaiting,
      CATEGORY_AWAITING_INTENTS,
    );
    const category =
      analyzed.entities.category ?? CATEGORY_BY_INTENT[analyzed.intent] ?? null;
    if (!requested || !category) return analyzed;
    return {
      ...analyzed,
      intent: requested,
      confidence: Math.max(analyzed.confidence, 0.95),
      entities: { ...analyzed.entities, category },
      requiresLLM: false,
      contextual: true,
    };
  }

  return analyzed;
}

function deriveContextUpdate(
  intent: AssistantIntentResult,
): Partial<AssistantContext> {
  const category =
    intent.entities.category ?? CATEGORY_BY_INTENT[intent.intent] ?? null;
  const updates: Partial<AssistantContext> = {
    lastIntent: intent.intent,
    lastModifiers: intent.modifiers,
  };

  if (category) updates.lastCategory = category;
  if (intent.entities.place) updates.lastPlace = intent.entities.place;

  return updates;
}

function responseAwaitingState(
  response: AssistantDialogResponse,
  intent: AssistantIntentResult,
): AssistantAwaitingState | null {
  const metadata = response.metadata;
  if (!metadata) return null;

  if (metadata.state === "awaiting_place") {
    const operation = metadata.operation;
    return {
      type: "awaiting_place",
      intent: intent.intent,
      ...(operation === "add" || operation === "remove" ? { operation } : {}),
    };
  }
  if (metadata.state === "awaiting_category") {
    return { type: "awaiting_category", intent: intent.intent };
  }
  if (metadata.navigation === "awaiting_destination") {
    return { type: "awaiting_destination", intent: "navigate" };
  }
  return null;
}

export function createAssistantDialogController(
  options: AssistantDialogControllerOptions,
) {
  const defaultResponse = options.defaultResponse ?? defaultDialogResponse;
  const errorResponse = options.errorResponse ?? defaultErrorResponse;

  return {
    async processUserInput(input: string): Promise<AssistantDialogResponse> {
      if (!input || typeof input !== "string") return defaultResponse();

      try {
        const context = options.context.getContext();
        const intent = resolveIntentForContext(input, context);
        const category =
          intent.entities.category ?? CATEGORY_BY_INTENT[intent.intent] ?? null;
        const place = intent.entities.place
          ? { name: intent.entities.place, category }
          : null;

        if (place) {
          options.profile?.recordInteraction(input, category, place);
        } else {
          options.profile?.recordInteraction(input, category);
        }

        const request: AssistantDialogIntentHandlerContext = {
          input,
          intent,
          context,
        };

        let response: AssistantDialogResponse | null = null;
        const localHandler = options.handlers?.[intent.intent];
        if (localHandler) response = await localHandler(request);

        if (!response && assistantRequiresLLM(input, intent) && options.llm) {
          response = await options.llm(request);
        }

        if (!response) response = defaultResponse();

        const awaiting = responseAwaitingState(response, intent);
        options.context.updateContext({
          ...deriveContextUpdate(intent),
          ...(awaiting
            ? { awaiting }
            : context.awaiting
              ? { awaiting: null }
              : {}),
        });
        options.context.addToHistory({ input, response: response.text });

        return response;
      } catch {
        return errorResponse();
      }
    },
  };
}
