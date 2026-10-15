import { shouldApplyRuntimeSchema } from "./database-schema-mode.mjs";
import { randomUUID } from "node:crypto";
import {
  hasAuthCapability,
  isPlatformWideAuthRole,
  isReadOnlyAuthRole,
} from "@touristic/auth";

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
    "RENDER_SERVICE_NAME",
    "TICKETING_FEATURE_ENABLED",
    "MORRO_DATABASE_SCHEMA_MODE",
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

const ticketingFinancialStages = new Set([
  "cursor_load",
  "feed_list_after",
  "fulfillment_handle",
  "refund_handle",
  "cursor_save",
]);
const ticketingFinancialCodes = new Set([
  "ER_NO_SUCH_TABLE",
  "ER_BAD_FIELD_ERROR",
  "ER_TABLEACCESS_DENIED_ERROR",
  "ER_DBACCESS_DENIED_ERROR",
  "ER_ACCESS_DENIED_ERROR",
  "ER_BAD_DB_ERROR",
  "ER_PARSE_ERROR",
  "ER_WRONG_ARGUMENTS",
  "ER_LOCK_DEADLOCK",
  "ER_LOCK_WAIT_TIMEOUT",
  "ER_DUP_ENTRY",
  "ER_BAD_NULL_ERROR",
  "ER_DATA_TOO_LONG",
  "ER_TRUNCATED_WRONG_VALUE",
  "ER_NO_DEFAULT_FOR_FIELD",
  "PROTOCOL_CONNECTION_LOST",
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "TICKETING_FINANCIAL_CURSOR_INVALID",
  "FINANCIAL_INVALID_DB_TIMESTAMP",
  "FINANCIAL_INVALID_PERSISTED_PAYMENT_RESULT",
  "UNKNOWN_FAILURE",
]);

export function sanitizeTicketingFinancialFailure(error) {
  try {
    const source = error && typeof error === "object" ? error : {};
    const stage = source.stage;
    const code = source.diagnosticCode;

    return Object.freeze({
      stage:
        typeof stage === "string" && ticketingFinancialStages.has(stage)
          ? stage
          : "unclassified",
      code:
        typeof code === "string" && ticketingFinancialCodes.has(code)
          ? code
          : "UNKNOWN_FAILURE",
    });
  } catch {
    return Object.freeze({ stage: "unclassified", code: "UNKNOWN_FAILURE" });
  }
}

const ticketingStartupStages = new Set([
  "preflight",
  "module_load",
  "credential_validation",
  "database_pool",
  "ticketing_schema",
  "ordering_schema",
  "financial_payment_probe",
  "financial_result_probe",
  "crm_bridge",
  "service_setup",
  "financial_drain",
]);
const ticketingStartupCodes = new Set([
  ...ticketingFinancialCodes,
  "ER_DUP_KEYNAME",
  "ER_CANNOT_ADD_FOREIGN",
  "ER_FK_DUP_NAME",
  "ER_TABLE_EXISTS_ERROR",
  "ER_SPECIFIC_ACCESS_DENIED_ERROR",
  "TICKETING_AUTH_API_REQUIRED",
  "TICKETING_FEATURE_ENABLED_INVALID",
  "TICKETING_SIGNING_SECRET_REQUIRED",
  "TICKETING_OFFLINE_PROVISIONING_SECRET_REQUIRED",
  "PAYMENTS_HANDOFF_SECRET_REQUIRED",
  "PAYMENTS_DESTINATION_ID_REQUIRED",
  "MORRO_DATABASE_SCHEMA_MODE_INVALID",
  "STAGING_ORDERING_READBACK_POOL_INVALID",
  "STAGING_ORDERING_DB_IDENTITY_MISMATCH",
  "STAGING_ORDERING_SCHEMA_INCOMPLETE",
  "STAGING_ORDERING_SOURCE_KIND_DRIFT",
  "STAGING_ORDERING_FOREIGN_KEY_DRIFT",
]);
export function sanitizeTicketingStartupFailure(error, stage) {
  let code = "UNKNOWN_FAILURE";
  try {
    const rawCode = error && typeof error === "object" ? error.code : null;
    const rawMessage = error instanceof Error ? error.message : null;
    if (typeof rawCode === "string" && ticketingStartupCodes.has(rawCode)) {
      code = rawCode;
    } else if (
      typeof rawMessage === "string" &&
      ticketingStartupCodes.has(rawMessage)
    ) {
      code = rawMessage;
    }
  } catch {
    // Hostile error/proxy access is never logged.
  }
  return Object.freeze({
    stage: ticketingStartupStages.has(stage) ? stage : "unclassified",
    code,
  });
}

