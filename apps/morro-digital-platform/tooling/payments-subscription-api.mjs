import { randomUUID } from "node:crypto";

import { authorizeBusinessAccess } from "@touristic/auth";
import { createFinancialMySqlPoolFromEnvironment } from "@touristic/financial-server";
import { createMercadoPagoSubscriptionProviderFromEnvironment } from "@touristic/financial-server/mercado-pago-subscription";
import { MySqlProviderSubscriptionRepository } from "@touristic/financial-server/provider-subscription-repository";
import { applyFinancialM146Schema } from "@touristic/financial-server/provider-subscription-schema";
import {
  MySqlCheckoutAccessRepository,
  MySqlSubscriptionRepository,
  ProviderSubscriptionHttpTransport,
  applyOrderingM151Schema,
  createOrderingMySqlPoolFromEnvironment,
} from "@touristic/ordering-server";

const subscriptionPath =
  /^\/api\/payments\/v1\/subscriptions\/sub_[A-Za-z0-9_-]{8,116}\/provider(?:\/(?:pause|resume|cancel))?$/u;
const maxBodyBytes = 64 * 1024;

class SubscriptionApiInputError extends Error {
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
    "PAYMENTS_PROVIDER_MODE",
    "PAYMENTS_PROVIDER_TIMEOUT_MS",
    "PAYMENTS_PROVIDER_MAX_ATTEMPTS",
    "PAYMENTS_PROVIDER_RETRY_BASE_MS",
    "PAYMENTS_SUBSCRIPTIONS_ENABLED",
    "PAYMENTS_SUBSCRIPTION_BACK_URL",
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

function enabled(environment) {
  return environment.PAYMENTS_SUBSCRIPTIONS_ENABLED.toLowerCase() === "true";
}

async function readJsonBody(request) {
  const declaredLength = Number(header(request, "content-length") || "0");
  if (Number.isFinite(declaredLength) && declaredLength > maxBodyBytes) {
    throw new SubscriptionApiInputError(413, "SUBSCRIPTION_REQUEST_TOO_LARGE");
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
    if (!chunk) {
      throw new SubscriptionApiInputError(
        400,
        "INVALID_SUBSCRIPTION_PROVIDER_REQUEST",
      );
    }
    total += chunk.length;
    if (total > maxBodyBytes) {
      throw new SubscriptionApiInputError(413, "SUBSCRIPTION_REQUEST_TOO_LARGE");
    }
    chunks.push(chunk);
  }

  if (total === 0) return {};
  try {
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(
      Buffer.concat(chunks),
    );
    const parsed = JSON.parse(decoded);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("invalid");
    }
    return parsed;
  } catch {
    throw new SubscriptionApiInputError(
      400,
      "INVALID_SUBSCRIPTION_PROVIDER_JSON",
    );
  }
}

function runtimeAudit(audit, event) {
  try {
    audit(Object.freeze({ ...event }));
  } catch {
    // Audit delivery cannot become subscription authority.
  }
}

function authorizationPort({ authApi, access }) {
  return Object.freeze({
    async authorize(request, subscription, mutation) {
      const session = await authApi.resolveSession(request);
      if (!session) {
        return Object.freeze({
          allowed: false,
          reason: "authentication_required",
        });
      }

      if (mutation) {
        const mutationDecision = authApi.authorizeMutation(
          request,
          session,
          "subscription.provider",
        );
        if (!mutationDecision.allowed) {
          return Object.freeze({
            allowed: false,
            reason:
              mutationDecision.reason === "cross_origin_request"
                ? "cross_origin_request"
                : "invalid_csrf",
          });
        }
      }

      const businessId = header(request, "x-business-id");
      if (!businessId) {
        return Object.freeze({ allowed: false, reason: "missing_context" });
      }
      const accessDecision = authorizeBusinessAccess(session, businessId, {
        mutation,
      });
      if (!accessDecision.allowed || !accessDecision.businessId) {
        return Object.freeze({
          allowed: false,
          reason:
            accessDecision.reason === "read_only_role"
              ? "read_only_role"
              : "business_access_denied",
        });
      }

      const checkoutAccess = await access.findByOrderId(
        subscription.currentPeriod.orderId,
      );
      if (
        !checkoutAccess?.tenantId ||
        checkoutAccess.tenantId !== accessDecision.businessId
      ) {
        return Object.freeze({
          allowed: false,
          reason: "business_access_denied",
        });
      }

      return Object.freeze({
        allowed: true,
        actorSubject: session.subject,
        actorEmail: session.email,
        tenantId: accessDecision.businessId,
      });
    },
  });
}

