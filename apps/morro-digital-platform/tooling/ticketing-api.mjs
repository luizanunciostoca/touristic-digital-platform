import { randomUUID } from "node:crypto";

import { normalizeTicketSigningSecret } from "../../../packages/ticketing/dist/index.js";
import {
  createTicketingCheckoutApplicationService,
} from "@touristic/ordering/ticketing-checkout";
import {
  createTicketingReservationOrderApplicationService,
} from "@touristic/ordering/ticketing-reservation";
import {
  MySqlCheckoutAccessRepository,
  MySqlOrderRepository,
  MySqlTicketingOrderBindingRepository,
  TicketingCheckoutHttpTransport,
  applyOrderingM139Schema,
  applyOrderingTicketingReservationSchema,
  createCheckoutReturnUrlPolicyFromEnvironment,
  createCheckoutStatusCapability,
  createInMemoryCheckoutRateLimitPort,
  createNodeCheckoutIdentityPort,
  createOrderingMySqlPoolFromEnvironment,
  normalizeCheckoutRequestContext,
  systemCheckoutClock,
  ticketingCheckoutPath,
} from "@touristic/ordering-server";
import {
  MySqlPaymentIdempotencyPort,
  MySqlPaymentRepository,
  MySqlVerifiedPaymentResultFeed,
  MySqlVerifiedPaymentResultRepository,
  applyFinancialM145Schema,
  createFinancialMySqlPoolFromEnvironment,
  createSandboxCheckoutProviderFromEnvironment,
} from "@touristic/financial-server";
import {
  MySqlFinancialResultCursorRepository,
  MySqlRefundedReservationCancellationRepository,
  MySqlTicketCheckInRepository,
  MySqlTicketHolderProfileRepository,
  MySqlTicketOfflineEnvelopeRepository,
  MySqlTicketRepository,
  MySqlTicketReservationRepository,
  MySqlTicketingPublicReadRepository,
  MySqlTicketingTransactionalCommand,
  TicketingPublicHttpTransport,
  applyTicketingPublicApiSchema,
  createOrderingFinancialReservationConfirmationAuthority,
  createTicketOfflineDeviceSyncService,
  createTicketReservationApplicationService,
  createTicketReservationFulfillmentService,
  createTicketingApplicationService,
  createTicketingMySqlPoolFromEnvironment,
  createVerifiedFinancialResultProcessor,
  createVerifiedPaymentTicketFulfillmentHandler,
  createVerifiedRefundTicketCancellationHandler,
  ticketingHttpPrefix,
} from "../../../services/ticketing/dist/index.js";

const maxBodyBytes = 32 * 1024;

class TicketingHttpInputError extends Error {
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

function sendJson(response, result, fallbackCorrelationId) {
  const correlationId =
    result.headers?.["X-Correlation-ID"] || fallbackCorrelationId;
  response.statusCode = result.status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Correlation-ID", correlationId);
  for (const [name, value] of Object.entries(result.headers ?? {})) {
    response.setHeader(name, value);
  }
  response.end(JSON.stringify(result.body));
}

async function readJsonBody(request) {
  const declared = Number(header(request, "content-length") || "0");
  if (Number.isFinite(declared) && declared > maxBodyBytes) {
    throw new TicketingHttpInputError(413, "TICKETING_REQUEST_TOO_LARGE");
  }
  const chunks = [];
  let total = 0;
  for await (const raw of request) {
    const chunk =
      typeof raw === "string"
        ? Buffer.from(raw)
        : raw instanceof Uint8Array
          ? Buffer.from(raw)
          : null;
    if (!chunk) {
      throw new TicketingHttpInputError(400, "INVALID_TICKETING_REQUEST");
    }
    total += chunk.length;
    if (total > maxBodyBytes) {
      throw new TicketingHttpInputError(413, "TICKETING_REQUEST_TOO_LARGE");
    }
    chunks.push(chunk);
  }
  if (total === 0) {
    throw new TicketingHttpInputError(400, "INVALID_TICKETING_REQUEST");
  }
  try {
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)),
    );
  } catch {
    throw new TicketingHttpInputError(400, "INVALID_TICKETING_JSON");
  }
}

