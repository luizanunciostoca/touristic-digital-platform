import {
  hasAuthCapability,
  isPlatformWideAuthRole,
} from "@touristic/auth";
import {
  AffiliateAdminQueryService,
  AffiliateIdentityApplicationService,
  applyAffiliatesIdentityEligibilityM155,
  applyAffiliatesM154Schema,
  createAffiliatePool,
} from "@touristic/affiliates-server";

function actorAllowed(actor, capability) {
  return Boolean(
    actor &&
      isPlatformWideAuthRole(actor.role) &&
      hasAuthCapability(actor.role, capability),
  );
}

function authorizationPort() {
  return Object.freeze({
    async authorize(action, context) {
      const allowed =
        action === "affiliate.administer" &&
        context.actorKind === "platform_admin" &&
        typeof context.actorReference === "string" &&
        context.actorReference.length > 0 &&
        typeof context.correlationId === "string" &&
        context.correlationId.length > 0;
      return Object.freeze({
        allowed,
        decisionReference: allowed
          ? `control-center:affiliate-admin:${context.correlationId}`.slice(
              0,
              180,
            )
          : "control-center:affiliate-admin:denied",
      });
    },
  });
}

function unavailable() {
  return Object.freeze({ status: "unavailable", data: null });
}

export function createAffiliateAdminRuntime({
  getEnvironmentValue = (key) => process.env[key] ?? "",
} = {}) {
  const databaseUrl = String(
    getEnvironmentValue("AFFILIATES_DATABASE_URL") || "",
  ).trim();
  let pool = null;
  let queries = null;
  let identity = null;
  let started = false;
  let startAttempted = false;
  let startError = databaseUrl ? "AFFILIATE_ADMIN_NOT_STARTED" : null;

  async function start() {
    if (started || startAttempted) return started;
    startAttempted = true;
    if (!databaseUrl) {
      started = true;
      return true;
    }
    try {
      pool = createAffiliatePool(databaseUrl);
      await applyAffiliatesM154Schema(pool);
      await applyAffiliatesIdentityEligibilityM155(pool);
      queries = new AffiliateAdminQueryService(pool);
      identity = new AffiliateIdentityApplicationService(
        pool,
        authorizationPort(),
      );
      startError = null;
      started = true;
      return true;
    } catch (error) {
      startError =
        error instanceof Error
          ? error.message.slice(0, 160)
          : "AFFILIATE_ADMIN_START_FAILED";
      if (pool) await pool.end().catch(() => undefined);
      pool = null;
      queries = null;
      identity = null;
      started = false;
      return false;
    }
  }

  async function stop() {
    const activePool = pool;
    pool = null;
    queries = null;
    identity = null;
    started = false;
    startAttempted = false;
    if (activePool) await activePool.end();
  }

  function readinessCheck() {
    if (!databaseUrl) {
      return Object.freeze({
        status: "pass",
        critical: false,
        detail: "disabled-by-configuration",
      });
    }
    return Object.freeze({
      status: started && queries && identity ? "pass" : "fail",
      critical: false,
      detail:
        started && queries && identity
          ? "affiliate-admin-ready"
          : startError || "AFFILIATE_ADMIN_UNAVAILABLE",
    });
  }

  async function adminList(actor, input = {}) {
    if (!actorAllowed(actor, "affiliate.read")) {
      return Object.freeze({ status: "denied", data: null });
    }
    if (!queries) return unavailable();
    try {
      const data = await queries.list(input);
      return Object.freeze({ status: "found", data });
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message === "AFFILIATE_ADMIN_QUERY_TOO_LONG" ||
          error.message === "AFFILIATE_ADMIN_INVALID_LIMIT")
      ) {
        return Object.freeze({ status: "invalid", data: null });
      }
      return unavailable();
    }
  }

  async function adminRead(actor, affiliateId) {
    if (!actorAllowed(actor, "affiliate.read")) {
      return Object.freeze({ status: "denied", data: null });
    }
    if (!queries) return unavailable();
    try {
      const data = await queries.read(affiliateId);
      return Object.freeze({
        status: data ? "found" : "not_found",
        data,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "AFFILIATE_ADMIN_INVALID_AFFILIATE_ID"
      ) {
        return Object.freeze({ status: "invalid", data: null });
      }
      return unavailable();
    }
  }

  async function adminChangeMembershipStatus(actor, input) {
    if (!actorAllowed(actor, "affiliate.suspend")) {
      return Object.freeze({ status: "denied", data: null });
    }
    if (!identity || !queries) return unavailable();
    const status = input?.status;
    if (status !== "suspended" && status !== "approved") {
      return Object.freeze({ status: "invalid", data: null });
    }
    try {
      const membership = await identity.changeMembershipStatus({
        actor: {
          actorKind: "platform_admin",
          actorReference: actor.subject,
          correlationId: input.correlationId,
        },
        affiliateId: input.affiliateId,
        programId: input.programId,
        destinationId: input.destinationId,
        status,
        occurredAt: new Date().toISOString(),
      });
      const detail = await queries.read(input.affiliateId);
      return Object.freeze({
        status: "updated",
        data: Object.freeze({ membership, detail }),
      });
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      if (
        code === "AFFILIATE_MEMBERSHIP_NOT_FOUND" ||
        code === "AFFILIATE_NOT_FOUND"
      ) {
        return Object.freeze({ status: "not_found", data: null });
      }
      if (
        code === "AFFILIATE_MEMBERSHIP_TRANSITION_INVALID" ||
        code === "AFFILIATE_AUTHORIZATION_CONTEXT_INCOMPLETE"
      ) {
        return Object.freeze({ status: "conflict", data: null, error: code });
      }
      if (code === "AFFILIATE_AUTHORIZATION_DENIED") {
        return Object.freeze({ status: "denied", data: null });
      }
      return Object.freeze({
        status: "unavailable",
        data: null,
        error: code || "AFFILIATE_ADMIN_MUTATION_FAILED",
      });
    }
  }

  return Object.freeze({
    start,
    stop,
    readinessCheck,
    adminList,
    adminRead,
    adminChangeMembershipStatus,
  });
}
