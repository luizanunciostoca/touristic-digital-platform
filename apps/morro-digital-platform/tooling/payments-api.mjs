import { randomUUID } from "node:crypto";

import { authorizeBusinessAccess } from "@touristic/auth";
import { createProviderNeutralCheckoutApplicationService } from "@touristic/ordering";
import {
  MySqlPaymentIdempotencyPort,
  MySqlPaymentRepository,
  applyFinancialM137Schema,
  createFinancialMySqlPoolFromEnvironment,
} from "@touristic/financial-server";
import {
  CheckoutHttpTransport,
  MySqlCheckoutAccessRepository,
  MySqlOrderRepository,
  applyOrderingM139Schema,
  createCheckoutReturnUrlPolicyFromEnvironment,
  createCheckoutStatusCapability,
  createInMemoryCheckoutRateLimitPort,
  createNodeCheckoutIdentityPort,
  createOrderPricingAuthorityFromEnvironment,
  normalizeCheckoutCorrelationId,
  normalizeCheckoutRequestContext,
  systemCheckoutClock,
  verifyCheckoutHandoffCapability,
} from "@touristic/ordering-server";

const checkoutPrefix = "/api/payments/v1/checkouts";
const maxBodyBytes = 64 * 1024;

class CheckoutHttpInputError extends Error {
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

async function readJsonBody(request) {
  const declaredLength = Number(header(request, "content-length") || "0");
  if (Number.isFinite(declaredLength) && declaredLength > maxBodyBytes) {
    throw new CheckoutHttpInputError(413, "CHECKOUT_REQUEST_TOO_LARGE");
  }
  const chunks = [];
  let total = 0;
  for await (const rawChunk of request) {
    const chunk = Buffer.isBuffer(rawChunk)
      ? rawChunk
      : Buffer.from(String(rawChunk));
    total += chunk.length;
    if (total > maxBodyBytes) {
      throw new CheckoutHttpInputError(413, "CHECKOUT_REQUEST_TOO_LARGE");
    }
    chunks.push(chunk);
  }
  if (total === 0) {
    throw new CheckoutHttpInputError(400, "INVALID_CHECKOUT_REQUEST");
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new CheckoutHttpInputError(400, "INVALID_CHECKOUT_JSON");
  }
}

function collectEnvironment(getEnvironmentValue) {
  const keys = [
    "NODE_ENV",
    "ORDERING_DATABASE_URL",
    "FINANCIAL_DATABASE_URL",
    "ORDERING_PRICING_CATALOG_JSON",
    "PAYMENTS_STATUS_TOKEN_SECRET",
    "PAYMENTS_HANDOFF_SECRET",
    "PAYMENTS_RETURN_URL_ORIGINS",
    "PAYMENTS_DESTINATION_ID",
    "PAYMENTS_STATUS_TOKEN_TTL_SECONDS",
  ];
  return Object.freeze(
    Object.fromEntries(
      keys.map((key) => [key, String(getEnvironmentValue(key) ?? "").trim()]),
    ),
  );
}

function configuredStatusTtl(value) {
  if (!value) return undefined;
  if (!/^[0-9]+$/u.test(value)) {
    throw new Error("PAYMENTS_STATUS_TOKEN_TTL_SECONDS_INVALID");
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error("PAYMENTS_STATUS_TOKEN_TTL_SECONDS_INVALID");
  }
  return parsed;
}

function allowedOrigins(value) {
  return new Set(
    value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => new URL(entry).origin),
  );
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

export function createPaymentsCheckoutAuthorizationPort({
  authApi,
  destinationId,
  handoffSecret,
  origins,
  production,
}) {
  return Object.freeze({
    async authorizeCreate(request, handoff) {
      const active = authApi.resolveSession(request);
      if (active) {
        const mutation = authApi.authorizeMutation(
          request,
          active,
          "checkout.create",
        );
        if (!mutation.allowed) {
          return Object.freeze({
            allowed: false,
            reason:
              mutation.reason === "invalid_csrf"
                ? "invalid_csrf"
                : "cross_origin_request",
          });
        }
        const access = authorizeBusinessAccess(
          active,
          header(request, "x-business-id"),
          { mutation: true },
        );
        if (!access.allowed || !access.businessId) {
          const reason =
            access.reason === "read_only_role"
              ? "read_only_role"
              : access.reason === "invalid_business_id"
                ? "missing_context"
                : access.reason === "business_access_denied"
                  ? "business_access_denied"
                  : "authentication_required";
          return Object.freeze({ allowed: false, reason });
        }
        const context = normalizeCheckoutRequestContext({
          requesterKind: "authenticated",
          actorSubject: active.subject,
          destinationId,
          tenantId: access.businessId,
        });
        return context
          ? Object.freeze({ allowed: true, context })
          : Object.freeze({ allowed: false, reason: "missing_context" });
      }

      const token = header(request, "x-checkout-handoff-token");
      if (!token) {
        return Object.freeze({
          allowed: false,
          reason: "authentication_required",
        });
      }
      const context = verifyCheckoutHandoffCapability(
        token,
        handoff,
        handoffSecret,
      );
      if (!context || context.destinationId !== destinationId) {
        return Object.freeze({
          allowed: false,
          reason: "invalid_guest_capability",
        });
      }
      if (!browserOriginAllowed(request, origins, production)) {
        return Object.freeze({
          allowed: false,
          reason: "cross_origin_request",
        });
      }
      return Object.freeze({ allowed: true, context });
    },
  });
}

function runtimeAudit(defaultAudit, event) {
  try {
    defaultAudit(Object.freeze({ ...event }));
  } catch {
    // Audit delivery must not expose request internals or mutate the checkout.
  }
}

export function createPaymentsApi({
  authApi,
  getEnvironmentValue = (key) => process.env[key] ?? "",
  audit = (event) => console.warn(`[payments-audit] ${JSON.stringify(event)}`),
  transport: injectedTransport,
} = {}) {
  let runtime = injectedTransport
    ? Object.freeze({ transport: injectedTransport, pools: [] })
    : null;
  let startAttempted = Boolean(injectedTransport);
  let started = Boolean(injectedTransport);

  async function start() {
    if (started || startAttempted) return started;
    startAttempted = true;
    const pools = [];
    try {
      if (!authApi) throw new Error("PAYMENTS_AUTH_API_REQUIRED");
      const environment = collectEnvironment(getEnvironmentValue);
      const returnUrls =
        createCheckoutReturnUrlPolicyFromEnvironment(environment);
      const destinationContext = normalizeCheckoutRequestContext({
        requesterKind: "authenticated",
        actorSubject: "runtime:payments",
        destinationId: environment.PAYMENTS_DESTINATION_ID,
        tenantId: null,
      });
      if (!destinationContext) {
        throw new Error("PAYMENTS_DESTINATION_ID_REQUIRED");
      }
      const statusTtlSeconds = configuredStatusTtl(
        environment.PAYMENTS_STATUS_TOKEN_TTL_SECONDS,
      );
      const orderingPool = createOrderingMySqlPoolFromEnvironment(environment);
      pools.push(orderingPool);
      const financialPool =
        createFinancialMySqlPoolFromEnvironment(environment);
      pools.push(financialPool);
      await Promise.all([
        applyOrderingM139Schema(orderingPool),
        applyFinancialM137Schema(financialPool),
      ]);

      const orders = new MySqlOrderRepository(orderingPool);
      const payments = new MySqlPaymentRepository(financialPool);
      const application = createProviderNeutralCheckoutApplicationService({
        orders,
        payments,
        paymentIdempotency: new MySqlPaymentIdempotencyPort(financialPool),
        identities: createNodeCheckoutIdentityPort(),
        clock: systemCheckoutClock,
        pricing: createOrderPricingAuthorityFromEnvironment(environment),
      });
      const origins = allowedOrigins(environment.PAYMENTS_RETURN_URL_ORIGINS);
      const transport = new CheckoutHttpTransport({
        application,
        orders,
        payments,
        access: new MySqlCheckoutAccessRepository(orderingPool),
        authorization: createPaymentsCheckoutAuthorizationPort({
          authApi,
          destinationId: destinationContext.destinationId,
          handoffSecret: environment.PAYMENTS_HANDOFF_SECRET,
          origins,
          production: environment.NODE_ENV === "production",
        }),
        returnUrls,
        statusCapabilities: createCheckoutStatusCapability(
          environment.PAYMENTS_STATUS_TOKEN_SECRET,
        ),
        rateLimits: createInMemoryCheckoutRateLimitPort(),
        audit: {
          record(event) {
            runtimeAudit(audit, event);
            return Promise.resolve();
          },
        },
        clock: systemCheckoutClock,
        ...(statusTtlSeconds === undefined ? {} : { statusTtlSeconds }),
      });
      runtime = Object.freeze({ transport, pools });
      started = true;
      runtimeAudit(audit, {
        action: "checkout.runtime",
        result: "success",
        reason: "ready",
      });
      return true;
    } catch {
      await Promise.allSettled(pools.map((pool) => pool.end()));
      runtime = null;
      runtimeAudit(audit, {
        action: "checkout.runtime",
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
      return (
        pathname === checkoutPrefix || pathname.startsWith(checkoutPrefix + "/")
      );
    },
    start,
    stop,
    async handle(request, response, requestUrl) {
      const correlationId =
        normalizeCheckoutCorrelationId(header(request, "x-correlation-id")) ||
        "corr_" + randomUUID();

      if (!runtime) {
        sendJson(
          response,
          503,
          { error: "CHECKOUT_UNAVAILABLE" },
          correlationId,
        );
        return;
      }

      let body;
      if (
        String(request.method || "GET").toUpperCase() === "POST" &&
        requestUrl.pathname === checkoutPrefix
      ) {
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
          if (error instanceof CheckoutHttpInputError) {
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
            { error: "INVALID_CHECKOUT_REQUEST" },
            correlationId,
          );
          return;
        }
      }

      try {
        const result = await runtime.transport.handle({
          method: String(request.method || "GET"),
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
          action: "checkout.http",
          result: "failure",
          reason: "unhandled_transport_failure",
          correlationId,
        });
        sendJson(
          response,
          503,
          { error: "CHECKOUT_UNAVAILABLE" },
          correlationId,
        );
      }
    },
  });
}
