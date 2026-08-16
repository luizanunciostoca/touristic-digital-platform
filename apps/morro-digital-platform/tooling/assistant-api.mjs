import { randomUUID } from "node:crypto";

import {
  calculateTokenCostUsd,
  createJsonFileGovernanceStateStore,
  createProviderCostGovernor,
} from "./provider-governance.mjs";

const ASSISTANT_TIMEOUT_MS = 12_000;
const ASSISTANT_RATE_WINDOW_MS = 60_000;
const ASSISTANT_RATE_LIMIT = 30;
const MAX_BODY_BYTES = 64 * 1024;
const ASSISTANT_MAX_OUTPUT_TOKENS = 600;
const ASSISTANT_CONSERVATIVE_PROMPT_TOKEN_CEILING = MAX_BODY_BYTES * 2;

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

function positiveInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function roundUsdUp(value) {
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.ceil(value * 1_000_000) / 1_000_000;
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
  governanceStateStore,
  createRequestId = randomUUID,
} = {}) {
  const rateBuckets = new Map();
  const environment =
    getEnvironmentValue ?? ((key) => String(process.env[key] ?? ""));
  const hardLimitConfirmed =
    environment("OPENAI_PROVIDER_HARD_LIMIT_CONFIRMED").trim().toLowerCase() ===
    "true";
  const model = environment("OPENAI_MODEL").trim();
  const pricingModel = environment("OPENAI_PRICING_MODEL").trim();
  const pricingModelMatches = Boolean(model && pricingModel === model);
  const inputUsdPerMillion = positiveNumber(
    environment("OPENAI_INPUT_USD_PER_1M_TOKENS"),
  );
  const outputUsdPerMillion = positiveNumber(
    environment("OPENAI_OUTPUT_USD_PER_1M_TOKENS"),
  );
  const pricingConfigured = Boolean(
    pricingModelMatches && inputUsdPerMillion && outputUsdPerMillion,
  );
  const configuredRequestReserveUsd = positiveNumber(
    environment("OPENAI_REQUEST_RESERVE_USD"),
  );
  const minimumRequestReserveUsd = roundUsdUp(
    calculateTokenCostUsd({
      promptTokens: ASSISTANT_CONSERVATIVE_PROMPT_TOKEN_CEILING,
      completionTokens: ASSISTANT_MAX_OUTPUT_TOKENS,
      inputUsdPerMillion,
      outputUsdPerMillion,
    }),
  );
  const requestReserveAdequate = Boolean(
    configuredRequestReserveUsd &&
    minimumRequestReserveUsd &&
    configuredRequestReserveUsd >= minimumRequestReserveUsd,
  );
  const runtimeReplicaCount = positiveInteger(
    environment("OPENAI_RUNTIME_REPLICA_COUNT"),
  );
  const runtimeTopologySafe = runtimeReplicaCount === 1;
  const stateFile = environment("OPENAI_GOVERNANCE_STATE_FILE").trim();
  const resolvedGovernanceStateStore =
    governanceStateStore ??
    (stateFile ? createJsonFileGovernanceStateStore(stateFile) : null);
  const costGovernor = createProviderCostGovernor({
    provider: "openai",
    dailyLimitUsd: environment("OPENAI_DAILY_COST_LIMIT_USD"),
    monthlyLimitUsd: environment("OPENAI_MONTHLY_COST_LIMIT_USD"),
    requestReserveUsd: environment("OPENAI_REQUEST_RESERVE_USD"),
    maxConcurrency: environment("OPENAI_MAX_CONCURRENCY"),
    now,
    onEvent: observeProviderEvent,
    stateStore: resolvedGovernanceStateStore,
    requirePersistentState: true,
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
      model: model || null,
      pricingModel: pricingModel || null,
      pricingConfigured,
      pricingModelMatches,
      configuredRequestReserveUsd,
      minimumRequestReserveUsd,
      requestReserveAdequate,
      conservativePromptTokenCeiling:
        ASSISTANT_CONSERVATIVE_PROMPT_TOKEN_CEILING,
      maxOutputTokens: ASSISTANT_MAX_OUTPUT_TOKENS,
      runtimeReplicaCount,
      runtimeTopologySafe,
      persistentGovernanceConfigured: Boolean(resolvedGovernanceStateStore),
      usage: costGovernor.snapshot(),
    });
  }

  function observeProviderFailure(reason, statusCode, metadata = {}) {
    observeProviderEvent({
      type: "provider.request.failed",
      provider: "openai",
      at: new Date(now()).toISOString(),
      reason,
      ...(Number.isInteger(statusCode) ? { statusCode } : {}),
      metadata,
    });
  }

  function billingGuardReason(persistenceUnavailable) {
    if (persistenceUnavailable) return "governance_state_unavailable";
    if (!hardLimitConfirmed) return "provider_hard_limit_not_confirmed";
    if (!model) return "model_not_configured";
    if (!pricingModel) return "pricing_model_not_configured";
    if (!pricingModelMatches) return "pricing_model_mismatch";
    if (!inputUsdPerMillion || !outputUsdPerMillion) {
      return "pricing_rates_not_configured";
    }
    if (!configuredRequestReserveUsd) return "request_reserve_not_configured";
    if (!requestReserveAdequate) return "request_reserve_below_runtime_floor";
    return "billing_guard_not_configured";
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
      const correlationId = createRequestId();
      response.setHeader("X-Request-ID", correlationId);

      let clientDisconnected = Boolean(request.aborted);
      let abortProviderRequest = () => {};
      const markClientDisconnected = () => {
        if (clientDisconnected) return;
        clientDisconnected = true;
        abortProviderRequest("client_disconnected");
      };

      if (typeof request.once === "function") {
        request.once("aborted", markClientDisconnected);
      }
      if (typeof response.once === "function") {
        response.once("close", () => {
          if (response.writableEnded === false) markClientDisconnected();
        });
      }

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

      const requestMetadata = Object.freeze({
        correlationId,
        model: model || "unconfigured",
        surface: "assistant",
      });

      if (!runtimeTopologySafe) {
        observeProviderEvent({
          type: "provider.runtime_guard.denied",
          provider: "openai",
          at: new Date(now()).toISOString(),
          reason: runtimeReplicaCount
            ? "distributed_governance_required"
            : "runtime_replica_count_not_configured",
          metadata: requestMetadata,
        });
        sendJson(response, 503, {
          error: "assistant_runtime_governance_unsafe",
        });
        return;
      }

      if (
        !hardLimitConfirmed ||
        !pricingConfigured ||
        !requestReserveAdequate ||
        !costGovernor.configured
      ) {
        const persistence = costGovernor.snapshot().persistence;
        const persistenceUnavailable =
          persistence.required &&
          (!persistence.configured || !persistence.healthy);
        observeProviderEvent({
          type: "provider.billing_guard.denied",
          provider: "openai",
          at: new Date(now()).toISOString(),
          reason: billingGuardReason(persistenceUnavailable),
          configuredRequestReserveUsd,
          minimumRequestReserveUsd,
          metadata: requestMetadata,
        });
        sendJson(response, 503, {
          error: persistenceUnavailable
            ? "assistant_governance_state_unavailable"
            : "assistant_billing_guard_not_configured",
        });
        return;
      }

      try {
        let body;
        try {
          body = await readJsonBody(request);
        } catch (error) {
          if (clientDisconnected || request.aborted) return;
          if (error?.message === "request_body_too_large") {
            sendJson(response, 413, { error: "assistant_request_too_large" });
            return;
          }
          if (error instanceof SyntaxError) {
            sendJson(response, 400, { error: "assistant_invalid_json" });
            return;
          }
          throw error;
        }

        if (clientDisconnected || request.aborted) {
          observeProviderEvent({
            type: "provider.request.cancelled",
            provider: "openai",
            at: new Date(now()).toISOString(),
            reason: "client_disconnected_before_provider",
            metadata: requestMetadata,
          });
          return;
        }

        const input = safeString(body.input, 1_000);
        if (!input) {
          sendJson(response, 400, { error: "invalid_input" });
          return;
        }

        const lang = SUPPORTED_LANGUAGES.has(body.lang) ? body.lang : "pt";
        const userType = body.userType === "resident" ? "resident" : "tourist";
        const context = sanitizeContext(body.context);
        const history = sanitizeHistory(body.history);
        const budgetAttempt = costGovernor.reserve(requestMetadata);
        if (!budgetAttempt.allowed) {
          const concurrencyLimited =
            budgetAttempt.reason === "concurrency_limit";
          const persistenceUnavailable = [
            "state_persistence_failed",
            "state_persistence_unavailable",
          ].includes(budgetAttempt.reason);
          sendJson(response, persistenceUnavailable ? 503 : 429, {
            error: persistenceUnavailable
              ? "assistant_governance_state_unavailable"
              : concurrencyLimited
                ? "assistant_concurrency_limited"
                : "assistant_budget_exhausted",
          });
          return;
        }

        const reservation = budgetAttempt.reservation;
        const controller = new AbortController();
        let abortReason = null;
        abortProviderRequest = (reason) => {
          if (controller.signal.aborted) return;
          abortReason = reason;
          controller.abort();
        };
        if (clientDisconnected || request.aborted) {
          abortProviderRequest("client_disconnected");
        }
        const timeout = setTimeout(
          () => abortProviderRequest("provider_timeout"),
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
                "X-Client-Request-Id": correlationId,
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
                max_tokens: ASSISTANT_MAX_OUTPUT_TOKENS,
                temperature: 0.4,
                response_format: { type: "json_object" },
              }),
              signal: controller.signal,
            },
          );

          if (!upstream.ok) {
            observeProviderFailure(
              "provider_http_error",
              upstream.status,
              requestMetadata,
            );
            costGovernor.settle(reservation, {});
            reservationClosed = true;
            if (!clientDisconnected) {
              sendJson(response, upstream.status === 429 ? 429 : 502, {
                error: "assistant_provider_error",
              });
            }
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
          if (!clientDisconnected) sendJson(response, 200, normalized);
        } catch (error) {
          if (!reservationClosed) {
            observeProviderFailure(
              abortReason === "client_disconnected"
                ? "client_disconnected"
                : abortReason === "provider_timeout" ||
                    error?.name === "AbortError"
                  ? "provider_timeout"
                  : "provider_request_failed",
              undefined,
              requestMetadata,
            );
            costGovernor.settle(reservation, {});
            reservationClosed = true;
          }
          if (abortReason === "client_disconnected" || clientDisconnected) {
            return;
          }
          if (abortReason === "provider_timeout") {
            const timeoutError = new Error("assistant_timeout");
            timeoutError.name = "AbortError";
            throw timeoutError;
          }
          throw error;
        } finally {
          abortProviderRequest = () => {};
          clearTimeout(timeout);
        }
      } catch (error) {
        if (clientDisconnected) return;
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
