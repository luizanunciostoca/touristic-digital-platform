import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { laneCContractById } from "./contract-registry.mjs";

const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{8,120}$/u;
const REF = /^[A-Za-z0-9][A-Za-z0-9._:-]{1,179}$/u;
const PREPARE_TTL_MIN_MS = 1_000;
const PREPARE_TTL_MAX_MS = 15 * 60_000;

const requiredCapability = Object.freeze({
  "IF-COM-005": "commerce.transport.reserve",
  "IF-COM-006": "commerce.lodging.reserve",
  "IF-BIZ-010": "business.reservations.manage",
  "IF-AFF-002": "affiliate.self_onboard",
  "IF-AFF-006": "affiliate.referral_qr.issue",
});

const forbiddenAuthorityKeys = new Set([
  "amountminor",
  "commission",
  "commissionminor",
  "commissionrate",
  "entitlement",
  "entitlementid",
  "financialtruth",
  "ledger",
  "ledgerentry",
  "moneytruth",
  "payment",
  "paymentconfirmed",
  "paymentstatus",
  "payout",
  "payoutid",
  "refundfinalstate",
  "settlement",
  "settlementid",
  "wallet",
  "walletid",
]);

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
}

function digest(value) {
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}

function safeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string" || !left || !right)
    return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function containsForbiddenAuthority(value) {
  if (Array.isArray(value)) return value.some(containsForbiddenAuthority);
  if (!value || typeof value !== "object") return false;
  for (const [key, nested] of Object.entries(value)) {
    if (forbiddenAuthorityKeys.has(key.replaceAll("_", "").toLowerCase()))
      return true;
    if (containsForbiddenAuthority(nested)) return true;
  }
  return false;
}

function assertReference(value, code) {
  if (typeof value !== "string" || !REF.test(value)) throw new Error(code);
  return value;
}

function nowMs(context) {
  const value = Number(context?.nowMs ?? Date.now());
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new Error("LANE_C_CLOCK_INVALID");
  return value;
}

function assertContext(command, context) {
  assertReference(context?.subject, "AUTH_REQUIRED");
  if (context.authState !== "active")
    throw new Error(
      context.authState === "revoked" ? "AUTH_REVOKED" : "AUTH_INACTIVE",
    );
  if (!Number.isSafeInteger(context.authzVersion) || context.authzVersion <= 0)
    throw new Error("AUTHZ_VERSION_INVALID");
  if (context.role === "viewer") throw new Error("READ_ONLY_ROLE");

  const capability = requiredCapability[command.contractId];
  if (
    !capability ||
    !Array.isArray(context.capabilities) ||
    !context.capabilities.includes(capability)
  ) {
    throw new Error("CAPABILITY_DENIED");
  }

  if (
    typeof context.expectedOrigin !== "string" ||
    context.origin !== context.expectedOrigin
  )
    throw new Error("ORIGIN_DENIED");
  if (!safeEqual(context.csrfToken, context.expectedCsrfToken))
    throw new Error("INVALID_CSRF");

  assertReference(command.tenantId, "TENANT_REQUIRED");
  if (context.tenantId !== command.tenantId) throw new Error("WRONG_TENANT");

  assertReference(command.destinationId, "DESTINATION_REQUIRED");
  if (
    !Array.isArray(context.destinationIds) ||
    !context.destinationIds.includes(command.destinationId)
  ) {
    throw new Error("WRONG_DESTINATION");
  }

  if (command.businessId) {
    assertReference(command.businessId, "BUSINESS_REQUIRED");
    if (
      context.role !== "admin" &&
      (!Array.isArray(context.businessIds) ||
        !context.businessIds.includes(command.businessId))
    ) {
      throw new Error("WRONG_BUSINESS");
    }
  }

  if (
    (command.contractId === "IF-AFF-002" ||
      command.contractId === "IF-AFF-006") &&
    containsForbiddenAuthority(command.payload)
  ) {
    throw new Error("AFFILIATE_FINANCIAL_AUTHORITY_FORBIDDEN");
  }
}

function assertSameScope(record, context) {
  if (record.subject !== context.subject)
    throw new Error("CROSS_SUBJECT_DENIED");
  if (record.tenantId !== context.tenantId)
    throw new Error("CROSS_TENANT_DENIED");
  if (record.authzVersion !== context.authzVersion)
    throw new Error("STALE_AUTHORIZATION");
  if (!context.destinationIds?.includes(record.destinationId))
    throw new Error("WRONG_DESTINATION");
  if (
    record.businessId &&
    context.role !== "admin" &&
    !context.businessIds?.includes(record.businessId)
  )
    throw new Error("WRONG_BUSINESS");
}

export class InMemoryLaneCMutationStore {
  constructor(seed) {
    this.preparations = seed?.preparations ?? new Map();
    this.claims = seed?.claims ?? new Map();
  }

  durableState() {
    return { preparations: this.preparations, claims: this.claims };
  }

