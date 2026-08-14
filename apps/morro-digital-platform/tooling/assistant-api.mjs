import {
  calculateTokenCostUsd,
  createProviderCostGovernor,
} from "./provider-governance.mjs";

const ASSISTANT_TIMEOUT_MS = 12_000;
const ASSISTANT_RATE_WINDOW_MS = 60_000;
const ASSISTANT_RATE_LIMIT = 30;
const MAX_BODY_BYTES = 64 * 1024;

const SUPPORTED_LANGUAGES = new Set(["pt", "en", "es", "he"]);
const ALLOWED_CATEGORIES = new Set([
  "beaches",
  "restaurants",
  "hotels",
  "shops",
  "transport",
  "attractions",
  "tours",
  "nightlife",
  "emergencies",
  "help",
]);

const ASSISTANT_SYSTEM_PROMPT = `Você é o assistente virtual do Morro Digital, guia de Morro de São Paulo e Cairu.
Responda no idioma solicitado e use somente informações que possam ser apresentadas com segurança.
Nunca invente horários, preços, telefones, condições de acessibilidade ou informações de emergência.
Quando não houver confirmação, informe que o dado precisa ser verificado.
Retorne exclusivamente JSON no formato:
{"text":"texto","intent":"identificador_curto","action":"show_category:categoria, show_place:nome ou null","options":["opção curta"],"confidence":0.0}`;

function safeString(value, maxLength) {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001f\u007f]/gu, " ")
    .trim()
    .slice(0, maxLength);
}

function positiveNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function sanitizeContext(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return {
    lastPlace: safeString(value.lastPlace, 120) || null,
    lastCategory: safeString(value.lastCategory, 50) || null,
    lastIntent: safeString(value.lastIntent, 50) || null,
  };
}

function sanitizeHistory(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(-6).flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const role = entry.role === "assistant" ? "assistant" : "user";
    const content = safeString(entry.content, 600);
    return content ? [{ role, content }] : [];
  });
}

async function readJsonBody(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error("request_body_too_large");
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function parseJsonObject(text) {
  const normalized = String(text || "")
    .trim()
    .replace(/^```(?:json)?\s*/iu, "")
    .replace(/\s*```$/u, "");
  return JSON.parse(normalized);
}

function normalizeProviderResponse(value) {
  const source = value && typeof value === "object" ? value : {};
  const text = safeString(source.text, 4_000);
  const intent = safeString(source.intent, 50).replace(
    /[^a-zA-Z0-9_:-]/gu,
    "_",
  );
  let action = typeof source.action === "string" ? source.action.trim() : null;

  if (action?.startsWith("show_category:")) {
    const category = action.slice("show_category:".length).trim();
    action = ALLOWED_CATEGORIES.has(category)
      ? `show_category:${category}`
      : null;
  } else if (action?.startsWith("show_place:")) {
    const place = safeString(action.slice("show_place:".length), 120);
    action = place ? `show_place:${place}` : null;
  } else {
    action = null;
  }

  const confidenceValue = Number(source.confidence);
  return {
    text,
    intent: intent || "llm_response",
    action,
    options: Array.isArray(source.options)
      ? source.options
          .slice(0, 6)
          .map((item) => safeString(item, 100))
          .filter(Boolean)
      : [],
    confidence: Number.isFinite(confidenceValue)
      ? Math.max(0, Math.min(1, confidenceValue))
      : 0.7,
  };
}

function sendJson(response, statusCode, payload, extraHeaders = {}) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  for (const [name, value] of Object.entries(extraHeaders)) {
    response.setHeader(name, value);
  }
  response.end(JSON.stringify(payload));
}