export function createPaymentsSubscriptionApi({
  authApi,
  getEnvironmentValue = (key) => process.env[key] ?? "",
  audit = (event) =>
    console.warn(`[payments-subscription-audit] ${JSON.stringify(event)}`),
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
      if (
        environment.PAYMENTS_PROVIDER_MODE !== "mercado_pago" ||
        !enabled(environment)
      ) {
        runtime = Object.freeze({ transport: null, pools: [], enabled: false });
        started = true;
        return true;
      }
      if (!authApi) throw new Error("SUBSCRIPTION_AUTH_REQUIRED");

      const orderingPool = createOrderingMySqlPoolFromEnvironment(environment);
      pools.push(orderingPool);
      const financialPool = createFinancialMySqlPoolFromEnvironment(environment);
      pools.push(financialPool);
      await Promise.all([
        applyOrderingM151Schema(orderingPool),
        applyFinancialM146Schema(financialPool),
      ]);

      const access = new MySqlCheckoutAccessRepository(orderingPool);
      const transport = new ProviderSubscriptionHttpTransport({
        subscriptions: new MySqlSubscriptionRepository(orderingPool),
        bindings: new MySqlProviderSubscriptionRepository(financialPool),
        provider: createMercadoPagoSubscriptionProviderFromEnvironment(
          environment,
        ),
        authorization: authorizationPort({ authApi, access }),
        audit: {
          record(event) {
            runtimeAudit(audit, event);
            return Promise.resolve();
          },
        },
        clock: { now: () => new Date().toISOString() },
        backUrl: environment.PAYMENTS_SUBSCRIPTION_BACK_URL,
      });

      runtime = Object.freeze({ transport, pools, enabled: true });
      started = true;
      runtimeAudit(audit, {
        action: "subscription.provider_runtime",
        result: "success",
        reason: "ready",
      });
      return true;
    } catch {
      await Promise.allSettled(pools.map((pool) => pool.end()));
      runtime = null;
      runtimeAudit(audit, {
        action: "subscription.provider_runtime",
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
      return subscriptionPath.test(pathname);
    },
    start,
    stop,
    async handle(request, response, requestUrl) {
      const correlationId =
        firstHeader(request.morroCorrelationId) ||
        header(request, "x-correlation-id") ||
        `corr_${randomUUID()}`;

      if (!runtime || !runtime.enabled || !runtime.transport) {
        sendJson(
          response,
          503,
          { error: "SUBSCRIPTION_PROVIDER_UNAVAILABLE" },
          correlationId,
        );
        return;
      }

      const method = String(request.method || "GET").toUpperCase();
      let body;
      if (method !== "GET") {
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
        try {
          body = await readJsonBody(request);
        } catch (error) {
          if (error instanceof SubscriptionApiInputError) {
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
            { error: "INVALID_SUBSCRIPTION_PROVIDER_REQUEST" },
            correlationId,
          );
          return;
        }
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
          action: "subscription.provider_http",
          result: "failure",
          reason: "unhandled_transport_failure",
          correlationId,
        });
        sendJson(
          response,
          503,
          { error: "SUBSCRIPTION_PROVIDER_UNAVAILABLE" },
          correlationId,
        );
      }
    },
  });
}
