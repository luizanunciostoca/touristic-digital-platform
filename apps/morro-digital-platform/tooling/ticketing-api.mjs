import { randomUUID } from "node:crypto";

import {
  MySqlCrmCommerceCustomerRepository,
  applyCrmCommerceSchema,
  createCrmMySqlPoolFromEnvironment,
} from "@touristic/crm-server";
import { normalizeTicketingCheckoutHandoff } from "@touristic/ordering/ticketing-checkout";
import { createTicketingReservationOrderApplicationService } from "@touristic/ordering/ticketing-reservation";
import {
  MySqlOrderRepository,
  MySqlTicketingOrderBindingRepository,
  applyOrderingTicketingReservationSchema,
  createNodeCheckoutIdentityPort,
  createOrderingMySqlPoolFromEnvironment,
  createTicketingCheckoutHandoffCapability,
  systemCheckoutClock,
} from "@touristic/ordering-server";
import {
  MySqlPaymentRepository,
  MySqlVerifiedPaymentResultFeed,
  MySqlVerifiedPaymentResultRepository,
  createFinancialMySqlPoolFromEnvironment,
} from "@touristic/financial-server";

const ticketingHttpPrefix = "/api/ticketing/v1";
const maxBodyBytes = 32 * 1024;
const auditStringMaxLength = 256;
const auditReasonPattern = /^[A-Za-z0-9_.:-]{1,160}$/u;
const sensitiveAuditKeyPattern =
  /(?:authorization|cookie|password|secret|token|session|signature|card|security.?code|cpf|document|email|phone|prompt|query.?string|access.?key|refresh.?key)/iu;

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
    if (!chunk)
      throw new TicketingHttpInputError(400, "INVALID_TICKETING_REQUEST");
    total += chunk.length;
    if (total > maxBodyBytes) {
      throw new TicketingHttpInputError(413, "TICKETING_REQUEST_TOO_LARGE");
    }
    chunks.push(chunk);
  }
  if (total === 0)
    throw new TicketingHttpInputError(400, "INVALID_TICKETING_REQUEST");
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
    "TICKETING_FEATURE_ENABLED",
    "TICKETING_DATABASE_URL",
    "TICKETING_SIGNING_SECRET",
    "TICKETING_OFFLINE_PROVISIONING_SECRET",
    "TICKETING_FINANCIAL_POLL_INTERVAL_MS",
    "ORDERING_DATABASE_URL",
    "FINANCIAL_DATABASE_URL",
    "PAYMENTS_HANDOFF_SECRET",
    "PAYMENTS_DESTINATION_ID",
    "CRM_DATABASE_URL",
  ];
  return Object.freeze(
    Object.fromEntries(
      keys.map((key) => [key, String(getEnvironmentValue(key) ?? "").trim()]),
    ),
  );
}

function featureEnabled(value) {
  if (!value || value === "false") return false;
  if (value === "true") return true;
  throw new Error("TICKETING_FEATURE_ENABLED_INVALID");
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

function sanitizeAuditValue(key, value, depth = 0) {
  if (sensitiveAuditKeyPattern.test(key)) return "[REDACTED]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    const bounded = value
      .replace(/[\u0000-\u001f\u007f]/gu, " ")
      .replace(/\s+/gu, " ")
      .trim()
      .slice(0, auditStringMaxLength);
    if (key.toLowerCase() === "reason" && !auditReasonPattern.test(bounded)) {
      return "redacted_failure_detail";
    }
    return bounded;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (depth >= 3) return "[REDACTED_COMPLEX_VALUE]";
  if (Array.isArray(value)) {
    return value
      .slice(0, 20)
      .map((item) => sanitizeAuditValue(key, item, depth + 1));
  }
  if (typeof value === "object") {
    return Object.freeze(
      Object.fromEntries(
        Object.entries(value)
          .slice(0, 50)
          .map(([nestedKey, nestedValue]) => [
            nestedKey.slice(0, 160),
            sanitizeAuditValue(nestedKey, nestedValue, depth + 1),
          ]),
      ),
    );
  }
  return String(value).slice(0, auditStringMaxLength);
}

function sanitizeAuditEvent(event) {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(event ?? {}).map(([key, value]) => [
        key.slice(0, 160),
        sanitizeAuditValue(key, value),
      ]),
    ),
  );
}

