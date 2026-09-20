import type {
  AssistantDialogIntentHandler,
  AssistantDialogResponse,
} from "@touristic/assistant";

const LLM_ENDPOINT = "/api/ai/assistant/respond";
const LLM_TIMEOUT_MS = 12_000;
const MAX_HISTORY_ENTRIES = 6;

interface AssistantLlmPayload {
  input: string;
  lang: "pt" | "en" | "es" | "he";
  userType: "tourist" | "resident";
  context: {
    lastPlace: string | null;
    lastCategory: string | null;
    lastIntent: string | null;
    activeTour: {
      tourId: string;
      stage: "intro" | "list" | "stop" | "finale";
      currentStopIndex: number;
      totalStops: number;
    } | null;
    navigationState: {
      active: boolean;
      destination: string | null;
      phase:
        | "idle"
        | "initializing"
        | "route_ready"
        | "active"
        | "recalculating"
        | "ui_ready"
        | "arrived"
        | "failed"
        | "ended";
    };
  };
  history: Array<{ role: "user" | "assistant"; content: string }>;
}

interface AssistantLlmResponsePayload {
  text?: unknown;
  intent?: unknown;
  action?: unknown;
  options?: unknown;
  confidence?: unknown;
}

function plainText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  const withoutControls = Array.from(value)
    .filter((character) => character >= " " && character !== "\u007f")
    .join("");
  return withoutControls
    .replace(/<[^>]*>/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizeLanguage(value: unknown): AssistantLlmPayload["lang"] {
  return value === "en" || value === "es" || value === "he" ? value : "pt";
}

function normalizeTourContext(
  value: unknown,
): AssistantLlmPayload["context"]["activeTour"] {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const tourId = plainText(source.tourId, 120);
  const stage = source.stage;
  const currentStopIndex = Number(source.currentStopIndex);
  const totalStops = Number(source.totalStops);
  if (
    !tourId ||
    (stage !== "intro" &&
      stage !== "list" &&
      stage !== "stop" &&
      stage !== "finale") ||
    !Number.isInteger(currentStopIndex) ||
    currentStopIndex < 0 ||
    !Number.isInteger(totalStops) ||
    totalStops < 1 ||
    currentStopIndex >= totalStops
  ) {
    return null;
  }
  return { tourId, stage, currentStopIndex, totalStops };
}

function normalizeNavigationContext(
  value: unknown,
): AssistantLlmPayload["context"]["navigationState"] {
  const fallback = {
    active: false,
    destination: null,
    phase: "idle" as const,
  };
  if (!value || typeof value !== "object") return fallback;
  const source = value as Record<string, unknown>;
  const phase = source.phase;
  if (
    phase !== "idle" &&
    phase !== "initializing" &&
    phase !== "route_ready" &&
    phase !== "active" &&
    phase !== "recalculating" &&
    phase !== "ui_ready" &&
    phase !== "arrived" &&
    phase !== "failed" &&
    phase !== "ended"
  ) {
    return fallback;
  }
  return {
    active: source.active === true,
    destination: plainText(source.destination, 160) || null,
    phase,
  };
}

function normalizeAction(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const action = value.trim();
  if (/^show_category:[a-z_]+$/iu.test(action)) return action;
  if (action.startsWith("show_place:")) {
    const place = plainText(action.slice("show_place:".length), 120);
    return place ? `show_place:${place}` : null;
  }
  return null;
}

function normalizeResponse(
  payload: AssistantLlmResponsePayload,
): AssistantDialogResponse | null {
  const text = plainText(payload.text, 4_000);
  if (!text) return null;
  const confidence = Number(payload.confidence);
  const responseOptions = Array.isArray(payload.options)
    ? payload.options
        .slice(0, 6)
        .map((item) => plainText(item, 100))
        .filter(Boolean)
        .map((label) => ({ label, value: label }))
    : undefined;

  return {
    text,
    ...(responseOptions && responseOptions.length > 0
      ? { options: responseOptions }
      : {}),
    metadata: {
      domain: "llm",
      state: "resolved",
      intent:
        plainText(payload.intent, 50).replace(/[^a-zA-Z0-9_:-]/gu, "_") ||
        "llm_response",
      action: normalizeAction(payload.action),
      confidence: Number.isFinite(confidence)
        ? Math.max(0, Math.min(1, confidence))
        : 0.7,
      fromLLM: true,
    },
  };
}

function createPayload(
  request: Parameters<AssistantDialogIntentHandler>[0],
): AssistantLlmPayload {
  const history = request.context.history
    .slice(-MAX_HISTORY_ENTRIES)
    .flatMap((entry) => {
      const values: AssistantLlmPayload["history"] = [];
      const input = plainText(entry.input, 600);
      const response = plainText(entry.response, 600);
      if (input) values.push({ role: "user", content: input });
      if (response) values.push({ role: "assistant", content: response });
      return values;
    })
    .slice(-MAX_HISTORY_ENTRIES);

  return {
    input: plainText(request.input, 1_000),
    lang: normalizeLanguage(request.intent.entities.language),
    userType: "tourist",
    context: {
      lastPlace: plainText(request.context.lastPlace, 120) || null,
      lastCategory: plainText(request.context.lastCategory, 50) || null,
      lastIntent: plainText(request.context.lastIntent, 50) || null,
      activeTour: normalizeTourContext(request.context.activeTour),
      navigationState: normalizeNavigationContext(
        request.context.navigationState,
      ),
    },
    history,
  };
}

export interface AssistantLlmAdapterOptions {
  readonly fetch?: typeof globalThis.fetch;
  readonly endpoint?: string;
}

export function createAssistantLlmHandler(
  options: AssistantLlmAdapterOptions = {},
): AssistantDialogIntentHandler {
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  const endpoint = options.endpoint ?? LLM_ENDPOINT;

  return async (request) => {
    const payload = createPayload(request);
    if (!payload.input) return null;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
    try {
      const response = await fetchImplementation(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!response.ok) return null;
      return normalizeResponse(
        (await response.json()) as AssistantLlmResponsePayload,
      );
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  };
}
