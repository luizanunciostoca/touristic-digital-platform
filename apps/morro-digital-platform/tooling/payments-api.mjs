import { randomUUID } from "node:crypto";

import { authorizeBusinessAccess } from "@touristic/auth";
import { createProviderNeutralCheckoutApplicationService } from "@touristic/ordering";
import {
  FinancialWebhookHttpTransport,
  MySqlPaymentIdempotencyPort,
  MySqlPaymentRepository,
  MySqlProviderWebhookEventRepository,
  applyFinancialM141Schema,
  createFinancialMySqlPoolFromEnvironment,
  createSandboxCheckoutProviderFromEnvironment,
  createSandboxWebhookVerifierFromEnvironment,
  sandboxWebhookPath,
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

class PaymentsHttpInputError extends Error {
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

async function readRawBody(
  request,
  {
    tooLargeCode = "CHECKOUT_REQUEST_TOO_LARGE",
    emptyCode = "INVALID_CHECKOUT_REQUEST",
  } = {},
) {
  const declaredLength = Number(header(request, "content-length") || "0");
  if (Number.isFinite(declaredLength) && declaredLength > maxBodyBytes) {
    throw new PaymentsHttpInputError(413, tooLargeCode);
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
    if (!chunk) throw new PaymentsHttpInputError(400, emptyCode);
    total += chunk.length;
    if (total > maxBodyBytes) {
      throw new PaymentsHttpInputError(413, tooLargeCode);
    }
    chunks.push(chunk);
  }
  if (total === 0) {
    throw new PaymentsHttpInputError(400, emptyCode);
  }
  return Buffer.concat(chunks);
}

async function readJsonBody(request) {
  const rawBody = await readRawBody(request);
  try {
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(rawBody);
    return JSON.parse(decoded);
  } catch {
    throw new PaymentsHttpInputError(400, "INVALID_CHECKOUT_JSON");
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
    "PAYMENTS_PROVIDER_MODE",
    "PAYMENTS_SANDBOX_PROVIDER_BASE_URL",
    "PAYMENTS_SANDBOX_PROVIDER_API_TOKEN",
    "PAYMENTS_SANDBOX_CHECKOUT_ORIGINS",
    "PAYMENTS_PROVIDER_TIMEOUT_MS",
    "PAYMENTS_WEBHOOK_URL",
    "PAYMENTS_SANDBOX_WEBHOOK_SECRET",
    "PAYMENTS_WEBHOOK_TOLERANCE_SECONDS",
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
      url.search ||
      url.hash ||
      url.pathname !== sandboxWebhookPath
    ) {
      return "";
    }
    return url.toString();
  } catch {
    return "";
  }
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
  webhookTransport: injectedWebhookTransport,
} = {}) {
  const hasInjectedTransport = Boolean(
    injectedTransport || injectedWebhookTransport,
  );
  let runtime = hasInjectedTransport
    ? Object.freeze({
        transport: injectedTransport ?? null,
        webhookTransport: injectedWebhookTransport ?? null,
        pools: [],
      })
    : null;
  let startAttempted = hasInjectedTransport;
  let started = hasInjectedTransport;

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
      const webhookUrl = configuredWebhookUrl(
        environment.PAYMENTS_WEBHOOK_URL,
        environment.NODE_ENV === "production",
      );
      if (!webhookUrl) throw new Error("PAYMENTS_WEBHOOK_URL_REQUIRED");
      const orderingPool = createOrderingMySqlPoolFromEnvironment(environment);
      pools.push(orderingPool);
      const financialPool =
        createFinancialMySqlPoolFromEnvironment(environment);
      pools.push(financialPool);
      await Promise.all([
        applyOrderingM139Schema(orderingPool),
        applyFinancialM141Schema(financialPool),
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
        provider: createSandboxCheckoutProviderFromEnvironment(environment),
        webhookUrl,
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
      const webhookTransport = new FinancialWebhookHttpTransport({
        verifier: createSandboxWebhookVerifierFromEnvironment(environment),
        events: new MySqlProviderWebhookEventRepository(financialPool),
        payments,
        audit: {
          record(event) {
            runtimeAudit(audit, event);
            return Promise.resolve();
          },
        },
        clock: systemCheckoutClock,
      });
      runtime = Object.freeze({ transport, webhookTransport, pools });
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
        pathname === sandboxWebhookPath ||
        pathname === checkoutPrefix ||
        pathname.startsWith(checkoutPrefix + "/")
      );
    },
    start,
    stop,
    async handle(request, response, requestUrl) {
      const correlationId =
        normalizeCheckoutCorrelationId(header(request, "x-correlation-id")) ||
        "corr_" + randomUUID();
      const webhookRequest = requestUrl.pathname === sandboxWebhookPath;
      const unavailableCode = webhookRequest
        ? "WEBHOOK_UNAVAILABLE"
        : "CHECKOUT_UNAVAILABLE";

      if (!runtime) {
        sendJson(response, 503, { error: unavailableCode }, correlationId);
        return;
      }

      const method = String(request.method || "GET").toUpperCase();
      let body;
      let rawBody = new Uint8Array();
      if (
        method === "POST" &&
        (requestUrl.pathname === checkoutPrefix || webhookRequest)
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
          if (webhookRequest) {
            rawBody = await readRawBody(request, {
              tooLargeCode: "WEBHOOK_REQUEST_TOO_LARGE",
              emptyCode: "INVALID_WEBHOOK_REQUEST",
            });
          } else {
            body = await readJsonBody(request);
          }
        } catch (error) {
          if (error instanceof PaymentsHttpInputError) {
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
            {
              error: webhookRequest
                ? "INVALID_WEBHOOK_REQUEST"
                : "INVALID_CHECKOUT_REQUEST",
            },
            correlationId,
          );
          return;
        }
      }

      const selectedTransport = webhookRequest
        ? runtime.webhookTransport
        : runtime.transport;
      if (!selectedTransport) {
        sendJson(response, 503, { error: unavailableCode }, correlationId);
        return;
      }

      try {
        const result = webhookRequest
          ? await selectedTransport.handle({
              method,
              pathname: requestUrl.pathname,
              headers: request.headers ?? {},
              rawBody,
              correlationId,
            })
          : await selectedTransport.handle({
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
          action: webhookRequest ? "webhook.http" : "checkout.http",
          result: "failure",
          reason: "unhandled_transport_failure",
          correlationId,
        });
        sendJson(response, 503, { error: unavailableCode }, correlationId);
      }
    },
  });
}