function collectEnvironment(getEnvironmentValue) {
  const keys = [
    "NODE_ENV",
    "TICKETING_FEATURE_ENABLED",
    "TICKETING_DATABASE_URL",
    "TICKETING_SIGNING_SECRET",
    "TICKETING_OFFLINE_PROVISIONING_SECRET",
    "TICKETING_FINANCIAL_POLL_INTERVAL_MS",
    "ORDERING_DATABASE_URL",
    "FINANCIAL_DATABASE_URL",
    "PAYMENTS_STATUS_TOKEN_SECRET",
    "PAYMENTS_RETURN_URL_ORIGINS",
    "PAYMENTS_PROVIDER_MODE",
    "PAYMENTS_SANDBOX_PROVIDER_BASE_URL",
    "PAYMENTS_SANDBOX_PROVIDER_API_TOKEN",
    "PAYMENTS_SANDBOX_CHECKOUT_ORIGINS",
    "PAYMENTS_PROVIDER_TIMEOUT_MS",
    "PAYMENTS_WEBHOOK_URL",
  ];
  return Object.freeze(
    Object.fromEntries(
      keys.map((key) => [
        key,
        String(getEnvironmentValue(key) ?? "").trim(),
      ]),
    ),
  );
}

function featureEnabled(value) {
  return value === "true";
}

function pollInterval(value) {
  if (!value) return 1_000;
  if (!/^[0-9]+$/u.test(value)) {
    throw new Error("TICKETING_FINANCIAL_POLL_INTERVAL_MS_INVALID");
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 500 || parsed > 60_000) {
    throw new Error("TICKETING_FINANCIAL_POLL_INTERVAL_MS_INVALID");
  }
  return parsed;
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
      url.hash
    ) {
      return "";
    }
    return url.toString();
  } catch {
    return "";
  }
}

function auditSafely(audit, event) {
  try {
    audit(Object.freeze({ ...event }));
  } catch {
    // Audit delivery cannot change Ticketing authority.
  }
}

export function createTicketingAuthorizationPort({ authApi }) {
  return Object.freeze({
    async authorize(request, { mutation, admin = false }) {
      const active = authApi.resolveSession(request);
      if (!active) {
        return Object.freeze({
          allowed: false,
          reason: "authentication_required",
        });
      }
      if (admin && active.role !== "admin") {
        return Object.freeze({ allowed: false, reason: "admin_required" });
      }
      if (mutation) {
        if (active.role === "viewer") {
          return Object.freeze({ allowed: false, reason: "read_only_role" });
        }
        const decision = authApi.authorizeMutation(
          request,
          active,
          "ticketing.mutate",
        );
        if (!decision.allowed) {
          return Object.freeze({
            allowed: false,
            reason:
              decision.reason === "invalid_csrf"
                ? "invalid_csrf"
                : "cross_origin_request",
          });
        }
      }
      return Object.freeze({
        allowed: true,
        actor: Object.freeze({ subject: active.subject, role: active.role }),
      });
    },
  });
}

export function createTicketingCheckoutAuthorizationPort({
  authApi,
  reservations,
  holders,
}) {
  return Object.freeze({
    async authorizeCreate(request, handoff) {
      const active = authApi.resolveSession(request);
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
      const reservation = await reservations.findReservationById(
        handoff.reservationReference,
      );
      const holder = await holders.findByHolderReference(active.subject);
      if (
        !reservation ||
        reservation.holderReference !== active.subject ||
        (reservation.status !== "held" &&
          reservation.status !== "confirmed") ||
        !holder ||
        holder.holderName !== handoff.customer.name ||
        holder.email !== handoff.customer.email ||
        holder.phone !== handoff.customer.phone ||
        holder.document !== handoff.customer.document
      ) {
        return Object.freeze({
          allowed: false,
          reason: "business_access_denied",
        });
      }
      const context = normalizeCheckoutRequestContext({
        requesterKind: "authenticated",
        actorSubject: active.subject,
        destinationId: reservation.destinationId,
        tenantId: null,
      });
      return context
        ? Object.freeze({ allowed: true, context })
        : Object.freeze({ allowed: false, reason: "missing_context" });
    },
  });
}

