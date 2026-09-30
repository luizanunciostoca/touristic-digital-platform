import type { AssistantContextEnvelope } from "../context/context-envelope.js";
import type { AssistantLocale, Result, ToolEffect } from "../core/contracts.js";
import { ok } from "../core/contracts.js";
import type { EvidencePack } from "../knowledge/evidence.js";

export interface UserRequest {
  readonly text: string;
  readonly locale: AssistantLocale;
}

export interface RequestUnderstanding {
  readonly intent: string;
  readonly confidence: number;
  readonly entities: Readonly<Record<string, unknown>>;
  readonly requiresGrounding: boolean;
}

export interface PlanStep {
  readonly id: string;
  readonly tool: string;
  readonly version: string;
  readonly input: unknown;
  readonly dependencies: readonly string[];
  readonly effect: ToolEffect;
  readonly status: "pending" | "ready";
}

export interface AssistantPlan {
  readonly goal: string;
  readonly steps: readonly PlanStep[];
  readonly requiredEvidence: readonly string[];
  readonly requiresConfirmation: boolean;
  readonly fallbackStrategy: string;
}

export interface AssistantResponseDraft {
  readonly message: string;
  readonly options?: readonly string[];
}

export interface AssistantReasoningProvider {
  understand(
    request: UserRequest,
    context: Readonly<AssistantContextEnvelope>,
  ): Promise<Result<RequestUnderstanding>>;
  plan(
    request: UserRequest,
    understanding: RequestUnderstanding,
    context: Readonly<AssistantContextEnvelope>,
    availableTools: readonly string[],
  ): Promise<Result<AssistantPlan>>;
  compose(
    request: UserRequest,
    plan: AssistantPlan,
    evidence: EvidencePack | null,
    context: Readonly<AssistantContextEnvelope>,
  ): Promise<Result<AssistantResponseDraft>>;
}

export class MockReasoningProvider implements AssistantReasoningProvider {
  understand(request: UserRequest): Promise<Result<RequestUnderstanding>> {
    const text = request.text.toLowerCase();
    let intent = "general";
    if (/restaurante|restaurant|מסעד|restauran/u.test(text)) intent = "restaurant_search";
    else if (/abert|open|abier|פתוח/u.test(text)) intent = "hours";
    else if (/leve|navigate|route|ruta|llév|ניווט/u.test(text)) intent = "navigate";
    else if (/avise|notify|avís|התרא/u.test(text)) intent = "notification";
    else if (/festa|party|evento|event|fiesta|מסיב/u.test(text)) intent = "event";
    else if (/quanto|preço|price|cost|cuesta|מחיר/u.test(text)) intent = "price";
    else if (/ingresso|ticket|entrada|כרטיס/u.test(text)) intent = "ticket";
    else if (/confirm|confirmo|sí|sim|מאשר/u.test(text)) intent = "confirm";
    else if (/onde paramos|where were|donde qued|איפה עצר/u.test(text)) intent = "resume";
    else if (/chov|rain|lluv|גשם/u.test(text)) intent = "weather_activity";

    return Promise.resolve(
      ok({
        intent,
        confidence: intent === "general" ? 0.55 : 0.95,
        entities: {},
        requiresGrounding: [
          "restaurant_search",
          "hours",
          "event",
          "price",
          "ticket",
          "weather_activity",
        ].includes(intent),
      }),
    );
  }

  plan(
    request: UserRequest,
    understanding: RequestUnderstanding,
    context: Readonly<AssistantContextEnvelope>,
    availableTools: readonly string[],
  ): Promise<Result<AssistantPlan>> {
    const has = (name: string) => availableTools.includes(name);
    const steps: PlanStep[] = [];
    const add = (tool: string, input: unknown, effect: ToolEffect = "read") => {
      if (has(tool))
        steps.push({
          id: "step-" + String(steps.length + 1),
          tool,
          version: "1",
          input,
          dependencies: [],
          effect,
          status: "ready",
        });
    };
    const loc = context.location
      ? { latitude: context.location.latitude, longitude: context.location.longitude }
      : null;

    switch (understanding.intent) {
      case "restaurant_search":
        if (loc && has("place.nearby")) {
          add("place.nearby", { ...loc, radiusMeters: 3000, category: "restaurants" });
        } else {
          add("place.search", { query: "romântico restaurante" });
        }
        break;
      case "hours":
        add("place.hours", { id: context.destination.destinationId ?? "restaurant-romantic" });
        break;
      case "navigate":
        add(
          "navigation.prepare",
          { destinationId: context.destination.destinationId ?? "restaurant-romantic" },
          "prepare",
        );
        break;
      case "event":
        add("content.events", {});
        add("ticketing.events", {});
        break;
      case "price":
        add("commerce.offers", {});
        break;
      case "ticket":
        add("ticketing.prepare_order", { eventId: "party-today", quantity: 2 }, "prepare");
        break;
      case "notification":
        add("notifications.prepare_subscribe", { id: "party-today" }, "prepare");
        break;
      case "weather_activity":
        if (loc) add("weather.current", loc);
        add("content.search", { query: "atividade coberta" });
        break;
      default:
        break;
    }

    const requiredEvidence =
      understanding.intent === "hours"
        ? ["place.hours"]
        : understanding.intent === "event"
          ? ["content.events"]
          : understanding.intent === "price"
            ? ["commerce.offers"]
            : understanding.intent === "weather_activity"
              ? ["weather.current"]
              : understanding.intent === "restaurant_search"
                ? [loc && has("place.nearby") ? "place.nearby" : "place.search"]
                : [];

    return Promise.resolve(
      ok({
        goal: understanding.intent,
        steps,
        requiredEvidence,
        requiresConfirmation: steps.some((step) => step.effect === "execute"),
        fallbackStrategy: "deterministic-safe-fallback",
      }),
    );
  }

  compose(
    request: UserRequest,
    plan: AssistantPlan,
    evidence: EvidencePack | null,
  ): Promise<Result<AssistantResponseDraft>> {
    if (evidence && evidence.missingFacts.length > 0) {
      return Promise.resolve(ok({ message: fallbackMessage(request.locale) }));
    }
    const prefix: Record<AssistantLocale, string> = {
      pt: "Resultado verificado",
      en: "Verified result",
      es: "Resultado verificado",
      he: "תוצאה מאומתת",
    };
    return Promise.resolve(
      ok({
        message: prefix[request.locale] + ": " + plan.goal,
        options: plan.steps.map((step) => step.tool),
      }),
    );
  }
}

function fallbackMessage(locale: AssistantLocale): string {
  const values: Record<AssistantLocale, string> = {
    pt: "Não tenho evidência atual suficiente para afirmar isso.",
    en: "I do not have enough current evidence to state that.",
    es: "No tengo evidencia actual suficiente para afirmarlo.",
    he: "אין לי מספיק מידע עדכני ומאומת כדי לקבוע זאת.",
  };
  return values[locale];
}
