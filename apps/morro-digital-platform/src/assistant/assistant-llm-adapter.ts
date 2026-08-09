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
  return value
    .replace(/<[^>]*>/gu, " ")
    .replace(/[\u0000-\u001f\u007f]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizeLanguage(value: unknown): AssistantLlmPayload["lang"] {
  return value === "en" || value === "es" || value === "he" ? value : "pt";
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
    lang: normalizeLanguage(request.intent.entities.lang),
    userType: "tourist",
    context: {
      lastPlace: plainText(request.context.lastPlace, 120) || null,
      lastCategory: plainText(request.context.lastCategory, 50) || null,
      lastIntent: plainText(request.context.lastIntent, 50) || null,
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
