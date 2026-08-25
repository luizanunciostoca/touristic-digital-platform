import { randomUUID } from "node:crypto";

import { authorizeBusinessAccess } from "@touristic/auth";
import {
  MySqlVerifiedPaymentResultRepository,
  createFinancialMySqlPoolFromEnvironment,
} from "@touristic/financial-server";
import { createMercadoPagoSubscriptionProviderFromEnvironment } from "@touristic/financial-server/mercado-pago-subscription";
import { MySqlProviderSubscriptionRepository } from "@touristic/financial-server/provider-subscription-repository";
import { applyFinancialM146Schema } from "@touristic/financial-server/provider-subscription-schema";
import { normalizeOrderId } from "@touristic/ordering";
import {
  SubscriptionActivationError,
  createSubscriptionActivationApplicationService,
} from "@touristic/ordering/subscription-activation-application";
import {
  MySqlCheckoutAccessRepository,
  MySqlOrderRepository,
  MySqlSubscriptionRepository,
  ProviderSubscriptionHttpTransport,
  applyOrderingM151Schema,
  createOrderingMySqlPoolFromEnvironment,
} from "@touristic/ordering-server";

const subscriptionCollectionPath = "/api/payments/v1/subscriptions";
const subscriptionProviderPath =
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
      throw new SubscriptionApiInputError(
        413,
        "SUBSCRIPTION_REQUEST_TOO_LARGE",
      );
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

function mutationAuthorization(authApi, request, session, action) {
  const decision = authApi.authorizeMutation(request, session, action);
  if (decision.allowed) return null;
  return decision.reason === "cross_origin_request"
    ? Object.freeze({ status: 403, error: "ORIGIN_DENIED" })
    : Object.freeze({ status: 403, error: "INVALID_CSRF" });
}