function auditSafely(audit, event) {
  try {
    audit(sanitizeAuditEvent(event));
  } catch {
    // Audit delivery cannot change Ticketing authority.
  }
}

function syncErrorCode(error) {
  const raw =
    typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : error instanceof Error
        ? error.name
        : "CRM_SYNC_FAILED";
  return /^[A-Za-z0-9_.:-]{1,160}$/u.test(raw) ? raw : "CRM_SYNC_FAILED";
}

export function createTicketingAuthorizationPort({ authApi }) {
  return Object.freeze({
    async authorize(request, { mutation, admin = false }) {
      const active = await authApi.resolveSession(request);
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
        actor: Object.freeze({
          subject: active.subject,
          role: active.role,
          businessIds: Object.freeze([...(active.businessIds ?? [])]),
        }),
      });
    },
  });
}

export function createTicketingApi({
  authApi,
  getEnvironmentValue = (key) => process.env[key] ?? "",
  audit = (event) => console.warn(`[ticketing-audit] ${JSON.stringify(event)}`),
  publicTransport: injectedPublicTransport,
} = {}) {
  const injected = Boolean(injectedPublicTransport);
  let runtime = injected
    ? Object.freeze({
        publicTransport: injectedPublicTransport,
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
          publicTransport: Object.freeze({
            async handle({ correlationId }) {
              return Object.freeze({
                status: 503,
                headers: Object.freeze({
                  "X-Correlation-ID": correlationId,
                }),
                body: Object.freeze({ error: "TICKETING_FEATURE_DISABLED" }),
              });
            },
          }),
          pools,
          processorTimer: null,
          processing: null,
        });
        started = true;
        return true;
      }

      const [{ normalizeTicketSigningSecret }, ticketingRuntime] =
        await Promise.all([
          import("@touristic/ticketing"),
          import("@touristic/ticketing-server"),
        ]);
      const {
        MySqlFinancialResultCursorRepository,
        MySqlRefundedReservationCancellationRepository,
        MySqlTicketCheckInRepository,
        MySqlTicketHolderProfileRepository,
        MySqlTicketOfflineDeviceRegistry,
        MySqlTicketOfflineEnvelopeRepository,
        MySqlTicketRepository,
        MySqlTicketReservationRepository,
        MySqlTicketingBusinessInventoryRepository,
        MySqlTicketingCommerceCrmOutbox,
        MySqlTicketingPublicReadRepository,
        MySqlTicketingTransactionalCommand,
        TicketingCommerceHttpTransport,
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
      } = ticketingRuntime;

      const signingSecret = normalizeTicketSigningSecret(
        environment.TICKETING_SIGNING_SECRET,
      );
      if (!signingSecret) throw new Error("TICKETING_SIGNING_SECRET_REQUIRED");
      if (environment.TICKETING_OFFLINE_PROVISIONING_SECRET.length < 32) {
        throw new Error("TICKETING_OFFLINE_PROVISIONING_SECRET_REQUIRED");
      }
      if (environment.PAYMENTS_HANDOFF_SECRET.length < 32) {
        throw new Error("PAYMENTS_HANDOFF_SECRET_REQUIRED");
      }
      if (
        !/^[a-z0-9][a-z0-9_-]{1,119}$/u.test(
          environment.PAYMENTS_DESTINATION_ID,
        )
      ) {
        throw new Error("PAYMENTS_DESTINATION_ID_REQUIRED");
      }

      const ticketingPool =
        createTicketingMySqlPoolFromEnvironment(environment);
      const orderingPool = createOrderingMySqlPoolFromEnvironment(environment);
      const financialPool =
        createFinancialMySqlPoolFromEnvironment(environment);
      pools.push(ticketingPool, orderingPool, financialPool);
      await Promise.all([
        applyTicketingPublicApiSchema(ticketingPool),
        applyOrderingTicketingReservationSchema(orderingPool),
        financialPool.execute(
          "SELECT payment_id FROM financial_payments LIMIT 1",
        ),
        financialPool.execute(
          "SELECT result_id FROM financial_payment_results LIMIT 1",
        ),
      ]);

      let crmCommerce = null;
      let crmRetryAttempt = 0;
      let crmRetryNotBefore = 0;
      const ensureCrmCommerce = async ({ force = false } = {}) => {
        if (!environment.CRM_DATABASE_URL) return null;
        if (crmCommerce) return crmCommerce;
        const now = Date.now();
        if (!force && now < crmRetryNotBefore) return null;

        let candidatePool = null;
        try {
          candidatePool = createCrmMySqlPoolFromEnvironment({
            CRM_DATABASE_URL: environment.CRM_DATABASE_URL,
          });
          await applyCrmCommerceSchema(candidatePool);
          pools.push(candidatePool);
          crmCommerce = new MySqlCrmCommerceCustomerRepository(candidatePool);
          crmRetryAttempt = 0;
          crmRetryNotBefore = 0;
          return crmCommerce;
        } catch (error) {
          await candidatePool?.end().catch(() => {});
          crmRetryAttempt = Math.min(crmRetryAttempt + 1, 10);
          crmRetryNotBefore =
            now +
            Math.min(60_000, 1_000 * 2 ** Math.min(crmRetryAttempt - 1, 6));
          auditSafely(audit, {
            action: "ticketing.crm_sync",
            result: "failure",
            reason: syncErrorCode(error),
          });
          return null;
        }
      };
      await ensureCrmCommerce({ force: true });

      const reservations = new MySqlTicketReservationRepository(ticketingPool);
      const holders = new MySqlTicketHolderProfileRepository(ticketingPool);
      const tickets = new MySqlTicketRepository(ticketingPool);
      const checkIns = new MySqlTicketCheckInRepository(ticketingPool);
      const offline = new MySqlTicketOfflineEnvelopeRepository(ticketingPool);
      const offlineDeviceRegistry = new MySqlTicketOfflineDeviceRegistry(
        ticketingPool,
      );
      const transactions = new MySqlTicketingTransactionalCommand(
        ticketingPool,
      );
      const reads = new MySqlTicketingPublicReadRepository(ticketingPool);
      const businessInventory = new MySqlTicketingBusinessInventoryRepository(
        ticketingPool,
      );
      const commerceCrmOutbox = new MySqlTicketingCommerceCrmOutbox(
        ticketingPool,
      );
      const refundReservations =
        new MySqlRefundedReservationCancellationRepository(ticketingPool);

      const orders = new MySqlOrderRepository(orderingPool);
      const bindings = new MySqlTicketingOrderBindingRepository(orderingPool);
      const payments = new MySqlPaymentRepository(financialPool);
      const verifiedResults = new MySqlVerifiedPaymentResultRepository(
        financialPool,
      );
      const reservationOrders =
        createTicketingReservationOrderApplicationService({
          orders,
          bindings,
          identities: createNodeCheckoutIdentityPort(),
        });
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
      const verifiedPaymentFulfillment =
        createVerifiedPaymentTicketFulfillmentHandler({
          bindings,
          fulfillment,
        });
      const fulfillmentHandler = Object.freeze({
        async handle(result) {
          const fulfilled = await verifiedPaymentFulfillment.handle(result);
          if (!fulfilled) return fulfilled;
          try {
            await commerceCrmOutbox.enqueueConfirmedPurchase(fulfilled);
          } catch (error) {
            auditSafely(audit, {
              action: "ticketing.crm_outbox",
              result: "failure",
              reason: syncErrorCode(error),
            });
          }
          return fulfilled;
        },
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
        devices: offlineDeviceRegistry,
        clock: systemCheckoutClock,
      });
      const checkoutHandoffs = Object.freeze({
        issue(input, actor) {
          const handoff = normalizeTicketingCheckoutHandoff(input);
          if (!handoff) return null;
          const token = createTicketingCheckoutHandoffCapability(
            handoff,
            {
              actorSubject: actor.subject,
              destinationId: environment.PAYMENTS_DESTINATION_ID,
              requesterKind: actor.subject.startsWith("guest:")
                ? "guest_capability"
                : "authenticated",
            },
            environment.PAYMENTS_HANDOFF_SECRET,
          );
          return token ? Object.freeze({ ...handoff, token }) : null;
        },
      });
      const publicTransport = new TicketingCommerceHttpTransport({
        enabled: true,
        reservations,
        reads,
        holders,
        reservationOrders,
        checkoutHandoffs,
        tickets,
        ticketing,
        offlineDevices,
        offlineDeviceRegistry,
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
        businessInventory,
        destinationId: environment.PAYMENTS_DESTINATION_ID,
      });

      const drainCommerceCrm = async () => {
        await commerceCrmOutbox.reconcileMissingConfirmedPurchases(100);
        const activeCrmCommerce = await ensureCrmCommerce();
        if (!activeCrmCommerce) return;
        const events = await commerceCrmOutbox.listPending(100);
        for (const event of events) {
          try {
            const holder = await holders.findByHolderReference(
              event.holderReference,
            );
            if (!holder) {
              await commerceCrmOutbox.markAttempt(
                event.id,
                "HOLDER_PROFILE_NOT_FOUND",
              );
              continue;
            }
            await activeCrmCommerce.recordConfirmedPurchase({
              eventId: event.id,
              reservationId: event.reservationId,
              holderReference: event.holderReference,
              holderName: holder.holderName,
              email: holder.email,
              phone: holder.phone,
              inventoryId: event.inventoryId,
              orderId: event.orderId,
              paymentId: event.paymentId,
              destinationId: event.destinationId,
              productKind: event.productKind,
              productReference: event.productReference,
              quantity: event.quantity,
              amountMinor: event.amountMinor,
              currency: event.currency,
              purchasedAt: event.occurredAt,
            });
            await commerceCrmOutbox.markPublished(
              event.id,
              systemCheckoutClock.now(),
            );
          } catch (error) {
            const code = syncErrorCode(error);
            await commerceCrmOutbox.markAttempt(event.id, code).catch(() => {});
            auditSafely(audit, {
              action: "ticketing.crm_sync",
              result: "failure",
              reason: code,
            });
          }
        }
      };

      let processing = null;
      const drain = async () => {
        if (processing) return processing;
        processing = processor
          .drain(100)
          .catch(() => {
            auditSafely(audit, {
              action: "ticketing.financial_results",
              result: "failure",
              reason: "processor_failure",
            });
          })
          .then(async () => {
            try {
              await drainCommerceCrm();
            } catch (error) {
              auditSafely(audit, {
                action: "ticketing.crm_sync",
                result: "failure",
                reason: syncErrorCode(error),
              });
            }
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
    } catch {
      await Promise.allSettled(pools.map((pool) => pool.end()));
      runtime = null;
      auditSafely(audit, {
        action: "ticketing.runtime",
        result: "failure",
        reason: "configuration_or_persistence_unavailable",
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
        pathname.startsWith(`${ticketingHttpPrefix}/`)
      );
    },
    start,
    stop,
    async handle(request, response, requestUrl) {
      const correlationId =
        header(request, "x-correlation-id") || `corr_${randomUUID()}`;
      if (!runtime?.publicTransport) {
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
      const result = await runtime.publicTransport.handle({
        method,
        pathname: requestUrl.pathname,
        headers: request.headers ?? {},
        body,
        correlationId,
      });
      sendJson(response, result, correlationId);
    },
  });
}
