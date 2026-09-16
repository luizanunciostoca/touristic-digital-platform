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
  "confirm",
  "deny",
  "navigate",
  "photos",
  "price",
  "hours",
  "open_now",
  "more_info",
  "nearby",
  "favorites",
  "recommendation",
  "compare",
  "category_filtered",
  "practical_tips",
  "cultural_history",
  "transport",
  "accessibility",
  "greeting",
  "thanks",
  "help",
  "weather",
  "my_location",
]);

const NAVIGATION_TERMINAL_STATES = new Set([
  "started",
  "declined",
  "cancelled",
  "destination_not_found",
]);

const FALLBACK_ESCALATION_THRESHOLD = 3;

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

function preservePlaceCasingFromInput(input: string, place: string): string {
  const source = input.toLocaleLowerCase();
  const target = place.toLocaleLowerCase();
  const index = source.indexOf(target);
  return index >= 0 ? input.slice(index, index + place.length) : place;
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
  if (metadata.navigation === "awaiting_confirmation") {
    return { type: "confirmar_navegacao", intent: "navigate" };
  }
  return null;
}

function isPendingRoute(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.name === "string" &&
    candidate.name.trim().length > 0 &&
    typeof candidate.latitude === "number" &&
    Number.isFinite(candidate.latitude) &&
    candidate.latitude >= -90 &&
    candidate.latitude <= 90 &&
    typeof candidate.longitude === "number" &&
    Number.isFinite(candidate.longitude) &&
    candidate.longitude >= -180 &&
    candidate.longitude <= 180
  );
}

function deriveResponseContextUpdate(
  response: AssistantDialogResponse,
  intent: AssistantIntentResult,
  context: AssistantContext,
): Partial<AssistantContext> {
  const updates = deriveContextUpdate(intent);
  const awaiting = responseAwaitingState(response, intent);
  const metadata = response.metadata;

  if (awaiting) {
    updates.awaiting = awaiting;
  } else if (context.awaiting) {
    updates.awaiting = null;
  }

  if (
    metadata?.navigation === "awaiting_confirmation" &&
    isPendingRoute(metadata.pendingRoute)
  ) {
    updates.pendingRoute = metadata.pendingRoute;
    updates.selectedDestination = metadata.pendingRoute;
  } else if (
    typeof metadata?.navigation === "string" &&
    NAVIGATION_TERMINAL_STATES.has(metadata.navigation)
  ) {
    updates.pendingRoute = null;
    if (metadata.navigation !== "started") {
      updates.selectedDestination = null;
    }
  }

  return updates;
}

function guidedFallbackResponse(
  intent: AssistantIntentResult,
): AssistantDialogResponse {
  const language = intent.entities.language ?? "pt";
  const copy = {
    pt: {
      text: "Estou tendo dificuldade para entender. Posso mostrar a ajuda ou algumas opções principais.",
      help: "Ajuda",
      beaches: "Praias",
      restaurants: "Restaurantes",
    },
    en: {
      text: "I'm having trouble understanding. I can show help or some main options.",
      help: "Help",
      beaches: "Beaches",
      restaurants: "Restaurants",
    },
    es: {
      text: "Estoy teniendo dificultad para entender. Puedo mostrar ayuda o algunas opciones principales.",
      help: "Ayuda",
      beaches: "Playas",
      restaurants: "Restaurantes",
    },
    he: {
      text: "אני מתקשה להבין. אפשר לפתוח עזרה או כמה אפשרויות עיקריות.",
      help: "עזרה",
      beaches: "חופים",
      restaurants: "מסעדות",
    },
  } as const;
  const localized = copy[language];
  return {
    text: localized.text,
    options: [
      { label: localized.help, value: localized.help },
      { label: localized.beaches, value: localized.beaches },
      { label: localized.restaurants, value: localized.restaurants },
    ],
    metadata: { domain: "fallback", state: "escalated" },
  };
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
          ? {
              name: preservePlaceCasingFromInput(input, intent.entities.place),
              category,
            }
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

        let fallbackCount = 0;
        if (!response) {
          if (intent.intent === "unknown" || intent.intent === "place_search") {
            if (context.fallbackCount >= FALLBACK_ESCALATION_THRESHOLD) {
              response = guidedFallbackResponse(intent);
              fallbackCount = 0;
            } else {
              response = defaultResponse();
              fallbackCount = context.fallbackCount + 1;
            }
          } else {
            response = defaultResponse();
          }
        }

        options.context.updateContext({
          ...deriveResponseContextUpdate(response, intent, context),
          fallbackCount,
        });
        options.context.addToHistory({ input, response: response.text });

        return response;
      } catch {
        return errorResponse();
      }
    },
  };
}