function businessAuthorization(session, request, mutation = true) {
  const businessId = header(request, "x-business-id");
  if (!businessId) {
    return Object.freeze({ allowed: false, status: 400, error: "SUBSCRIPTION_CONTEXT_REQUIRED" });
  }
  const decision = authorizeBusinessAccess(session, businessId, { mutation });
  if (!decision.allowed || !decision.businessId) {
    return Object.freeze({
      allowed: false,
      status: 403,
      error: decision.reason === "read_only_role" ? "READ_ONLY_ROLE" : "BUSINESS_ACCESS_DENIED",
    });
  }
  return Object.freeze({ allowed: true, businessId: decision.businessId });
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

function materializationProjection(result) {
  const subscription = result.subscription;
  return Object.freeze({
    subscriptionId: subscription.id,
    subscriptionStatus: subscription.status,
    orderId: subscription.currentPeriod.orderId,
    plan: Object.freeze({
      id: subscription.currentPeriod.pricing.planId,
      name: subscription.currentPeriod.pricing.planName,
      amount: subscription.currentPeriod.pricing.amount,
      pricingVersion: subscription.currentPeriod.pricing.pricingVersion,
    }),
    period: Object.freeze({
      number: subscription.currentPeriod.number,
      startAt: subscription.currentPeriod.startAt,
      endAt: subscription.currentPeriod.endAt,
    }),
    replayed: result.disposition === "replayed",
  });
}

function activationErrorResponse(error) {
  if (!(error instanceof SubscriptionActivationError)) return null;
  switch (error.code) {
    case "SUBSCRIPTION_ACTIVATION_INVALID_ORDER_ID":
    case "SUBSCRIPTION_ACTIVATION_INVALID_PAYMENT_ID":
      return Object.freeze({ status: 400, error: "INVALID_SUBSCRIPTION_ACTIVATION_REQUEST" });
    case "SUBSCRIPTION_ACTIVATION_ORDER_NOT_FOUND":
      return Object.freeze({ status: 404, error: "ORDER_NOT_FOUND" });
    case "SUBSCRIPTION_ACTIVATION_ORDER_NOT_ELIGIBLE":
      return Object.freeze({ status: 409, error: "SUBSCRIPTION_ORDER_NOT_ELIGIBLE" });
    case "SUBSCRIPTION_ACTIVATION_PAYMENT_NOT_VERIFIED":
      return Object.freeze({ status: 409, error: "SUBSCRIPTION_PAYMENT_NOT_VERIFIED" });
    case "SUBSCRIPTION_ACTIVATION_INVALID_CLOCK":
    case "SUBSCRIPTION_ACTIVATION_INVALID_STATE":
      return Object.freeze({ status: 503, error: "SUBSCRIPTION_ACTIVATION_UNAVAILABLE" });
  }
}

export function createPaymentsSubscriptionApi({
  authApi,
  getEnvironmentValue = (key) => process.env[key] ?? "",
  audit = (event) =>
    console.warn(`[payments-subscription-audit] ${JSON.stringify(event)}`),
  transport: injectedTransport,
} = {}) {
  let runtime = injectedTransport
    ? Object.freeze({
        transport: injectedTransport,
        materializer: null,
        access: null,
        pools: [],
        enabled: true,
      })
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
        runtime = Object.freeze({
          transport: null,
          materializer: null,
          access: null,
          pools: [],
          enabled: false,
        });
        started = true;
        return true;
      }
      if (!authApi) throw new Error("SUBSCRIPTION_AUTH_REQUIRED");

      const orderingPool = createOrderingMySqlPoolFromEnvironment(environment);
      pools.push(orderingPool);
      const financialPool =
        createFinancialMySqlPoolFromEnvironment(environment);
      pools.push(financialPool);
      await Promise.all([
        applyOrderingM151Schema(orderingPool),
        applyFinancialM146Schema(financialPool),
      ]);

      const access = new MySqlCheckoutAccessRepository(orderingPool);
      const subscriptions = new MySqlSubscriptionRepository(orderingPool);
      const materializer = createSubscriptionActivationApplicationService({
        orders: new MySqlOrderRepository(orderingPool),
        subscriptions,
        verifiedPayments: new MySqlVerifiedPaymentResultRepository(financialPool),
        clock: { now: () => new Date().toISOString() },
      });
      const transport = new ProviderSubscriptionHttpTransport({
        subscriptions,
        bindings: new MySqlProviderSubscriptionRepository(financialPool),
        provider:
          createMercadoPagoSubscriptionProviderFromEnvironment(environment),
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

      runtime = Object.freeze({
        transport,
        materializer,
        access,
        pools,
        enabled: true,
      });
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

  async function handleMaterialization(request, response, body, correlationId) {
    if (!runtime?.materializer || !runtime.access || !authApi) {
      sendJson(
        response,
        503,
        { error: "SUBSCRIPTION_ACTIVATION_UNAVAILABLE" },
        correlationId,
      );
      return;
    }

    const keys = Object.keys(body);
    if (keys.length !== 1 || keys[0] !== "orderId") {
      sendJson(
        response,
        400,
        { error: "INVALID_SUBSCRIPTION_ACTIVATION_REQUEST" },
        correlationId,
      );
      return;
    }
    const orderId = normalizeOrderId(body.orderId);
    if (!orderId) {
      sendJson(
        response,
        400,
        { error: "INVALID_SUBSCRIPTION_ACTIVATION_REQUEST" },
        correlationId,
      );
      return;
    }

    const session = await authApi.resolveSession(request);
    if (!session) {
      sendJson(response, 401, { error: "AUTH_REQUIRED" }, correlationId);
      return;
    }
    const deniedMutation = mutationAuthorization(
      authApi,
      request,
      session,
      "subscription.activate",
    );
    if (deniedMutation) {
      sendJson(response, deniedMutation.status, { error: deniedMutation.error }, correlationId);
      return;
    }
    const business = businessAuthorization(session, request, true);
    if (!business.allowed) {
      sendJson(response, business.status, { error: business.error }, correlationId);
      return;
    }

    const checkoutAccess = await runtime.access.findByOrderId(orderId);
    if (
      !checkoutAccess?.tenantId ||
      checkoutAccess.tenantId !== business.businessId
    ) {
      runtimeAudit(audit, {
        action: "subscription.activate",
        result: "denied",
        reason: "business_access_denied",
        correlationId,
        orderId,
        actorSubject: session.subject,
        tenantId: business.businessId,
      });
      sendJson(response, 403, { error: "BUSINESS_ACCESS_DENIED" }, correlationId);
      return;
    }

    try {
      const result = await runtime.materializer.activate({
        orderId,
        paymentId: checkoutAccess.paymentId,
      });
      runtimeAudit(audit, {
        action: "subscription.activate",
        result: "success",
        reason: result.disposition,
        correlationId,
        orderId,
        subscriptionId: result.subscription.id,
        actorSubject: session.subject,
        tenantId: business.businessId,
      });
      sendJson(
        response,
        result.disposition === "created" ? 201 : 200,
        { data: materializationProjection(result) },
        correlationId,
      );
    } catch (error) {
      const mapped = activationErrorResponse(error);
      if (!mapped) throw error;
      sendJson(response, mapped.status, { error: mapped.error }, correlationId);
    }
  }

  return Object.freeze({
    matches(pathname) {
      return pathname === subscriptionCollectionPath || subscriptionProviderPath.test(pathname);
    },
    start,
    stop,
    async handle(request, response, requestUrl) {
      const correlationId =
        firstHeader(request.morroCorrelationId) ||
        header(request, "x-correlation-id") ||
        `corr_${randomUUID()}`;

      if (!runtime || !runtime.enabled) {
        sendJson(
          response,
          503,
          { error: "SUBSCRIPTION_PROVIDER_UNAVAILABLE" },
          correlationId,
        );
        return;
      }

      const method = String(request.method || "GET").toUpperCase();
      if (requestUrl.pathname === subscriptionCollectionPath && method !== "POST") {
        sendJson(response, 405, { error: "METHOD_NOT_ALLOWED" }, correlationId);
        return;
      }

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

      if (requestUrl.pathname === subscriptionCollectionPath) {
        try {
          await handleMaterialization(
            request,
            response,
            body ?? {},
            correlationId,
          );
        } catch {
          runtimeAudit(audit, {
            action: "subscription.activate",
            result: "failure",
            reason: "unhandled_activation_failure",
            correlationId,
          });
          sendJson(
            response,
            503,
            { error: "SUBSCRIPTION_ACTIVATION_UNAVAILABLE" },
            correlationId,
          );
        }
        return;
      }

      if (!runtime.transport) {
        sendJson(
          response,
          503,
          { error: "SUBSCRIPTION_PROVIDER_UNAVAILABLE" },
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
