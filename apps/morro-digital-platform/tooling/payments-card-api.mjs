import { randomUUID } from "node:crypto";

import {
  MySqlPaymentRepository,
  applyFinancialM145Schema,
  createFinancialMySqlPoolFromEnvironment,
} from "@touristic/financial-server";
import { createMercadoPagoCardPaymentProviderFromEnvironment } from "@touristic/financial-server/mercado-pago-card-payment";
import {
  CardPaymentHttpTransport,
  MySqlCheckoutAccessRepository,
  MySqlOrderRepository,
  applyOrderingM151Schema,
  createCheckoutStatusCapability,
  createInMemoryCheckoutRateLimitPort,
  createOrderingMySqlPoolFromEnvironment,
  normalizeCheckoutCorrelationId,
  systemCheckoutClock,
} from "@touristic/ordering-server";

const cardPaymentPath =
  /^\/api\/payments\/v1\/checkouts\/[A-Za-z0-9_-]{8,120}\/card$/u;
const maxBodyBytes = 64 * 1024;

class CardApiInputError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

function firstHeader(value) {
  if (Array.isArray(value)) return firstHeader(value[0]);
  return typeof value === "string" ? value.trim() : "";
}

function header(request, name) {
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(request.headers ?? {})) {
    if (key.toLowerCase() === target) return firstHeader(value);
  }
  return "";
}

function sendJson(response, status, payload, correlationId, headers = {}) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Correlation-ID", correlationId);
  for (const [name, value] of Object.entries(headers)) {
    response.setHeader(name, value);
  }
  response.end(JSON.stringify(payload));
}

function collectEnvironment(getEnvironmentValue) {
  const keys = [
    "NODE_ENV",
    "ORDERING_DATABASE_URL",
    "FINANCIAL_DATABASE_URL",
    "PAYMENTS_STATUS_TOKEN_SECRET",
    "PAYMENTS_RETURN_URL_ORIGINS",
    "PAYMENTS_PROVIDER_MODE",
    "PAYMENTS_PROVIDER_TIMEOUT_MS",
    "PAYMENTS_PROVIDER_MAX_ATTEMPTS",
    "PAYMENTS_PROVIDER_RETRY_BASE_MS",
    "PAYMENTS_WEBHOOK_URL",
    "MERCADO_PAGO_ACCESS_TOKEN",
    "BUSINESS_PAYMENT_API_TOKEN",
    "MERCADO_PAGO_CHECKOUT_MODE",
    "MERCADO_PAGO_TEST_CREDENTIALS_CONFIRMED",
  ];
  return Object.freeze(
    Object.fromEntries(
      keys.map((key) => [key, String(getEnvironmentValue(key) ?? "").trim()]),
    ),
  );
}

function configuredWebhookUrl(value, production) {
  try {
    const url = new URL(value);
    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      (production && url.protocol !== "https:") ||
      url.username ||
      url.password ||
      url.hash
    ) {
      return "";
    }
    return url.toString();
  } catch {
    return "";
  }
}

function allowedOrigins(value, production) {
  const origins = new Set();
  for (const entry of String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)) {
    const url = new URL(entry);
    if (production && url.protocol !== "https:") {
      throw new Error("PAYMENTS_RETURN_URL_ORIGINS_HTTPS_REQUIRED");
    }
    if (url.username || url.password) {
      throw new Error("PAYMENTS_RETURN_URL_ORIGINS_INVALID");
    }
    origins.add(url.origin);
  }
  if (origins.size === 0) {
    throw new Error("PAYMENTS_RETURN_URL_ORIGINS_REQUIRED");
  }
  return origins;
}

function browserOriginAllowed(request, origins, production) {
  const origin = header(request, "origin");
  if (origin) {
    try {
      return origins.has(new URL(origin).origin);
    } catch {
      return false;
    }
  }
  const referer = header(request, "referer");
  if (referer) {
    try {
      return origins.has(new URL(referer).origin);
    } catch {
      return false;
    }
  }
  return !production;
}

async function readJsonBody(request) {
  const declaredLength = Number(header(request, "content-length") || "0");
  if (Number.isFinite(declaredLength) && declaredLength > maxBodyBytes) {
    throw new CardApiInputError(413, "CARD_PAYMENT_REQUEST_TOO_LARGE");
  }

  const chunks = [];
  let total = 0;
  for await (const rawChunk of request) {
    const chunk =
      typeof rawChunk === "string"
        ? Buffer.from(rawChunk)
        : rawChunk instanceof Uint8Array
          ? Buffer.from(rawChunk)
          : null;
    if (!chunk) throw new CardApiInputError(400, "INVALID_CARD_PAYMENT_REQUEST");
    total += chunk.length;
    if (total > maxBodyBytes) {
      throw new CardApiInputError(413, "CARD_PAYMENT_REQUEST_TOO_LARGE");
    }
    chunks.push(chunk);
  }
  if (total === 0) {
    throw new CardApiInputError(400, "INVALID_CARD_PAYMENT_REQUEST");
  }

  try {
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(
      Buffer.concat(chunks),
    );
    return JSON.parse(decoded);
  } catch {
    throw new CardApiInputError(400, "INVALID_CARD_PAYMENT_JSON");
  }
}

function runtimeAudit(audit, event) {
  try {
    audit(Object.freeze({ ...event }));
  } catch {
    // Audit delivery cannot become card-payment authority.
  }
}

