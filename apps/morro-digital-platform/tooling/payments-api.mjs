import { randomUUID } from "node:crypto";

import { authorizeBusinessAccess } from "@touristic/auth";
import {
  createProviderNeutralCheckoutApplicationService,
  normalizeBusinessCheckoutHandoff,
} from "@touristic/ordering";
import { createTicketingCheckoutApplicationService } from "@touristic/ordering/ticketing-checkout";
import {
  FinancialWebhookHttpTransport,
  MySqlFinancialReconciliationRepository,
  MySqlLedgerTransactionRepository,
  MySqlPaymentIdempotencyPort,
  MySqlPaymentRepository,
  MySqlProviderWebhookEventRepository,
  MySqlRefundRequestRepository,
  MySqlVerifiedPaymentResultRepository,
  ReconciliationHttpTransport,
  RefundHttpTransport,
  applyFinancialM145Schema,
  createFinancialMySqlPoolFromEnvironment,
  createReconciliationApplicationService,
  createRefundApplicationService,
  createSandboxCheckoutProviderFromEnvironment,
  createSandboxReconciliationProviderFromEnvironment,
  createSandboxRefundProviderFromEnvironment,
  createSandboxWebhookVerifierFromEnvironment,
  createVerifiedPaymentAccountingService,
  createVerifiedPaymentOutcomeService,
  reconciliationHttpPrefix,
  refundHttpPrefix,
  sandboxWebhookPath,
} from "@touristic/financial-server";
import {
  CheckoutHttpTransport,
  MySqlCheckoutAccessRepository,
  MySqlOrderRepository,
  MySqlTicketingOrderBindingRepository,
  applyOrderingM151Schema,
  applyOrderingTicketingReservationSchema,
  createCheckoutHandoffCapability,
  createCheckoutReturnUrlPolicyFromEnvironment,
  createCheckoutStatusCapability,
  createInMemoryCheckoutRateLimitPort,
  createNodeCheckoutIdentityPort,
  createOrderingMySqlPoolFromEnvironment,
  createOrderPricingAuthorityFromEnvironment,
  normalizeCheckoutCorrelationId,
  normalizeCheckoutRequestContext,
  systemCheckoutClock,
  verifyCheckoutHandoffCapability,
  verifyTicketingCheckoutHandoffCapability,
} from "@touristic/ordering-server";

const checkoutPrefix = "/api/payments/v1/checkouts";
const checkoutAuthorityPath = "/api/payments/v1/checkout-authority";
const maxBodyBytes = 64 * 1024;
const authorityRateWindowMs = 60_000;
const authorityRateLimit = 24;

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