export function createTicketingApi({
  authApi,
  getEnvironmentValue = (key) => process.env[key] ?? "",
  audit = (event) =>
    console.warn(`[ticketing-audit] ${JSON.stringify(event)}`),
  publicTransport: injectedPublicTransport,
  checkoutTransport: injectedCheckoutTransport,
} = {}) {
  const injected = Boolean(injectedPublicTransport || injectedCheckoutTransport);
  let runtime = injected
    ? Object.freeze({
        publicTransport: injectedPublicTransport ?? null,
        checkoutTransport: injectedCheckoutTransport ?? null,
        pools: [],
        processorTimer: null,
        processing: null,
      })
    : null;
  let started = injected;
  let startAttempted = injected;

  async function start() {
    if (started || startAttempted) return started;
    startAttempted = true;
    const pools = [];
    try {
      if (!authApi) throw new Error("TICKETING_AUTH_API_REQUIRED");
      const environment = collectEnvironment(getEnvironmentValue);
      const enabled = featureEnabled(environment.TICKETING_FEATURE_ENABLED);
      if (!enabled) {
        runtime = Object.freeze({
          publicTransport: new TicketingPublicHttpTransport({
            enabled: false,
          }),
          checkoutTransport: null,
          pools,
          processorTimer: null,
          processing: null,
        });
        started = true;
        return true;
      }

      const signingSecret = normalizeTicketSigningSecret(
        environment.TICKETING_SIGNING_SECRET,
      );
      if (!signingSecret) {
        throw new Error("TICKETING_SIGNING_SECRET_REQUIRED");
      }
      if (environment.TICKETING_OFFLINE_PROVISIONING_SECRET.length < 32) {
        throw new Error("TICKETING_OFFLINE_PROVISIONING_SECRET_REQUIRED");
      }
      const webhookUrl = configuredWebhookUrl(
        environment.PAYMENTS_WEBHOOK_URL,
        environment.NODE_ENV === "production",
      );
      if (!webhookUrl) throw new Error("PAYMENTS_WEBHOOK_URL_REQUIRED");

      const ticketingPool = createTicketingMySqlPoolFromEnvironment(environment);
      const orderingPool = createOrderingMySqlPoolFromEnvironment(environment);
      const financialPool = createFinancialMySqlPoolFromEnvironment(environment);
      pools.push(ticketingPool, orderingPool, financialPool);
      await Promise.all([
        applyTicketingPublicApiSchema(ticketingPool),
        (async () => {
          await applyOrderingM139Schema(orderingPool);
          await applyOrderingTicketingReservationSchema(orderingPool);
        })(),
        applyFinancialM145Schema(financialPool),
      ]);

      const reservations = new MySqlTicketReservationRepository(ticketingPool);
      const holders = new MySqlTicketHolderProfileRepository(ticketingPool);
      const tickets = new MySqlTicketRepository(ticketingPool);
      const checkIns = new MySqlTicketCheckInRepository(ticketingPool);
      const offline = new MySqlTicketOfflineEnvelopeRepository(ticketingPool);
      const transactions = new MySqlTicketingTransactionalCommand(ticketingPool);
      const reads = new MySqlTicketingPublicReadRepository(ticketingPool);
      const refundReservations =
        new MySqlRefundedReservationCancellationRepository(ticketingPool);

      const orders = new MySqlOrderRepository(orderingPool);
      const bindings = new MySqlTicketingOrderBindingRepository(orderingPool);
      const payments = new MySqlPaymentRepository(financialPool);
      const verifiedResults = new MySqlVerifiedPaymentResultRepository(
        financialPool,
      );
      const identities = createNodeCheckoutIdentityPort();
      const reservationOrders = createTicketingReservationOrderApplicationService(
        {
          orders,
          bindings,
          identities,
        },
      );
      const ticketing = createTicketingApplicationService({
        orders,
        payments,
        tickets,
        checkIns,
        offline,
        transactions,
        signingSecret,
        clock: systemCheckoutClock,
      });
      const confirmationAuthority =
        createOrderingFinancialReservationConfirmationAuthority({
          bindings,
          orders,
          payments,
          verifiedResults,
        });
      const confirmations = createTicketReservationApplicationService({
        reservations,
        confirmationAuthority,
        clock: systemCheckoutClock,
      });
      const fulfillment = createTicketReservationFulfillmentService({
        reservations,
        confirmations,
        ticketing,
        holderProfiles: holders,
      });
      const fulfillmentHandler = createVerifiedPaymentTicketFulfillmentHandler({
        bindings,
        fulfillment,
      });
      const refundHandler = createVerifiedRefundTicketCancellationHandler({
        bindings,
        payments,
        verifiedResults,
        reservations: refundReservations,
      });
      const processor = createVerifiedFinancialResultProcessor({
        feed: new MySqlVerifiedPaymentResultFeed(financialPool),
        cursor: new MySqlFinancialResultCursorRepository(ticketingPool),
        fulfillment: fulfillmentHandler,
        refunds: refundHandler,
      });
      const offlineDevices = createTicketOfflineDeviceSyncService({
        provisioningSecret: environment.TICKETING_OFFLINE_PROVISIONING_SECRET,
        qrSigningSecret: signingSecret,
        tickets,
        ticketing,
        clock: systemCheckoutClock,
      });
      const publicTransport = new TicketingPublicHttpTransport({
        enabled: true,
        reservations,
        reads,
        holders,
        reservationOrders,
        tickets,
        ticketing,
        offlineDevices,
        authorization: createTicketingAuthorizationPort({ authApi }),
        audit: {
          record(event) {
            auditSafely(audit, event);
            return Promise.resolve();
          },
        },
        qrSigningSecret: signingSecret,
        offlineProvisioningSecret:
          environment.TICKETING_OFFLINE_PROVISIONING_SECRET,
        clock: systemCheckoutClock,
      });

      const checkoutAccess = new MySqlCheckoutAccessRepository(orderingPool);
      const rateLimits = createInMemoryCheckoutRateLimitPort();
      const statusCapabilities = createCheckoutStatusCapability(
        environment.PAYMENTS_STATUS_TOKEN_SECRET,
      );
      const checkoutApplication = createTicketingCheckoutApplicationService({
        orders,
        bindings,
        payments,
        paymentIdempotency: new MySqlPaymentIdempotencyPort(financialPool),
        identities,
      });
      const checkoutTransport = new TicketingCheckoutHttpTransport({
        application: checkoutApplication,
        access: checkoutAccess,
        provider: createSandboxCheckoutProviderFromEnvironment(environment),
        webhookUrl,
        authorization: createTicketingCheckoutAuthorizationPort({
          authApi,
          reservations,
          holders,
        }),
        returnUrls: createCheckoutReturnUrlPolicyFromEnvironment(environment),
        statusCapabilities,
        rateLimits,
        audit: {
          record(event) {
            auditSafely(audit, event);
            return Promise.resolve();
          },
        },
        clock: systemCheckoutClock,
      });

      let processing = null;
      const drain = async () => {
        if (processing) return processing;
        processing = processor
          .drain(100)
          .catch((error) => {
            auditSafely(audit, {
              action: "ticketing.financial_results",
              result: "failure",
              reason:
                error instanceof Error ? error.message : "unknown",
            });
          })
          .finally(() => {
            processing = null;
          });
        return processing;
      };
      await drain();
      const processorTimer = setInterval(
        () => void drain(),
        pollInterval(environment.TICKETING_FINANCIAL_POLL_INTERVAL_MS),
      );
      processorTimer.unref?.();

      runtime = {
        publicTransport,
        checkoutTransport,
        pools,
        processorTimer,
        get processing() {
          return processing;
        },
      };
      started = true;
      auditSafely(audit, {
        action: "ticketing.runtime",
        result: "success",
        reason: "ready",
      });
      return true;
    } catch (error) {
      await Promise.allSettled(pools.map((pool) => pool.end()));
      runtime = null;
      auditSafely(audit, {
        action: "ticketing.runtime",
        result: "failure",
        reason:
          error instanceof Error
            ? error.message
            : "configuration_or_persistence_unavailable",
      });
      return false;
    }
  }

  async function stop() {
    if (runtime?.processorTimer) clearInterval(runtime.processorTimer);
    await runtime?.processing;
    const pools = runtime?.pools ?? [];
    runtime = null;
    started = false;
    await Promise.allSettled(pools.map((pool) => pool.end()));
  }

  return Object.freeze({
    matches(pathname) {
      return (
        pathname === ticketingHttpPrefix ||
        pathname.startsWith(`${ticketingHttpPrefix}/`) ||
        pathname === ticketingCheckoutPath
      );
    },
    start,
    stop,
    async handle(request, response, requestUrl) {
      const correlationId =
        header(request, "x-correlation-id") || `corr_${randomUUID()}`;
      if (!runtime) {
        sendJson(
          response,
          {
            status: 503,
            headers: {},
            body: { error: "TICKETING_UNAVAILABLE" },
          },
          correlationId,
        );
        return;
      }
      const method = String(request.method || "GET").toUpperCase();
      let body;
      if (method === "POST") {
        const contentType = header(request, "content-type")
          .split(";", 1)[0]
          .toLowerCase();
        if (contentType !== "application/json") {
          sendJson(
            response,
            {
              status: 415,
              headers: {},
              body: { error: "UNSUPPORTED_MEDIA_TYPE" },
            },
            correlationId,
          );
          return;
        }
        try {
          body = await readJsonBody(request);
        } catch (error) {
          const status =
            error instanceof TicketingHttpInputError ? error.status : 400;
          const code =
            error instanceof TicketingHttpInputError
              ? error.code
              : "INVALID_TICKETING_REQUEST";
          sendJson(
            response,
            { status, headers: {}, body: { error: code } },
            correlationId,
          );
          return;
        }
      }

      const selected =
        requestUrl.pathname === ticketingCheckoutPath
          ? runtime.checkoutTransport
          : runtime.publicTransport;
      if (!selected) {
        sendJson(
          response,
          {
            status: 503,
            headers: {},
            body: { error: "TICKETING_FEATURE_DISABLED" },
          },
          correlationId,
        );
        return;
      }
      const result = await selected.handle({
        method,
        pathname: requestUrl.pathname,
        headers: request.headers ?? {},
        body,
        clientIp: request.socket?.remoteAddress,
        correlationId,
      });
      sendJson(response, result, correlationId);
    },
  });
}