// Preserve the first rejection selected by Promise.all: later concurrent
// failures must never relabel its code with a different operation.
export function createTicketingStartupFailureTracker() {
  let firstFailureStage = null;
  return Object.freeze({
    track(promise, stage) {
      return Promise.resolve(promise).catch((error) => {
        if (firstFailureStage === null) firstFailureStage = stage;
        throw error;
      });
    },
    get firstFailureStage() {
      return firstFailureStage;
    },
  });
}
const stagingOrderingIdentity = Object.freeze({
  database: "morro_ordering_staging",
  user: "morro_ordering",
});
const stagingOrderingSourceEnum =
  "enum('business_onboarding','ticketing_reservation','restaurant_reservation')";
const stagingOrderingRequiredBindingColumns = new Map([
  ["reservation_reference", "varchar(120)"],
  ["order_id", "varchar(120)"],
  ["product_reference", "varchar(120)"],
  ["quantity", "smallint unsigned"],
  ["amount_minor", "bigint unsigned"],
  ["currency", "char(3)"],
  ["pricing_version", "varchar(80)"],
  ["bound_at", "datetime(3)"],
]);

export function isStagingOrderingSchemaReadbackService(serviceName) {
  return String(serviceName ?? "").trim() === "morro-digital-v2-staging";
}