  async createPreparation(record) {
    if (this.preparations.has(record.id))
      throw new Error("PREPARATION_ID_CONFLICT");
    this.preparations.set(record.id, structuredClone(record));
    return structuredClone(record);
  }

  async loadPreparation(id) {
    const value = this.preparations.get(id);
    return value ? structuredClone(value) : null;
  }

  async transitionPreparation(id, expectedStatus, patch) {
    const current = this.preparations.get(id);
    if (!current) throw new Error("PREPARATION_NOT_FOUND");
    if (current.status !== expectedStatus) throw new Error("STALE_STATE");
    const next = { ...current, ...structuredClone(patch) };
    this.preparations.set(id, next);
    return structuredClone(next);
  }

  async claimExecution(key, semanticDigest, metadata) {
    const current = this.claims.get(key);
    if (current) {
      if (current.semanticDigest !== semanticDigest)
        throw new Error("IDEMPOTENCY_CONFLICT");
      return { ...structuredClone(current), newlyClaimed: false };
    }
    const created = {
      semanticDigest,
      status: "claimed",
      result: null,
      ...structuredClone(metadata),
    };
    this.claims.set(key, created);
    return { ...structuredClone(created), newlyClaimed: true };
  }

  async completeExecution(key, result, executedAt) {
    const current = this.claims.get(key);
    if (!current) throw new Error("IDEMPOTENCY_CLAIM_MISSING");
    if (current.status === "executed") return structuredClone(current);
    const next = {
      ...current,
      status: "executed",
      result: structuredClone(result),
      executedAt,
    };
    this.claims.set(key, next);
    return structuredClone(next);
  }

  async loadExecution(key) {
    const current = this.claims.get(key);
    return current ? structuredClone(current) : null;
  }
}

export class LaneCMutationCoordinator {
  constructor({ store, uuid = randomUUID } = {}) {
    if (!store) throw new Error("LANE_C_MUTATION_STORE_REQUIRED");
    this.store = store;
    this.uuid = uuid;
  }

  async prepare(command, context, { ttlMs = 5 * 60_000 } = {}) {
    if (!command || typeof command !== "object" || Array.isArray(command))
      throw new Error("COMMAND_INVALID");
    const contract = laneCContractById(command.contractId);
    if (!contract) throw new Error("CONTRACT_UNSUPPORTED");
    if (contract.classification === "NEW_CANONICAL_CAPABILITY_REQUIRED")
      throw new Error("NEW_CANONICAL_CAPABILITY_REQUIRED");
    if (
      contract.ownerApproved ||
      contract.versionedContractApproved ||
      contract.runtimeBindingEnabled
    ) {
      throw new Error("UNEXPECTED_CONTRACT_AUTHORITY_STATE");
    }

    assertContext(command, context);
    const boundedTtl = Number(ttlMs);
    if (
      !Number.isSafeInteger(boundedTtl) ||
      boundedTtl < PREPARE_TTL_MIN_MS ||
      boundedTtl > PREPARE_TTL_MAX_MS
    ) {
      throw new Error("PREPARE_TTL_INVALID");
    }

    const createdAt = nowMs(context);
    const id = "lc_" + this.uuid().replaceAll("-", "");
    const semanticDigest = digest({
      contractId: command.contractId,
      action: command.action,
      tenantId: command.tenantId,
      destinationId: command.destinationId,
      businessId: command.businessId ?? null,
      payload: command.payload ?? {},
      subject: context.subject,
      authzVersion: context.authzVersion,
    });

    const record = Object.freeze({
      id,
      contractId: command.contractId,
      action: assertReference(command.action, "ACTION_INVALID"),
      subject: context.subject,
      authzVersion: context.authzVersion,
      tenantId: command.tenantId,
      destinationId: command.destinationId,
      businessId: command.businessId ?? null,
      payload: canonical(command.payload ?? {}),
      semanticDigest,
      status: "prepared",
      createdAt,
      expiresAt: createdAt + boundedTtl,
      confirmedAt: null,
      cancelledAt: null,
    });

    await this.store.createPreparation(record);
    return Object.freeze({
      preparationId: id,
      semanticDigest,
      expiresAt: record.expiresAt,
      state: "PREPARED",
      classification: contract.classification,
      ownerApproved: false,
      versionedContractApproved: false,
      runtimeBindingEnabled: false,
      productionAuthorized: false,
    });
  }

  async confirm(preparationId, context, confirmation = "CONFIRM") {
    if (confirmation !== "CONFIRM")
      throw new Error("EXPLICIT_CONFIRMATION_REQUIRED");
    const current = await this.store.loadPreparation(preparationId);
    if (!current) throw new Error("PREPARATION_NOT_FOUND");
    assertSameScope(current, context);
    assertContext(current, context);
    const now = nowMs(context);
    if (current.expiresAt <= now) throw new Error("PREPARATION_EXPIRED");
    const updated = await this.store.transitionPreparation(
      preparationId,
      "prepared",
      {
        status: "confirmed",
        confirmedAt: now,
      },
    );
    return Object.freeze({
      preparationId,
      state: "CONFIRMED",
      confirmedAt: updated.confirmedAt,
    });
  }