export function createAssistantApi({
  getEnvironmentValue,
  fetchImplementation = globalThis.fetch,
  now = Date.now,
  observeProviderEvent = (event) =>
    console.info(`[provider-observability] ${JSON.stringify(event)}`),
} = {}) {
  const rateBuckets = new Map();
  const environment =
    getEnvironmentValue ?? ((key) => String(process.env[key] ?? ""));
  const hardLimitConfirmed =
    environment("OPENAI_PROVIDER_HARD_LIMIT_CONFIRMED").trim().toLowerCase() ===
    "true";
  const inputUsdPerMillion = positiveNumber(
    environment("OPENAI_INPUT_USD_PER_1M_TOKENS"),
  );
  const outputUsdPerMillion = positiveNumber(
    environment("OPENAI_OUTPUT_USD_PER_1M_TOKENS"),
  );
  const costGovernor = createProviderCostGovernor({
    provider: "openai",
    dailyLimitUsd: environment("OPENAI_DAILY_COST_LIMIT_USD"),
    monthlyLimitUsd: environment("OPENAI_MONTHLY_COST_LIMIT_USD"),
    requestReserveUsd: environment("OPENAI_REQUEST_RESERVE_USD"),
    maxConcurrency: environment("OPENAI_MAX_CONCURRENCY") || 4,
    now,
    onEvent: observeProviderEvent,
  });

  function rateAllowed(request) {
    const timestamp = now();
    const key = request.socket.remoteAddress || "unknown";
    const bucket = rateBuckets.get(key);
    if (!bucket || bucket.resetAt <= timestamp) {
      rateBuckets.set(key, {
        count: 1,
        resetAt: timestamp + ASSISTANT_RATE_WINDOW_MS,
      });
      return { allowed: true, retryAfter: 0 };
    }

    bucket.count += 1;
    if (bucket.count <= ASSISTANT_RATE_LIMIT) {
      return { allowed: true, retryAfter: 0 };
    }

    return {
      allowed: false,
      retryAfter: Math.max(1, Math.ceil((bucket.resetAt - timestamp) / 1_000)),
    };
  }

  function observabilitySnapshot() {
    return Object.freeze({
      hardLimitConfirmed,
      pricingConfigured: Boolean(inputUsdPerMillion && outputUsdPerMillion),
      usage: costGovernor.snapshot(),
    });
  }

  return Object.freeze({
    observabilitySnapshot,
    matches(pathname) {
      return (
        pathname === "/api/ai/assistant/respond" ||
        pathname === "/api/assistant/respond"
      );
    },

    async handle(request, response) {
      if (request.method !== "POST") {
        sendJson(
          response,
          405,
          { error: "method_not_allowed" },
          { Allow: "POST" },
        );
        return;
      }

      const rate = rateAllowed(request);
      if (!rate.allowed) {
        sendJson(
          response,
          429,
          { error: "assistant_rate_limited" },
          { "Retry-After": String(rate.retryAfter) },
        );
        return;
      }

      const apiKey = environment("OPENAI_API_KEY").trim();
      if (!apiKey) {
        sendJson(response, 503, { error: "assistant_not_configured" });
        return;
      }
      if (
        !hardLimitConfirmed ||
        !inputUsdPerMillion ||
        !outputUsdPerMillion ||
        !costGovernor.configured
      ) {
        observeProviderEvent({
          type: "provider.billing_guard.denied",
          provider: "openai",
          at: new Date(now()).toISOString(),
          reason: "billing_guard_not_configured",
        });
        sendJson(response, 503, {
          error: "assistant_billing_guard_not_configured",
        });
        return;
      }

      try {
        const body = await readJsonBody(request);
        const input = safeString(body.input, 1_000);
        if (!input) {
          sendJson(response, 400, { error: "invalid_input" });
          return;
        }

        const lang = SUPPORTED_LANGUAGES.has(body.lang) ? body.lang : "pt";
        const userType = body.userType === "resident" ? "resident" : "tourist";
        const context = sanitizeContext(body.context);
        const history = sanitizeHistory(body.history);
        const model = environment("OPENAI_MODEL").trim() || "gpt-4o-mini";
        const budgetAttempt = costGovernor.reserve({ model, surface: "assistant" });
        if (!budgetAttempt.allowed) {
          const concurrencyLimited =
            budgetAttempt.reason === "concurrency_limit";
          sendJson(response, 429, {
            error: concurrencyLimited
              ? "assistant_concurrency_limited"
              : "assistant_budget_exhausted",
          });
          return;
        }

        const reservation = budgetAttempt.reservation;
        const controller = new AbortController();
        const timeout = setTimeout(
          () => controller.abort(),
          ASSISTANT_TIMEOUT_MS,
        );
        let reservationClosed = false;

        try {
          const upstream = await fetchImplementation(
            "https://api.openai.com/v1/chat/completions",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
              },
              body: JSON.stringify({
                model,
                messages: [
                  { role: "system", content: ASSISTANT_SYSTEM_PROMPT },
                  {
                    role: "system",
                    content: `Contexto validado: ${JSON.stringify({ lang, userType, context })}`,
                  },
                  ...history,
                  { role: "user", content: input },
                ],
                max_tokens: 600,
                temperature: 0.4,
                response_format: { type: "json_object" },
              }),
              signal: controller.signal,
            },
          );

          if (!upstream.ok) {
            costGovernor.release(reservation, {
              reason: "provider_http_error",
              statusCode: upstream.status,
            });
            reservationClosed = true;
            sendJson(response, upstream.status === 429 ? 429 : 502, {
              error: "assistant_provider_error",
            });
            return;
          }

          const data = await upstream.json();
          const providerUsage = data?.usage || {};
          const costUsd = calculateTokenCostUsd({
            promptTokens: providerUsage.prompt_tokens,
            completionTokens: providerUsage.completion_tokens,
            inputUsdPerMillion,
            outputUsdPerMillion,
          });
          costGovernor.settle(reservation, {
            costUsd,
            promptTokens: providerUsage.prompt_tokens,
            completionTokens: providerUsage.completion_tokens,
            totalTokens: providerUsage.total_tokens,
          });
          reservationClosed = true;

          const content = data?.choices?.[0]?.message?.content;
          const normalized = normalizeProviderResponse(
            parseJsonObject(content),
          );
          if (!normalized.text) throw new Error("assistant_invalid_response");
          sendJson(response, 200, normalized);
        } catch (error) {
          if (!reservationClosed) {
            costGovernor.release(reservation, {
              reason:
                error?.name === "AbortError"
                  ? "provider_timeout"
                  : "provider_request_failed",
            });
          }
          throw error;
        } finally {
          clearTimeout(timeout);
        }
      } catch (error) {
        sendJson(response, error?.name === "AbortError" ? 504 : 502, {
          error:
            error?.name === "AbortError"
              ? "assistant_timeout"
              : "assistant_request_failed",
        });
      }
    },
  });
}