async function readJsonBody(
  request,
  {
    tooLargeCode = "CHECKOUT_REQUEST_TOO_LARGE",
    emptyCode = "INVALID_CHECKOUT_REQUEST",
    invalidCode = "INVALID_CHECKOUT_JSON",
  } = {},
) {
  const rawBody = await readRawBody(request, { tooLargeCode, emptyCode });
  try {
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(rawBody);
    return JSON.parse(decoded);
  } catch {
    throw new PaymentsHttpInputError(400, invalidCode);
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

function authorityResponse(status, body, correlationId, headers = {}) {
  return Object.freeze({
    status,
    body: Object.freeze({ ...body }),
    headers: Object.freeze({
      "Cache-Control": "no-store",
      "X-Correlation-ID": correlationId,
      ...headers,
    }),
  });
}

function authorityClientKey(request) {
  const value =
    typeof request.clientIp === "string"
      ? request.clientIp.trim().slice(0, 100)
      : "";
  return value || "unknown";
}

function recordAuthorityAudit(audit, event) {
  try {
    audit(Object.freeze({ ...event }));
  } catch {
    // Capability issuance must not become financial authority through audit delivery.
  }
}

export function createPaymentsCheckoutAuthorityBootstrap({
  destinationId,
  handoffSecret,
  origins,
  production,
  rateLimits,
  audit = () => undefined,
  now = () => Date.now(),
}) {
  const destinationContext = normalizeCheckoutRequestContext({
    requesterKind: "guest_capability",
    actorSubject: "runtime:checkout-authority",
    destinationId,
    tenantId: null,
  });
  if (!destinationContext) {
    throw new Error("PAYMENTS_DESTINATION_ID_REQUIRED");
  }
  if (!(origins instanceof Set) || origins.size === 0) {
    throw new Error("PAYMENTS_RETURN_URL_ORIGINS_REQUIRED");
  }
  if (!rateLimits || typeof rateLimits.consume !== "function") {
    throw new Error("PAYMENTS_RATE_LIMIT_PORT_REQUIRED");
  }

  return Object.freeze({
    async handle(request) {
      const correlationId =
        normalizeCheckoutCorrelationId(
          request.correlationId ?? header(request, "x-correlation-id"),
        ) || "corr_invalid";
      if (String(request.method || "GET").toUpperCase() !== "POST") {
        return authorityResponse(
          405,
          { error: "METHOD_NOT_ALLOWED" },
          correlationId,
        );
      }

      const handoff = normalizeBusinessCheckoutHandoff(request.body);
      if (!handoff) {
        recordAuthorityAudit(audit, {
          action: "checkout.authority",
          result: "denied",
          reason: "invalid_handoff",
          correlationId,
        });
        return authorityResponse(
          400,
          { error: "INVALID_CHECKOUT_REQUEST" },
          correlationId,
        );
      }
      if (!browserOriginAllowed(request, origins, production)) {
        recordAuthorityAudit(audit, {
          action: "checkout.authority",
          result: "denied",
          reason: "cross_origin_request",
          correlationId,
        });
        return authorityResponse(
          403,
          { error: "ORIGIN_DENIED" },
          correlationId,
        );
      }
      let returnOrigin = "";
      try {
        returnOrigin = new URL(handoff.returnUrl).origin;
      } catch {
        returnOrigin = "";
      }
      if (!returnOrigin || !origins.has(returnOrigin)) {
        recordAuthorityAudit(audit, {
          action: "checkout.authority",
          result: "denied",
          reason: "return_url_denied",
          correlationId,
        });
        return authorityResponse(
          400,
          { error: "RETURN_URL_DENIED" },
          correlationId,
        );
      }

      const nowMs = Number(now());
      if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
        return authorityResponse(
          503,
          { error: "CHECKOUT_AUTHORITY_UNAVAILABLE" },
          correlationId,
        );
      }
      const rate = await rateLimits.consume({
        bucket: "checkout-create",
        key: `authority:${destinationContext.destinationId}:${authorityClientKey(request)}`,
        limit: authorityRateLimit,
        windowMs: authorityRateWindowMs,
        nowMs,
      });
      if (!rate.allowed) {
        recordAuthorityAudit(audit, {
          action: "checkout.authority",
          result: "denied",
          reason: "rate_limited",
          correlationId,
        });
        return authorityResponse(
          429,
          { error: "RATE_LIMITED" },
          correlationId,
          { "Retry-After": String(rate.retryAfterSeconds) },
        );
      }

      const handoffToken = createCheckoutHandoffCapability(
        handoff,
        {
          destinationId: destinationContext.destinationId,
          tenantId: null,
        },
        handoffSecret,
        { nowEpochSeconds: Math.floor(nowMs / 1_000) },
      );
      if (!handoffToken) {
        recordAuthorityAudit(audit, {
          action: "checkout.authority",
          result: "failure",
          reason: "issuer_unavailable",
          correlationId,
        });
        return authorityResponse(
          503,
          { error: "CHECKOUT_AUTHORITY_UNAVAILABLE" },
          correlationId,
        );
      }

      recordAuthorityAudit(audit, {
        action: "checkout.authority",
        result: "success",
        reason: "issued",
        correlationId,
      });
      return authorityResponse(
        201,
        { data: Object.freeze({ handoffToken }) },
        correlationId,
      );
    },
  });
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
      const active = await authApi.resolveSession(request);
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
    async authorizeTicketingCreate(request, handoff) {
      const active = await authApi.resolveSession(request);
      if (!active) {
        return Object.freeze({
          allowed: false,
          reason: "authentication_required",
        });
      }
      if (active.role === "viewer") {
        return Object.freeze({ allowed: false, reason: "read_only_role" });
      }
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
      const token = header(request, "x-checkout-handoff-token");
      const context = verifyTicketingCheckoutHandoffCapability(
        token,
        handoff,
        handoffSecret,
      );
      if (
        !context ||
        context.requesterKind !== "authenticated" ||
        context.actorSubject !== active.subject ||
        context.destinationId !== destinationId
      ) {
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

export function createPaymentsRefundAuthorizationPort({
  authApi,
  payments,
  access,
}) {
  return Object.freeze({
    async authorizeRefund(request, paymentId) {
      const active = await authApi.resolveSession(request);
      if (!active) {
        return Object.freeze({
          allowed: false,
          reason: "authentication_required",
        });
      }
      const mutation = authApi.authorizeMutation(
        request,
        active,
        "payment.refund",
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

      const business = authorizeBusinessAccess(
        active,
        header(request, "x-business-id"),
        { mutation: true },
      );
      if (!business.allowed || !business.businessId) {
        const reason =
          business.reason === "read_only_role"
            ? "read_only_role"
            : business.reason === "invalid_business_id"
              ? "missing_context"
              : business.reason === "business_access_denied"
                ? "business_access_denied"
                : "authentication_required";
        return Object.freeze({ allowed: false, reason });
      }

      const payment = await payments.findById(paymentId);
      if (!payment || payment.subject.kind !== "order") {
        return Object.freeze({
          allowed: false,
          reason: "business_access_denied",
        });
      }
      let checkoutAccess;
      try {
        checkoutAccess = await access.findByOrderId(payment.subject.reference);
      } catch {
        return Object.freeze({
          allowed: false,
          reason: "business_access_denied",
        });
      }
      if (
        !checkoutAccess ||
        checkoutAccess.paymentId !== payment.id ||
        !checkoutAccess.tenantId ||
        checkoutAccess.tenantId !== business.businessId
      ) {
        return Object.freeze({
          allowed: false,
          reason: "business_access_denied",
        });
      }
      return Object.freeze({
        allowed: true,
        context: Object.freeze({
          actorSubject: active.subject,
          tenantId: checkoutAccess.tenantId,
        }),
      });
    },
  });
}

export function createPaymentsReconciliationAuthorizationPort({ authApi }) {
  return Object.freeze({
    async authorize(request, action) {
      const active = await authApi.resolveSession(request);
      if (!active) {
        return Object.freeze({
          allowed: false,
          reason: "authentication_required",
        });
      }
      if (active.role !== "admin") {
        return Object.freeze({ allowed: false, reason: "admin_required" });
      }
      if (action !== "reconciliation.read") {
        const mutation = authApi.authorizeMutation(request, active, action);
        if (!mutation.allowed) {
          return Object.freeze({
            allowed: false,
            reason:
              mutation.reason === "invalid_csrf"
                ? "invalid_csrf"
                : "cross_origin_request",
          });
        }
      }
      return Object.freeze({
        allowed: true,
        actorSubject: active.subject,
      });
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
  authorityBootstrapTransport: injectedAuthorityBootstrapTransport,
  webhookTransport: injectedWebhookTransport,
  refundTransport: injectedRefundTransport,
  reconciliationTransport: injectedReconciliationTransport,
} = {}) {
  const hasInjectedTransport = Boolean(
    injectedTransport ||
    injectedAuthorityBootstrapTransport ||
    injectedWebhookTransport ||
    injectedRefundTransport ||
    injectedReconciliationTransport,
  );
  let runtime = hasInjectedTransport
    ? Object.freeze({
        transport: injectedTransport ?? null,
        authorityBootstrapTransport:
          injectedAuthorityBootstrapTransport ?? null,
        webhookTransport: injectedWebhookTransport ?? null,
        refundTransport: injectedRefundTransport ?? null,
        reconciliationTransport: injectedReconciliationTransport ?? null,
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
        (async () => {
          await applyOrderingM151Schema(orderingPool);
          await applyOrderingTicketingReservationSchema(orderingPool);
        })(),
        applyFinancialM145Schema(financialPool),
      ]);

      const orders = new MySqlOrderRepository(orderingPool);
      const payments = new MySqlPaymentRepository(financialPool);
      const paymentResults = new MySqlVerifiedPaymentResultRepository(
        financialPool,
      );
      const ledger = new MySqlLedgerTransactionRepository(financialPool);
      const checkoutAccess = new MySqlCheckoutAccessRepository(orderingPool);
      const paymentIdempotency = new MySqlPaymentIdempotencyPort(financialPool);
      const identities = createNodeCheckoutIdentityPort();
      const rateLimits = createInMemoryCheckoutRateLimitPort();
      const outcomes = createVerifiedPaymentOutcomeService({
        payments,
        results: paymentResults,
        clock: systemCheckoutClock,
      });
      const accounting = createVerifiedPaymentAccountingService({
        ledger,
        results: paymentResults,
      });
      const application = createProviderNeutralCheckoutApplicationService({
        orders,
        payments,
        paymentIdempotency,
        identities,
        clock: systemCheckoutClock,
        pricing: createOrderPricingAuthorityFromEnvironment(environment),
      });
      const ticketingApplication = createTicketingCheckoutApplicationService({
        orders,
        bindings: new MySqlTicketingOrderBindingRepository(orderingPool),
        payments,
        paymentIdempotency,
        identities,
      });
      const origins = allowedOrigins(environment.PAYMENTS_RETURN_URL_ORIGINS);
      const authorityBootstrapTransport =
        createPaymentsCheckoutAuthorityBootstrap({
          destinationId: destinationContext.destinationId,
          handoffSecret: environment.PAYMENTS_HANDOFF_SECRET,
          origins,
          production: environment.NODE_ENV === "production",
          rateLimits,
          audit: (event) => runtimeAudit(audit, event),
        });
      const transport = new CheckoutHttpTransport({
        application,
        ticketingApplication,
        orders,
        payments,
        paymentResults,
        access: checkoutAccess,
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
        rateLimits,
        audit: {
          record(event) {
            runtimeAudit(audit, event);
            return Promise.resolve();
          },
        },
        clock: systemCheckoutClock,
        ...(statusTtlSeconds === undefined ? {} : { statusTtlSeconds }),
      });
      const reconciliationApplication = createReconciliationApplicationService({
        payments,
        results: paymentResults,
        ledger,
        provider:
          createSandboxReconciliationProviderFromEnvironment(environment),
        reconciliation: new MySqlFinancialReconciliationRepository(
          financialPool,
        ),
        clock: systemCheckoutClock,
      });
      const reconciliationTransport = new ReconciliationHttpTransport({
        application: reconciliationApplication,
        authorization: createPaymentsReconciliationAuthorizationPort({
          authApi,
        }),
        rateLimits: {
          consume(input) {
            return rateLimits.consume(input);
          },
        },
        audit: {
          record(event) {
            runtimeAudit(audit, event);
            return Promise.resolve();
          },
        },
        clock: systemCheckoutClock,
      });
      const refundApplication = createRefundApplicationService({
        payments,
        results: paymentResults,
        ledger,
        refunds: new MySqlRefundRequestRepository(financialPool),
        provider: createSandboxRefundProviderFromEnvironment(environment),
        clock: systemCheckoutClock,
      });
      const refundTransport = new RefundHttpTransport({
        application: refundApplication,
        authorization: createPaymentsRefundAuthorizationPort({
          authApi,
          payments,
          access: checkoutAccess,
        }),
        rateLimits: {
          consume(input) {
            return rateLimits.consume(input);
          },
        },
        audit: {
          record(event) {
            runtimeAudit(audit, event);
            return Promise.resolve();
          },
        },
        clock: systemCheckoutClock,
      });
      const webhookTransport = new FinancialWebhookHttpTransport({
        verifier: createSandboxWebhookVerifierFromEnvironment(environment),
        events: new MySqlProviderWebhookEventRepository(financialPool),
        payments,
        outcomes,
        accounting,
        audit: {
          record(event) {
            runtimeAudit(audit, event);
            return Promise.resolve();
          },
        },
        clock: systemCheckoutClock,
      });
      runtime = Object.freeze({
        transport,
        authorityBootstrapTransport,
        webhookTransport,
        refundTransport,
        reconciliationTransport,
        pools,
      });
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
        pathname === checkoutAuthorityPath ||
        pathname === checkoutPrefix ||
        pathname.startsWith(checkoutPrefix + "/") ||
        pathname.startsWith(refundHttpPrefix + "/") ||
        pathname.startsWith(reconciliationHttpPrefix + "/")
      );
    },
    start,
    stop,
    async handle(request, response, requestUrl) {
      const correlationId =
        normalizeCheckoutCorrelationId(header(request, "x-correlation-id")) ||
        "corr_" + randomUUID();
      const authorityRequest = requestUrl.pathname === checkoutAuthorityPath;
      const webhookRequest = requestUrl.pathname === sandboxWebhookPath;
      const refundRequest =
        requestUrl.pathname.startsWith(refundHttpPrefix + "/") &&
        requestUrl.pathname.endsWith("/refunds");
      const reconciliationRequest = requestUrl.pathname.startsWith(
        reconciliationHttpPrefix + "/",
      );
      const unavailableCode = authorityRequest
        ? "CHECKOUT_AUTHORITY_UNAVAILABLE"
        : webhookRequest
          ? "WEBHOOK_UNAVAILABLE"
          : refundRequest
            ? "REFUND_UNAVAILABLE"
            : reconciliationRequest
              ? "RECONCILIATION_UNAVAILABLE"
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
        (authorityRequest ||
          requestUrl.pathname === checkoutPrefix ||
          webhookRequest ||
          refundRequest ||
          reconciliationRequest)
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
          } else if (refundRequest) {
            body = await readJsonBody(request, {
              tooLargeCode: "REFUND_REQUEST_TOO_LARGE",
              emptyCode: "INVALID_REFUND_REQUEST",
              invalidCode: "INVALID_REFUND_JSON",
            });
          } else if (reconciliationRequest) {
            body = await readJsonBody(request, {
              tooLargeCode: "RECONCILIATION_REQUEST_TOO_LARGE",
              emptyCode: "INVALID_RECONCILIATION_REQUEST",
              invalidCode: "INVALID_RECONCILIATION_JSON",
            });
          } else if (authorityRequest) {
            body = await readJsonBody(request, {
              tooLargeCode: "AUTHORITY_REQUEST_TOO_LARGE",
              emptyCode: "INVALID_AUTHORITY_REQUEST",
              invalidCode: "INVALID_AUTHORITY_JSON",
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
              error: authorityRequest
                ? "INVALID_AUTHORITY_REQUEST"
                : webhookRequest
                  ? "INVALID_WEBHOOK_REQUEST"
                  : refundRequest
                    ? "INVALID_REFUND_REQUEST"
                    : reconciliationRequest
                      ? "INVALID_RECONCILIATION_REQUEST"
                      : "INVALID_CHECKOUT_REQUEST",
            },
            correlationId,
          );
          return;
        }
      }

      const selectedTransport = authorityRequest
        ? runtime.authorityBootstrapTransport
        : webhookRequest
          ? runtime.webhookTransport
          : refundRequest
            ? runtime.refundTransport
            : reconciliationRequest
              ? runtime.reconciliationTransport
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
          action: authorityRequest
            ? "checkout.authority.http"
            : webhookRequest
              ? "webhook.http"
              : refundRequest
                ? "payment.refund.http"
                : reconciliationRequest
                  ? "reconciliation.http"
                  : "checkout.http",
          result: "failure",
          reason: "unhandled_transport_failure",
          correlationId,
        });
        sendJson(response, 503, { error: unavailableCode }, correlationId);
      }
    },
  });
}