  async cancel(preparationId, context) {
    const current = await this.store.loadPreparation(preparationId);
    if (!current) throw new Error("PREPARATION_NOT_FOUND");
    assertSameScope(current, context);
    assertContext(current, context);
    if (current.status === "executed") throw new Error("ALREADY_EXECUTED");
    if (current.status === "cancelled")
      return Object.freeze({
        preparationId,
        state: "CANCELLED",
        replayed: true,
      });
    if (!["prepared", "confirmed"].includes(current.status))
      throw new Error("STALE_STATE");
    const updated = await this.store.transitionPreparation(
      preparationId,
      current.status,
      {
        status: "cancelled",
        cancelledAt: nowMs(context),
      },
    );
    return Object.freeze({
      preparationId,
      state: "CANCELLED",
      replayed: false,
      cancelledAt: updated.cancelledAt,
    });
  }

  async execute(preparationId, idempotencyKey, context, effect) {
    if (context.executionMode !== "LOCAL_PROOF")
      throw new Error("RUNTIME_BINDING_NOT_APPROVED");
    if (!IDEMPOTENCY_KEY.test(String(idempotencyKey ?? "")))
      throw new Error("INVALID_IDEMPOTENCY_KEY");

    const current = await this.store.loadPreparation(preparationId);
    if (!current) throw new Error("PREPARATION_NOT_FOUND");
    assertSameScope(current, context);
    assertContext(current, context);

    const now = nowMs(context);
    if (current.expiresAt <= now) throw new Error("PREPARATION_EXPIRED");
    if (current.status === "cancelled")
      throw new Error("PREPARATION_CANCELLED");
    if (current.status !== "confirmed" && current.status !== "executed")
      throw new Error("CONFIRM_REQUIRED");

    const claimKey = [
      current.contractId,
      current.tenantId,
      current.subject,
      idempotencyKey,
    ].join(":");
    const prior = await this.store.loadExecution(claimKey);
    if (prior) {
      if (prior.semanticDigest !== current.semanticDigest)
        throw new Error("IDEMPOTENCY_CONFLICT");
      if (prior.status === "executed")
        return Object.freeze({
          ...structuredClone(prior.result),
          replayed: true,
        });
      throw new Error("IDEMPOTENCY_IN_FLIGHT");
    }

    const claimed = await this.store.claimExecution(
      claimKey,
      current.semanticDigest,
      {
        preparationId,
        claimedAt: now,
      },
    );
    if (claimed.newlyClaimed === false) {
      if (claimed.semanticDigest !== current.semanticDigest)
        throw new Error("IDEMPOTENCY_CONFLICT");
      if (claimed.status === "executed")
        return Object.freeze({
          ...structuredClone(claimed.result),
          replayed: true,
        });
      throw new Error("IDEMPOTENCY_IN_FLIGHT");
    }

    if (typeof effect !== "function")
      throw new Error("LOCAL_PROOF_EFFECT_REQUIRED");
    const result = await effect(
      Object.freeze({
        contractId: current.contractId,
        action: current.action,
        tenantId: current.tenantId,
        destinationId: current.destinationId,
        businessId: current.businessId,
        payload: structuredClone(current.payload),
        subject: current.subject,
        semanticDigest: current.semanticDigest,
        executionMode: "LOCAL_PROOF",
        externalProviderCallsAllowed: false,
        financialAuthority: false,
        moneyTruthOwner: "Financial",
        affiliateAttributionOwner: "Affiliates",
        commerceLifecycleOwner: "Commerce",
        ticketingLifecycleOwner: "Ticketing",
      }),
    );

    if (!result || typeof result !== "object" || Array.isArray(result))
      throw new Error("LOCAL_PROOF_RESULT_INVALID");
    if (containsForbiddenAuthority(result))
      throw new Error("RESULT_AUTHORITY_ESCALATION_FORBIDDEN");

    const completed = await this.store.completeExecution(claimKey, result, now);
    if (current.status === "confirmed") {
      await this.store.transitionPreparation(preparationId, "confirmed", {
        status: "executed",
      });
    }
    return Object.freeze({
      ...structuredClone(completed.result),
      replayed: false,
    });
  }
}

export async function withBoundedDatabaseRetry(
  operation,
  {
    maxAttempts = 3,
    transient = (error) =>
      [
        "ER_LOCK_DEADLOCK",
        "ER_LOCK_WAIT_TIMEOUT",
        "SQLITE_BUSY",
        "SQLITE_LOCKED",
      ].includes(error?.code),
  } = {},
) {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 5)
    throw new Error("RETRY_BOUND_INVALID");
  let last;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      last = error;
      if (!transient(error) || attempt === maxAttempts) throw error;
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(100, 10 * 2 ** (attempt - 1))),
      );
    }
  }
  throw last;
}

export { digest as laneCSemanticDigest, containsForbiddenAuthority };