export function createPaymentsCardApi({
  getEnvironmentValue = (key) => process.env[key] ?? "",
  audit = (event) => console.warn(`[payments-audit] ${JSON.stringify(event)}`),
  transport: injectedTransport,
} = {}) {
  let runtime = injectedTransport
    ? Object.freeze({ transport: injectedTransport, pools: [], enabled: true })
    : null;
  let startAttempted = Boolean(injectedTransport);
  let started = Boolean(injectedTransport);

  async function start() {
    if (started || startAttempted) return started;
    startAttempted = true;
    const pools = [];
    try {
      const environment = collectEnvironment(getEnvironmentValue);
      if (environment.PAYMENTS_PROVIDER_MODE !== "mercado_pago") {
        runtime = Object.freeze({ transport: null, pools: [], enabled: false });
        started = true;
        return true;
      }

      const production = environment.NODE_ENV === "production";
      const origins = allowedOrigins(
        environment.PAYMENTS_RETURN_URL_ORIGINS,
        production,
      );
      const webhookUrl = configuredWebhookUrl(
        environment.PAYMENTS_WEBHOOK_URL,
        production,
      );
      if (!webhookUrl) throw new Error("PAYMENTS_WEBHOOK_URL_REQUIRED");

      const orderingPool = createOrderingMySqlPoolFromEnvironment(environment);
      pools.push(orderingPool);
      const financialPool = createFinancialMySqlPoolFromEnvironment(environment);
      pools.push(financialPool);
      await Promise.all([
        applyOrderingM151Schema(orderingPool),
        applyFinancialM145Schema(financialPool),
      ]);

      const statusCapabilities = createCheckoutStatusCapability(
        environment.PAYMENTS_STATUS_TOKEN_SECRET,
      );
      const transport = new CardPaymentHttpTransport({
        orders: new MySqlOrderRepository(orderingPool),
        payments: new MySqlPaymentRepository(financialPool),
        access: new MySqlCheckoutAccessRepository(orderingPool),
        statusCapabilities,
        rateLimits: createInMemoryCheckoutRateLimitPort(),
        provider: createMercadoPagoCardPaymentProviderFromEnvironment(
          environment,
        ),
        audit: {
          record(event) {
            runtimeAudit(audit, event);
            return Promise.resolve();
          },
        },
        clock: systemCheckoutClock,
        webhookUrl,
      });

      runtime = Object.freeze({
        transport,
        pools,
        enabled: true,
        origins,
        production,
      });
      started = true;
      runtimeAudit(audit, {
        action: "checkout.card_runtime",
        result: "success",
        reason: "ready",
      });
      return true;
    } catch {
      await Promise.allSettled(pools.map((pool) => pool.end()));
      runtime = null;
      runtimeAudit(audit, {
        action: "checkout.card_runtime",
        result: "failure",
        reason: "configuration_or_persistence_unavailable",
      });
      return false;
    }
  }

  async function stop() {
    const pools = runtime?.pools ?? [];
    runtime = null;
    started = false;
    await Promise.allSettled(pools.map((pool) => pool.end()));
  }

  return Object.freeze({
    matches(pathname) {
      return cardPaymentPath.test(pathname);
    },
    start,
    stop,
    async handle(request, response, requestUrl) {
      const correlationId =
        normalizeCheckoutCorrelationId(
          request.morroCorrelationId ?? header(request, "x-correlation-id"),
        ) || `corr_${randomUUID()}`;

      if (!runtime || !runtime.enabled || !runtime.transport) {
        sendJson(
          response,
          503,
          { error: "CARD_PAYMENT_UNAVAILABLE" },
          correlationId,
        );
        return;
      }
      const method = String(request.method || "GET").toUpperCase();
      if (method !== "POST") {
        sendJson(
          response,
          405,
          { error: "METHOD_NOT_ALLOWED" },
          correlationId,
        );
        return;
      }
      if (!browserOriginAllowed(request, runtime.origins, runtime.production)) {
        sendJson(response, 403, { error: "ORIGIN_DENIED" }, correlationId);
        return;
      }
      const contentType = header(request, "content-type")
        .split(";", 1)[0]
        .toLowerCase();
      if (contentType !== "application/json") {
        sendJson(
          response,
          415,
          { error: "UNSUPPORTED_MEDIA_TYPE" },
          correlationId,
        );
        return;
      }

      let body;
      try {
        body = await readJsonBody(request);
      } catch (error) {
        if (error instanceof CardApiInputError) {
          sendJson(
            response,
            error.status,
            { error: error.code },
            correlationId,
          );
          return;
        }
        sendJson(
          response,
          400,
          { error: "INVALID_CARD_PAYMENT_REQUEST" },
          correlationId,
        );
        return;
      }

      try {
        const result = await runtime.transport.handle({
          method,
          pathname: requestUrl.pathname,
          headers: request.headers ?? {},
          body,
          clientIp: request.socket?.remoteAddress,
          correlationId,
        });
        sendJson(
          response,
          result.status,
          result.body,
          correlationId,
          result.headers,
        );
      } catch {
        runtimeAudit(audit, {
          action: "checkout.card_http",
          result: "failure",
          reason: "unhandled_transport_failure",
          correlationId,
        });
        sendJson(
          response,
          503,
          { error: "CARD_PAYMENT_UNAVAILABLE" },
          correlationId,
        );
      }
    },
  });
}