// Staging predeploy is the schema writer; the runtime must prove the
// immutable target and its relationships, never repeat DDL during rollout.
export async function verifyStagingOrderingTicketingSchema(pool) {
  if (!pool || typeof pool.query !== "function") {
    throw new Error("STAGING_ORDERING_READBACK_POOL_INVALID");
  }
  const [identities] = await pool.query(
    "SELECT DATABASE() AS database_name, SUBSTRING_INDEX(CURRENT_USER(), '@', 1) AS user_name",
  );
  if (
    !Array.isArray(identities) ||
    identities.length !== 1 ||
    identities[0]?.database_name !== stagingOrderingIdentity.database ||
    identities[0]?.user_name !== stagingOrderingIdentity.user
  ) {
    throw new Error("STAGING_ORDERING_DB_IDENTITY_MISMATCH");
  }
  const [columns] = await pool.query(
    [
      "SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name, COLUMN_TYPE AS column_type",
      "FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()",
      "AND ((TABLE_NAME = 'ordering_orders' AND COLUMN_NAME = 'source_kind')",
      "OR TABLE_NAME = 'ordering_ticketing_reservation_bindings')",
    ].join(" "),
  );
  if (!Array.isArray(columns)) {
    throw new Error("STAGING_ORDERING_SCHEMA_INCOMPLETE");
  }
  const sourceColumns = columns.filter(
    (row) =>
      row?.table_name === "ordering_orders" &&
      row?.column_name === "source_kind",
  );
  if (
    sourceColumns.length !== 1 ||
    sourceColumns[0].column_type !== stagingOrderingSourceEnum
  ) {
    throw new Error("STAGING_ORDERING_SOURCE_KIND_DRIFT");
  }
  for (const [name, type] of stagingOrderingRequiredBindingColumns) {
    const matches = columns.filter(
      (row) =>
        row?.table_name === "ordering_ticketing_reservation_bindings" &&
        row?.column_name === name,
    );
    if (matches.length !== 1 || matches[0].column_type !== type) {
      throw new Error("STAGING_ORDERING_SCHEMA_INCOMPLETE");
    }
  }
  const [foreignKeys] = await pool.query(
    [
      "SELECT CONSTRAINT_NAME AS constraint_name, COLUMN_NAME AS column_name,",
      "REFERENCED_TABLE_NAME AS referenced_table, REFERENCED_COLUMN_NAME AS referenced_column",
      "FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE()",
      "AND TABLE_NAME = 'ordering_ticketing_reservation_bindings' AND COLUMN_NAME = 'order_id'",
      "AND REFERENCED_TABLE_NAME IS NOT NULL",
    ].join(" "),
  );
  if (
    !Array.isArray(foreignKeys) ||
    foreignKeys.length !== 1 ||
    foreignKeys[0]?.constraint_name !== "fk_ordering_ticketing_order" ||
    foreignKeys[0]?.column_name !== "order_id" ||
    foreignKeys[0]?.referenced_table !== "ordering_orders" ||
    foreignKeys[0]?.referenced_column !== "order_id"
  ) {
    throw new Error("STAGING_ORDERING_FOREIGN_KEY_DRIFT");
  }
  await pool.query("SELECT source_kind FROM ordering_orders LIMIT 0");
  await pool.query(
    "SELECT reservation_reference, order_id, product_reference, quantity, amount_minor, currency, pricing_version, bound_at FROM ordering_ticketing_reservation_bindings LIMIT 0",
  );
  return Object.freeze({
    contract: "STAGING-TICKETING-ORDERING-READBACK",
    status: "pass",
    database: stagingOrderingIdentity.database,
    user: stagingOrderingIdentity.user,
    requiredBindingColumns: stagingOrderingRequiredBindingColumns.size,
    foreignKeyVerified: true,
  });
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
      if (admin && !hasAuthCapability(active.role, "ticketing.manage")) {
        return Object.freeze({ allowed: false, reason: "admin_required" });
      }
      if (mutation) {
        if (isReadOnlyAuthRole(active.role)) {
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
      const transportRole =
        isPlatformWideAuthRole(active.role) &&
        hasAuthCapability(active.role, "ticketing.manage")
          ? "admin"
          : isReadOnlyAuthRole(active.role)
            ? "viewer"
            : "editor";
      return Object.freeze({
        allowed: true,
        actor: Object.freeze({
          subject: active.subject,
          role: transportRole,
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
  adminService: injectedAdminService,
  businessInventory: injectedBusinessInventory,
  notificationBridge: injectedNotificationBridge,
} = {}) {
  const injected = Boolean(injectedPublicTransport);
  let runtime = injected
    ? Object.freeze({
        publicTransport: injectedPublicTransport,
        adminService: injectedAdminService ?? null,
        businessInventory: injectedBusinessInventory ?? null,
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
    let startupStage = "preflight";
    const startupFailureTracker = createTicketingStartupFailureTracker();
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
          adminService: null,
          businessInventory: null,
          pools,
          processorTimer: null,
          processing: null,
        });
        started = true;
        return true;
      }

      startupStage = "module_load";
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
        TicketingAdminService,
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

      startupStage = "credential_validation";
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

      startupStage = "database_pool";
      const ticketingPool =
        createTicketingMySqlPoolFromEnvironment(environment);
      const orderingPool = createOrderingMySqlPoolFromEnvironment(environment);
      const financialPool =
        createFinancialMySqlPoolFromEnvironment(environment);
      pools.push(ticketingPool, orderingPool, financialPool);
      // Keep startup checks concurrent; emit only allowlisted failure stages.
      const traceStartupCheck = (promise, stage) =>
        startupFailureTracker.track(promise, stage);
      const stagingReadback = isStagingOrderingSchemaReadbackService(
        environment.RENDER_SERVICE_NAME,
      );
      const applyRuntimeSchema = shouldApplyRuntimeSchema(environment);
      await Promise.all([
        ...(applyRuntimeSchema
          ? [
              traceStartupCheck(
                applyTicketingPublicApiSchema(ticketingPool),
                "ticketing_schema",
              ),
            ]
          : []),
        ...(stagingReadback || applyRuntimeSchema
          ? [
              traceStartupCheck(
                stagingReadback
                  ? verifyStagingOrderingTicketingSchema(orderingPool)
                  : applyOrderingTicketingReservationSchema(orderingPool),
                "ordering_schema",
              ),
            ]
          : []),
        traceStartupCheck(
          financialPool.execute(
            "SELECT payment_id FROM financial_payments LIMIT 1",
          ),
          "financial_payment_probe",
        ),
        traceStartupCheck(
          financialPool.execute(
            "SELECT result_id FROM financial_payment_results LIMIT 1",
          ),
          "financial_result_probe",
        ),
      ]);

      startupStage = "crm_bridge";
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
          if (shouldApplyRuntimeSchema(environment)) {
            await applyCrmCommerceSchema(candidatePool);
          }
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

      startupStage = "service_setup";
      const reservations = new MySqlTicketReservationRepository(ticketingPool);
      const adminService = new TicketingAdminService(ticketingPool);
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

          if (typeof injectedNotificationBridge?.ticketIssued === "function") {
            try {
              const inventory = await adminService.readInventory(
                fulfilled.reservation.inventoryId,
              );
              if (!inventory?.businessId || !inventory?.offer?.label) {
                auditSafely(audit, {
                  action: "ticketing.notification_ticket_issued",
                  result: "suppressed",
                  reason: "notification_source_metadata_unavailable",
                });
              } else {
                const notificationResult =
                  await injectedNotificationBridge.ticketIssued({
                    tenantId: inventory.businessId,
                    destinationId: fulfilled.reservation.destinationId,
                    recipientReference: fulfilled.reservation.holderReference,
                    occurredAt: fulfilled.reservation.confirmedAt,
                    ticketReference: fulfilled.ticket.id,
                    experienceName: inventory.offer.label,
                  });
                auditSafely(audit, {
                  action: "ticketing.notification_ticket_issued",
                  result:
                    notificationResult === "enqueued" ||
                    notificationResult === "duplicate"
                      ? "success"
                      : "suppressed",
                  reason: notificationResult,
                });
              }
            } catch (error) {
              auditSafely(audit, {
                action: "ticketing.notification_ticket_issued",
                result: "failure",
                reason: syncErrorCode(error),
              });
            }
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
          .catch((error) => {
            const diagnostic = sanitizeTicketingFinancialFailure(error);
            auditSafely(audit, {
              action: "ticketing.financial_results",
              result: "failure",
              reason: "processor_failure",
              stage: diagnostic.stage,
              code: diagnostic.code,
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
      startupStage = "financial_drain";
      await drain();
      const processorTimer = setInterval(
        () => void drain(),
        pollInterval(environment.TICKETING_FINANCIAL_POLL_INTERVAL_MS),
      );
      processorTimer.unref?.();

      runtime = {
        publicTransport,
        adminService,
        businessInventory,
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
      const diagnosis = sanitizeTicketingStartupFailure(
        error,
        startupFailureTracker.firstFailureStage ?? startupStage,
      );
      await Promise.allSettled(pools.map((pool) => pool.end()));
      runtime = null;
      auditSafely(audit, {
        action: "ticketing.runtime",
        result: "failure",
        reason: "configuration_or_persistence_unavailable",
        startupStage: diagnosis.stage,
        diagnosticCode: diagnosis.code,
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

  async function actionFactsForOffers({ businessId, offerIds } = {}) {
    if (!runtime?.publicTransport || !runtime?.businessInventory) {
      return Object.freeze([]);
    }
    try {
      const bindings = await runtime.businessInventory.listCatalogBindings(
        String(businessId ?? ""),
        Array.isArray(offerIds) ? offerIds.map(String) : [],
      );
      if (bindings.length === 0) return Object.freeze([]);

      const inventoryResponse = await runtime.publicTransport.handle({
        method: "GET",
        pathname: `${ticketingHttpPrefix}/inventory`,
        headers: Object.freeze({}),
        correlationId: `action-facts_${randomUUID()}`,
      });
      const inventory =
        inventoryResponse.status >= 200 &&
        inventoryResponse.status < 300 &&
        Array.isArray(inventoryResponse.body?.data)
          ? inventoryResponse.body.data
          : [];
      const byId = new Map(
        inventory
          .filter(
            (entry) =>
              entry &&
              typeof entry === "object" &&
              typeof entry.id === "string",
          )
          .map((entry) => [entry.id, entry]),
      );

      return Object.freeze(
        bindings.map((binding) => {
          const entry = byId.get(binding.inventoryId);
          const quantity =
            entry && Number.isSafeInteger(entry.availableQuantity)
              ? entry.availableQuantity
              : null;
          return Object.freeze({
            offerId: binding.offerId,
            availableQuantity: quantity,
            providerAvailable: Boolean(entry),
          });
        }),
      );
    } catch (error) {
      auditSafely(audit, {
        action: "ticketing.action_facts",
        result: "failure",
        reason: syncErrorCode(error),
      });
      return Object.freeze([]);
    }
  }

  async function adminTransportMutation(
    request,
    pathname,
    body,
    extraHeaders = {},
    successStatus = "updated",
  ) {
    if (!runtime?.publicTransport) {
      return Object.freeze({
        status: "unavailable",
        data: null,
        error: "TICKETING_ADMIN_UNAVAILABLE",
      });
    }
    try {
      const result = await runtime.publicTransport.handle({
        method: "POST",
        pathname,
        headers: Object.freeze({
          ...(request?.headers ?? {}),
          ...extraHeaders,
        }),
        body,
        correlationId:
          request?.morroCorrelationId ??
          header(request ?? { headers: {} }, "x-correlation-id") ??
          `corr_${randomUUID()}`,
      });
      if (result.status >= 200 && result.status < 300) {
        return Object.freeze({
          status: successStatus,
          data: result.body?.data ?? null,
        });
      }
      const error =
        typeof result.body?.error === "string"
          ? result.body.error
          : "TICKETING_ADMIN_UNAVAILABLE";
      if (result.status === 400) {
        return Object.freeze({ status: "invalid", data: null, error });
      }
      if (result.status === 401 || result.status === 403) {
        return Object.freeze({ status: "denied", data: null, error });
      }
      if (result.status === 404) {
        return Object.freeze({ status: "not_found", data: null, error });
      }
      if (result.status === 409) {
        return Object.freeze({ status: "conflict", data: null, error });
      }
      return Object.freeze({ status: "unavailable", data: null, error });
    } catch (error) {
      return Object.freeze({
        status: "unavailable",
        data: null,
        error: syncErrorCode(error),
      });
    }
  }

  async function adminResult(operation, successStatus = "found") {
    if (!runtime?.adminService) {
      return Object.freeze({
        status: "unavailable",
        data: null,
        error: "TICKETING_ADMIN_UNAVAILABLE",
      });
    }
    try {
      const data = await operation(runtime.adminService);
      if (data === null) {
        return Object.freeze({ status: "not_found", data: null });
      }
      return Object.freeze({ status: successStatus, data });
    } catch (error) {
      const raw = error instanceof Error ? error.message : "";
      const code = raw.split(":", 1)[0] || "TICKETING_ADMIN_UNAVAILABLE";
      if (code.includes("_INVALID")) {
        return Object.freeze({ status: "invalid", data: null, error: code });
      }
      if (code.includes("_NOT_FOUND")) {
        return Object.freeze({ status: "not_found", data: null, error: code });
      }
      if (code.includes("_NOT_HELD") || code.includes("_CONFLICT")) {
        return Object.freeze({ status: "conflict", data: null, error: code });
      }
      return Object.freeze({ status: "unavailable", data: null, error: code });
    }
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
    actionFactsForOffers,
    adminListInventory(input) {
      return adminResult((service) => service.listInventory(input));
    },
    adminReadInventory(inventoryId) {
      return adminResult((service) => service.readInventory(inventoryId));
    },
    adminListReservations(input) {
      return adminResult((service) => service.listReservations(input));
    },
    adminReadReservation(reservationId) {
      return adminResult((service) => service.readReservation(reservationId));
    },
    adminCancelHeldReservation(input) {
      return adminResult(
        (service) => service.cancelHeldReservation(input),
        "updated",
      );
    },
    adminCreateBusinessOffer({ request, businessId, offer, requestKey }) {
      return adminTransportMutation(
        request,
        `${ticketingHttpPrefix}/operator/businesses/${encodeURIComponent(
          businessId,
        )}/inventory`,
        offer,
        { "idempotency-key": requestKey },
        "created",
      );
    },
    adminDisableBusinessOffer({ request, businessId, inventoryId }) {
      return adminTransportMutation(
        request,
        `${ticketingHttpPrefix}/operator/businesses/${encodeURIComponent(
          businessId,
        )}/inventory/${encodeURIComponent(inventoryId)}/disable`,
        {},
      );
    },
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
