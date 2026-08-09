import type { AssistantContext } from "./context-manager.js";
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
        const intent = analyzeAssistantIntent(input, toIntentContext(context));
        const category =
          intent.entities.category ?? CATEGORY_BY_INTENT[intent.intent] ?? null;

        options.profile?.recordInteraction(input, category);

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

        options.context.updateContext(deriveContextUpdate(intent));
        options.context.addToHistory({ input, response: response.text });

        return response;
      } catch {
        return errorResponse();
      }
    },
  };
}
