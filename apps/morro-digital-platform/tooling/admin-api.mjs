import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import {
  authorizeCapability,
  canonicalAuthRole,
  capabilitiesForRole,
  isPlatformWideAuthRole,
} from "@touristic/auth";
import { parseCookies } from "@touristic/auth-server";

const adminPrefix = "/api/admin/v1";
const supportCookieName = "md_control_support";
const supportTtlSeconds = 30 * 60;
const stepUpCookieName = "md_control_step_up";
const stepUpTtlSeconds = 10 * 60;
const stepUpWindowMs = 15 * 60 * 1000;
const stepUpAttemptLimit = 5;
const maxBodyBytes = 32 * 1024;

function json(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Vary", "Cookie");
  response.end(JSON.stringify(payload));
}

function firstHeader(value) {
  if (Array.isArray(value)) return firstHeader(value[0]);
  return typeof value === "string" ? value.trim() : "";
}

function bounded(value, max = 240) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, max);
}

function safeReason(value) {
  const reason = bounded(value, 240);
  return reason.length >= 8 ? reason : null;
}

async function readJsonBody(request) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBodyBytes) throw new Error("REQUEST_BODY_TOO_LARGE");
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function encodePayload(payload) {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function signPayload(part, secret) {
  return createHmac("sha256", secret).update(part).digest("base64url");
}

function safeEqual(left, right) {
  const a = Buffer.from(left || "");
  const b = Buffer.from(right || "");
  return a.length === b.length && timingSafeEqual(a, b);
}

function createSupportToken(payload, secret) {
  const part = encodePayload(payload);
  return `${part}.${signPayload(part, secret)}`;
}

function verifySupportToken(token, secret) {
  const [part, signature, ...rest] = String(token || "").split(".");
  if (!part || !signature || rest.length > 0) return null;
  if (!safeEqual(signature, signPayload(part, secret))) return null;
  try {
    const payload = JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
    if (
      typeof payload?.actorSessionId !== "string" ||
      typeof payload?.effectiveUserId !== "string" ||
      typeof payload?.supportSessionId !== "string" ||
      typeof payload?.exp !== "number" ||
      payload.exp <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function serializeSupportCookie(token, production) {
  return [
    `${supportCookieName}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    production ? "Secure" : "",
    `Max-Age=${supportTtlSeconds}`,
  ]
    .filter(Boolean)
    .join("; ");
}

function serializeClearedSupportCookie(production) {
  return [
    `${supportCookieName}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    production ? "Secure" : "",
    "Max-Age=0",
  ]
    .filter(Boolean)
    .join("; ");
}

function createStepUpToken(payload, secret) {
  const part = encodePayload(payload);
  return `${part}.${signPayload(part, secret)}`;
}

function verifyStepUpToken(token, secret) {
  const [part, signature, ...rest] = String(token || "").split(".");
  if (!part || !signature || rest.length > 0) return null;
  if (!safeEqual(signature, signPayload(part, secret))) return null;
  try {
    const payload = JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
    if (
      typeof payload?.actorSessionId !== "string" ||
      typeof payload?.stepUpId !== "string" ||
      typeof payload?.method !== "string" ||
      typeof payload?.exp !== "number" ||
      payload.exp <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function serializeStepUpCookie(token, production) {
  return [
    `${stepUpCookieName}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    production ? "Secure" : "",
    `Max-Age=${stepUpTtlSeconds}`,
  ]
    .filter(Boolean)
    .join("; ");
}

function serializeClearedStepUpCookie(production) {
  return [
    `${stepUpCookieName}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    production ? "Secure" : "",
    "Max-Age=0",
  ]
    .filter(Boolean)
    .join("; ");
}

function userProjection(user) {
  if (!user) return null;
  return Object.freeze({
    id: user.id ?? user.subject,
    email: user.email,
    role: user.role,
    canonicalRole: canonicalAuthRole(user.role),
    capabilities: capabilitiesForRole(user.role),
    businessIds: user.businessIds ?? [],
  });
}

function createRuntimeAuditStore() {
  const entries = [];
  return Object.freeze({
    durability() {
      return "runtime-projection-only";
    },
    async append(entry) {
      entries.push(Object.freeze({ ...entry }));
    },
    async list(limit = 100) {
      const count = Math.max(1, Math.min(250, Number(limit) || 100));
      return Object.freeze(entries.slice(-count).reverse());
    },
  });
}

function businessesFromUsers(users) {
  const byId = new Map();
  for (const user of users) {
    for (const businessId of user.businessIds ?? []) {
      const members = byId.get(businessId) ?? [];
      members.push({
        id: user.id,
        email: user.email,
        role: user.role,
        canonicalRole: canonicalAuthRole(user.role),
      });
      byId.set(businessId, members);
    }
  }
  return Object.freeze(
    Array.from(byId, ([id, members]) =>
      Object.freeze({
        id,
        source: "identity-membership",
        members: Object.freeze(members),
      }),
    ),
  );
}

const namespaceCapabilities = Object.freeze({
  affiliates: Object.freeze({
    read: "affiliate.read",
    mutate: "affiliate.update",
  }),
  businesses: Object.freeze({
    read: "business.read",
    mutate: "business.update",
  }),
  crm: Object.freeze({ read: "crm.read", mutate: "crm.manage" }),
  products: Object.freeze({ read: "business.read", mutate: "business.update" }),
  inventory: Object.freeze({
    read: "business.read",
    mutate: "business.update",
  }),
  reservations: Object.freeze({
    read: "ticketing.read",
    mutate: "ticketing.manage",
  }),
  ticketing: Object.freeze({
    read: "ticketing.read",
    mutate: "ticketing.manage",
  }),
  orders: Object.freeze({ read: "financial.read", mutate: null }),
  payments: Object.freeze({ read: "financial.read", mutate: null }),
  financial: Object.freeze({ read: "financial.read", mutate: null }),
  content: Object.freeze({ read: "content.read", mutate: "content.manage" }),
  destinations: Object.freeze({
    read: "platform.read",
    mutate: "system.manage",
  }),
});

export function createAdminApi({
  authApi,
  platformOperations,
  getEnvironmentValue = (key) => process.env[key] ?? "",
  domainAdapters = {},
  auditStore = createRuntimeAuditStore(),
} = {}) {
  if (
    !authApi?.resolveSession ||
    !authApi?.authorizeMutation ||
    !authApi?.reauthenticate ||
    !authApi?.listConfiguredUsers ||
    !authApi?.findConfiguredUser ||
    !authApi?.listUserSessions ||
    !authApi?.revokeUserSession
  ) {
    throw new Error("CONTROL_CENTER_AUTH_BOUNDARY_REQUIRED");
  }
  if (!platformOperations?.healthSnapshot || !platformOperations?.emit) {
    throw new Error("CONTROL_CENTER_OPERATIONS_BOUNDARY_REQUIRED");
  }

  const production = getEnvironmentValue("NODE_ENV") === "production";
  const supportSecret = String(
    getEnvironmentValue("CONTROL_CENTER_SUPPORT_SECRET") ||
      (production ? "" : getEnvironmentValue("DASHBOARD_AUTH_SECRET")) ||
      "",
  ).trim();
  const stepUpSecret = String(
    getEnvironmentValue("CONTROL_CENTER_STEP_UP_SECRET") ||
      (production ? "" : getEnvironmentValue("DASHBOARD_AUTH_SECRET")) ||
      "",
  ).trim();
  const stepUpAttempts = new Map();

  async function audit(request, actor, event) {
    const entry = Object.freeze({
      actorUserId: actor?.subject ?? null,
      actorRole: actor?.role ?? null,
      actorCapabilities: actor ? capabilitiesForRole(actor.role) : [],
      effectiveUserId: event.effectiveUserId ?? null,
      destinationId: platformOperations.destinationId,
      tenantId: event.tenantId ?? null,
      action: bounded(event.action, 160),
      entityType: event.entityType ? bounded(event.entityType, 80) : null,
      entityId: event.entityId ? bounded(event.entityId, 160) : null,
      reason: event.reason ? bounded(event.reason, 240) : null,
      previousState: event.previousState ?? null,
      newState: event.newState ?? null,
      correlationId: request?.morroCorrelationId ?? null,
      causationId: firstHeader(request?.headers?.["x-causation-id"]) || null,
      requestId: firstHeader(request?.headers?.["x-request-id"]) || null,
      timestamp: new Date().toISOString(),
      result: bounded(event.result ?? "unknown", 40),
    });
    try {
      await auditStore.append(entry);
    } catch {
      platformOperations.emit({
        kind: "alert",
        name: "control_center.audit_write_failed",
        severity: "error",
        correlationId: entry.correlationId || undefined,
        attributes: {
          actorUserId: entry.actorUserId,
          action: entry.action,
          result: entry.result,
        },
      });
      return false;
    }

    platformOperations.emit({
      kind: "audit",
      name: "control_center.admin_action",
      severity: entry.result === "denied" ? "warn" : "info",
      correlationId: entry.correlationId || undefined,
      attributes: {
        actorUserId: entry.actorUserId,
        actorRole: entry.actorRole,
        effectiveUserId: entry.effectiveUserId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        tenantId: entry.tenantId,
        result: entry.result,
        reason: entry.reason,
      },
    });
    return true;
  }

  async function requireCapability(
    request,
    response,
    capability,
    options = {},
  ) {
    const actor = await authApi.resolveSession(request);
    if (actor && !isPlatformWideAuthRole(actor.role)) {
      await audit(request, actor, {
        action: `control-center.authorize.${capability}`,
        result: "denied",
        reason: "platform_admin_surface_required",
      });
      json(response, 403, {
        error: "ADMIN_SURFACE_DENIED",
        capability,
        reason: "platform_admin_surface_required",
      });
      return null;
    }

    const decision = authorizeCapability(actor, capability, options);
    if (!decision.allowed) {
      await audit(request, actor, {
        action: `control-center.authorize.${capability}`,
        result: "denied",
        reason: decision.reason,
        tenantId: decision.businessId,
      });
      json(response, actor ? 403 : 401, {
        error: actor ? "CAPABILITY_DENIED" : "AUTH_REQUIRED",
        capability,
        reason: decision.reason,
      });
      return null;
    }
    return actor;
  }

  function stepUpContext(request, actor) {
    if (!actor || stepUpSecret.length < 32) return null;
    const cookies = parseCookies(firstHeader(request.headers?.cookie));
    const payload = verifyStepUpToken(cookies[stepUpCookieName], stepUpSecret);
    if (!payload || payload.actorSessionId !== actor.sessionId) return null;
    return Object.freeze({
      stepUpId: payload.stepUpId,
      method: payload.method,
      issuedAt: payload.issuedAt,
      expiresAt: payload.exp,
    });
  }

  function consumeStepUpAttempt(actorSubject) {
    const now = Date.now();
    const existing = stepUpAttempts.get(actorSubject) ?? [];
    const active = existing.filter(
      (timestamp) => now - timestamp < stepUpWindowMs,
    );
    if (active.length >= stepUpAttemptLimit) {
      stepUpAttempts.set(actorSubject, active);
      return false;
    }
    active.push(now);
    stepUpAttempts.set(actorSubject, active);
    return true;
  }

  function supportContext(request, actor) {
    if (!actor || supportSecret.length < 32) return null;
    const cookies = parseCookies(firstHeader(request.headers?.cookie));
    const payload = verifySupportToken(
      cookies[supportCookieName],
      supportSecret,
    );
    if (!payload || payload.actorSessionId !== actor.sessionId) return null;
    const effectiveUser = authApi.findConfiguredUser(payload.effectiveUserId);
    if (!effectiveUser) return null;
    return Object.freeze({
      supportSessionId: payload.supportSessionId,
      reason: payload.reason,
      startedAt: payload.startedAt,
      expiresAt: payload.exp,
      actor: userProjection(actor),
      effectiveUser: userProjection(effectiveUser),
    });
  }

  async function handleStepUp(request, response) {
    const actor = await requireCapability(request, response, "platform.read");
    if (!actor) return;

    if (request.method === "GET") {
      json(response, 200, {
        stepUp: stepUpContext(request, actor),
        configured: stepUpSecret.length >= 32,
      });
      return;
    }

    const mutation = authApi.authorizeMutation(
      request,
      actor,
      "control-center.step-up",
    );
    if (!mutation.allowed) {
      await audit(request, actor, {
        action: "security.step_up",
        result: "denied",
        reason: mutation.reason,
      });
      json(response, 403, {
        error:
          mutation.reason === "invalid_csrf" ? "INVALID_CSRF" : "ORIGIN_DENIED",
      });
      return;
    }

    if (request.method === "DELETE") {
      response.setHeader(
        "Set-Cookie",
        serializeClearedStepUpCookie(production),
      );
      await audit(request, actor, {
        action: "security.step_up.end",
        result: "success",
        reason: "operator-ended",
      });
      json(response, 200, { success: true });
      return;
    }

    if (request.method !== "POST") {
      json(response, 405, { error: "METHOD_NOT_ALLOWED" });
      return;
    }
    if (stepUpSecret.length < 32) {
      json(response, 503, { error: "STEP_UP_SECRET_NOT_CONFIGURED" });
      return;
    }
    if (!consumeStepUpAttempt(actor.subject)) {
      await audit(request, actor, {
        action: "security.step_up",
        result: "denied",
        reason: "rate_limited",
      });
      json(response, 429, { error: "STEP_UP_RATE_LIMITED" });
      return;
    }

    let body;
    try {
      body = await readJsonBody(request);
    } catch {
      json(response, 400, { error: "INVALID_REQUEST" });
      return;
    }

    const password = typeof body?.password === "string" ? body.password : "";
    if (!authApi.reauthenticate(actor.subject, password)) {
      await audit(request, actor, {
        action: "security.step_up",
        result: "denied",
        reason: "reauthentication_failed",
      });
      json(response, 403, { error: "STEP_UP_REAUTHENTICATION_FAILED" });
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    const payload = Object.freeze({
      stepUpId: `stepup_${randomUUID()}`,
      actorSessionId: actor.sessionId,
      method: "password",
      issuedAt: now,
      exp: Math.min(actor.expiresAt, now + stepUpTtlSeconds),
    });
    const stepUpAudited = await audit(request, actor, {
      action: "security.step_up",
      result: "success",
      reason: "password_reauthenticated",
    });
    if (!stepUpAudited) {
      json(response, 503, { error: "ADMIN_AUDIT_UNAVAILABLE" });
      return;
    }
    response.setHeader(
      "Set-Cookie",
      serializeStepUpCookie(
        createStepUpToken(payload, stepUpSecret),
        production,
      ),
    );
    json(response, 201, {
      stepUp: {
        stepUpId: payload.stepUpId,
        method: payload.method,
        issuedAt: payload.issuedAt,
        expiresAt: payload.exp,
      },
    });
  }

  async function handleUserSessions(request, response, requestUrl) {
    const match =
      /^\/api\/admin\/v1\/users\/([^/]+)\/sessions(?:\/([a-f0-9]{64})\/revoke)?$/u.exec(
        requestUrl.pathname,
      );
    if (!match) return false;

    let userId;
    try {
      userId = decodeURIComponent(match[1]);
    } catch {
      json(response, 400, { error: "INVALID_USER_ID" });
      return true;
    }
    const user = authApi.findConfiguredUser(userId);
    if (!user) {
      json(response, 404, { error: "USER_NOT_FOUND" });
      return true;
    }

    const handle = match[2] ?? null;
    if (!handle && request.method === "GET") {
      const actor = await requireCapability(request, response, "users.read");
      if (!actor) return true;
      try {
        const sessions = await authApi.listUserSessions(userId);
        json(response, 200, {
          user: userProjection(user),
          sessions: sessions ?? [],
        });
      } catch {
        json(response, 503, { error: "AUTH_SESSION_REGISTRY_UNAVAILABLE" });
      }
      return true;
    }

    if (!handle || request.method !== "POST") {
      json(response, 405, { error: "METHOD_NOT_ALLOWED" });
      return true;
    }

    const actor = await requireCapability(
      request,
      response,
      "users.sessions.revoke",
      { mutation: true },
    );
    if (!actor) return true;

    const requestSecurity = authApi.authorizeMutation(
      request,
      actor,
      "control-center.users.sessions.revoke",
    );
    if (!requestSecurity.allowed) {
      await audit(request, actor, {
        action: "users.sessions.revoke",
        result: "denied",
        reason: requestSecurity.reason,
        entityType: "auth_session",
        entityId: handle,
      });
      json(response, 403, {
        error:
          requestSecurity.reason === "invalid_csrf"
            ? "INVALID_CSRF"
            : "ORIGIN_DENIED",
      });
      return true;
    }

    if (!stepUpContext(request, actor)) {
      await audit(request, actor, {
        action: "users.sessions.revoke",
        result: "denied",
        reason: "step_up_required",
        entityType: "auth_session",
        entityId: handle,
      });
      json(response, 403, { error: "STEP_UP_REQUIRED" });
      return true;
    }

    let body;
    try {
      body = await readJsonBody(request);
    } catch {
      json(response, 400, { error: "INVALID_REQUEST" });
      return true;
    }
    const reason = safeReason(body?.reason);
    if (!reason) {
      json(response, 400, { error: "REASON_REQUIRED" });
      return true;
    }
    if (body?.confirmation !== "REVOGAR") {
      await audit(request, actor, {
        action: "users.sessions.revoke",
        result: "denied",
        reason: "text_confirmation_required",
        effectiveUserId: userId,
        entityType: "auth_session",
        entityId: handle,
      });
      json(response, 400, { error: "TEXT_CONFIRMATION_REQUIRED" });
      return true;
    }

    const attemptAudited = await audit(request, actor, {
      action: "users.sessions.revoke.attempt",
      result: "attempt",
      effectiveUserId: userId,
      entityType: "auth_session",
      entityId: handle,
      reason,
    });
    if (!attemptAudited) {
      json(response, 503, { error: "ADMIN_AUDIT_UNAVAILABLE" });
      return true;
    }

    let result;
    try {
      result = await authApi.revokeUserSession(userId, handle);
    } catch {
      await audit(request, actor, {
        action: "users.sessions.revoke.complete",
        result: "failure",
        effectiveUserId: userId,
        entityType: "auth_session",
        entityId: handle,
        reason,
      });
      json(response, 503, { error: "AUTH_SESSION_REGISTRY_UNAVAILABLE" });
      return true;
    }

    if (!result?.found) {
      await audit(request, actor, {
        action: "users.sessions.revoke.complete",
        result: "failure",
        effectiveUserId: userId,
        entityType: "auth_session",
        entityId: handle,
        reason: "session_not_found",
      });
      json(response, 404, { error: "SESSION_NOT_FOUND" });
      return true;
    }

    const completed = await audit(request, actor, {
      action: "users.sessions.revoke.complete",
      result: "success",
      effectiveUserId: userId,
      entityType: "auth_session",
      entityId: handle,
      reason,
      newState: {
        revoked: true,
        alreadyRevoked: result.alreadyRevoked,
      },
    });
    if (!completed) {
      json(response, 503, { error: "ADMIN_AUDIT_UNAVAILABLE" });
      return true;
    }

    json(response, 200, {
      success: true,
      userId,
      sessionHandle: handle,
      alreadyRevoked: result.alreadyRevoked,
    });
    return true;
  }

  async function handleSupport(request, response) {
    const actor = await requireCapability(
      request,
      response,
      "support.impersonate",
    );
    if (!actor) return;

    if (request.method === "GET") {
      json(response, 200, { support: supportContext(request, actor) });
      return;
    }

    const mutation = authApi.authorizeMutation(
      request,
      actor,
      "control-center.support-session",
    );
    if (!mutation.allowed) {
      await audit(request, actor, {
        action: "support.session.mutate",
        result: "denied",
        reason: mutation.reason,
      });
      json(response, 403, {
        error:
          mutation.reason === "invalid_csrf" ? "INVALID_CSRF" : "ORIGIN_DENIED",
      });
      return;
    }

    if (request.method === "DELETE") {
      const previous = supportContext(request, actor);
      response.setHeader(
        "Set-Cookie",
        serializeClearedSupportCookie(production),
      );
      await audit(request, actor, {
        action: "support.session.end",
        result: "success",
        effectiveUserId: previous?.effectiveUser?.id ?? null,
        reason: previous?.reason ?? "operator-ended",
      });
      json(response, 200, { success: true });
      return;
    }

    if (request.method !== "POST") {
      json(response, 405, { error: "METHOD_NOT_ALLOWED" });
      return;
    }
    if (supportSecret.length < 32) {
      json(response, 503, { error: "SUPPORT_SESSION_SECRET_NOT_CONFIGURED" });
      return;
    }

    let body;
    try {
      body = await readJsonBody(request);
    } catch {
      json(response, 400, { error: "INVALID_REQUEST" });
      return;
    }

    const effectiveUser = authApi.findConfiguredUser(body?.effectiveUserId);
    const reason = safeReason(body?.reason);
    if (!effectiveUser || !reason) {
      json(response, 400, { error: "INVALID_SUPPORT_SESSION_REQUEST" });
      return;
    }
    if (isPlatformWideAuthRole(effectiveUser.role)) {
      json(response, 403, { error: "PLATFORM_IDENTITY_IMPERSONATION_DENIED" });
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    const payload = Object.freeze({
      supportSessionId: `support_${randomUUID()}`,
      actorSessionId: actor.sessionId,
      effectiveUserId: effectiveUser.id,
      reason,
      startedAt: now,
      exp: Math.min(actor.expiresAt, now + supportTtlSeconds),
    });
    const supportAudited = await audit(request, actor, {
      action: "support.session.start",
      result: "success",
      effectiveUserId: effectiveUser.id,
      reason,
      tenantId: effectiveUser.businessIds?.[0] ?? null,
    });
    if (!supportAudited) {
      json(response, 503, { error: "ADMIN_AUDIT_UNAVAILABLE" });
      return;
    }
    response.setHeader(
      "Set-Cookie",
      serializeSupportCookie(
        createSupportToken(payload, supportSecret),
        production,
      ),
    );
    json(response, 201, {
      support: {
        ...payload,
        actor: userProjection(actor),
        effectiveUser: userProjection(effectiveUser),
      },
    });
  }

  return Object.freeze({
    matches(pathname) {
      return pathname === adminPrefix || pathname.startsWith(`${adminPrefix}/`);
    },

    async stop() {},

    async handle(request, response, requestUrl) {
      const pathname = requestUrl.pathname;

      if (pathname === `${adminPrefix}/session`) {
        const actor = await requireCapability(
          request,
          response,
          "platform.read",
        );
        if (!actor) return;
        json(response, 200, {
          actor: userProjection(actor),
          support: supportContext(request, actor),
          stepUp: stepUpContext(request, actor),
        });
        return;
      }

      if (pathname === `${adminPrefix}/dashboard`) {
        const actor = await requireCapability(
          request,
          response,
          "platform.read",
        );
        if (!actor) return;
        const users = authApi.listConfiguredUsers();
        const businesses = businessesFromUsers(users);
        const health = platformOperations.healthSnapshot(
          request.morroCorrelationId,
        );
        json(response, 200, {
          generatedAt: new Date().toISOString(),
          summary: {
            businesses: businesses.length,
            users: users.length,
            alerts:
              health.checks?.filter((check) => check.status !== "pass")
                .length ?? 0,
          },
          health,
          modules: {
            businesses: {
              state: "partial",
              source: "identity-membership",
            },
            users: { state: "available", source: "identity" },
            affiliates: {
              state: domainAdapters.affiliates
                ? "available"
                : "contract-required",
            },
            crm: {
              state: domainAdapters.crm?.state ?? "contract-required",
              coverage: domainAdapters.crm?.coverage ?? [],
            },
            ticketing: {
              state: domainAdapters.ticketing?.state ?? "contract-required",
              coverage: domainAdapters.ticketing?.coverage ?? [],
            },
            financial: {
              state: domainAdapters.financial
                ? "available"
                : "contract-required",
            },
            content: {
              state: domainAdapters.content ? "available" : "contract-required",
            },
            destinations: {
              state: domainAdapters.destinations
                ? "available"
                : "contract-required",
            },
            audit: {
              state:
                auditStore.durability?.() === "mysql-append-only"
                  ? "available"
                  : "runtime-projection",
              durable: auditStore.durability?.() === "mysql-append-only",
            },
          },
        });
        return;
      }

      if (await handleUserSessions(request, response, requestUrl)) {
        return;
      }

      if (
        pathname === `${adminPrefix}/users` ||
        pathname.startsWith(`${adminPrefix}/users/`)
      ) {
        const actor = await requireCapability(request, response, "users.read");
        if (!actor) return;
        if (pathname === `${adminPrefix}/users`) {
          json(response, 200, {
            users: authApi.listConfiguredUsers().map(userProjection),
          });
          return;
        }
        const id = decodeURIComponent(
          pathname.slice(`${adminPrefix}/users/`.length),
        );
        const user = authApi.findConfiguredUser(id);
        if (!user) {
          json(response, 404, { error: "USER_NOT_FOUND" });
          return;
        }
        json(response, 200, { user: userProjection(user) });
        return;
      }

      if (pathname === `${adminPrefix}/businesses`) {
        const actor = await requireCapability(
          request,
          response,
          "business.read",
        );
        if (!actor) return;
        json(response, 200, {
          businesses: businessesFromUsers(authApi.listConfiguredUsers()),
          source: "identity-membership",
          authority: "read-only-directory",
          mutationContract: domainAdapters.businesses
            ? "BUSINESS_ADMIN_CONTRACT_REGISTERED"
            : "BUSINESS_ADMIN_CONTRACT_REQUIRED",
        });
        return;
      }

      if (pathname === `${adminPrefix}/search`) {
        const actor = await requireCapability(
          request,
          response,
          "platform.read",
        );
        if (!actor) return;
        const query = bounded(
          requestUrl.searchParams.get("q"),
          160,
        ).toLowerCase();
        const results = [];
        if (query.length >= 2) {
          const configuredUsers = authApi.listConfiguredUsers();
          for (const user of configuredUsers) {
            const searchable = [
              user.id,
              user.email,
              user.role,
              canonicalAuthRole(user.role),
              ...(user.businessIds ?? []),
            ]
              .join(" ")
              .toLowerCase();
            if (searchable.includes(query)) {
              results.push({
                type: "user",
                id: user.id,
                title: user.email,
                context: canonicalAuthRole(user.role),
                href: `#users:${encodeURIComponent(user.id)}`,
              });
            }
          }
          for (const business of businessesFromUsers(configuredUsers)) {
            if (
              business.id.toLowerCase().includes(query) ||
              business.members.some((member) =>
                member.email.toLowerCase().includes(query),
              )
            ) {
              results.push({
                type: "business",
                id: business.id,
                title: business.id,
                context: `${business.members.length} membro(s)`,
                href: `#businesses:${encodeURIComponent(business.id)}`,
              });
            }
          }
          for (const [domain, adapter] of Object.entries(domainAdapters)) {
            if (typeof adapter?.search !== "function") continue;
            const domainResults = await adapter.search({ query, actor });
            for (const result of domainResults ?? []) {
              results.push({ ...result, domain });
            }
          }
        }
        json(response, 200, { query, results: results.slice(0, 50) });
        return;
      }

      if (pathname === `${adminPrefix}/audit`) {
        const actor = await requireCapability(request, response, "audit.read");
        if (!actor) return;
        json(response, 200, {
          durability: auditStore.durability?.() ?? "runtime-projection-only",
          entries: await auditStore.list(requestUrl.searchParams.get("limit")),
        });
        return;
      }

      if (pathname === `${adminPrefix}/system`) {
        const actor = await requireCapability(request, response, "system.read");
        if (!actor) return;
        json(response, 200, {
          service: platformOperations.service,
          destinationId: platformOperations.destinationId,
          release: platformOperations.release,
          health: platformOperations.healthSnapshot(request.morroCorrelationId),
          secrets: "redacted",
        });
        return;
      }

      if (pathname === `${adminPrefix}/support/session`) {
        await handleSupport(request, response);
        return;
      }

      if (pathname === `${adminPrefix}/step-up`) {
        await handleStepUp(request, response);
        return;
      }

      const namespace = pathname.slice(adminPrefix.length + 1).split("/", 1)[0];
      const policy = namespaceCapabilities[namespace];
      if (policy) {
        const mutation =
          request.method !== "GET" &&
          request.method !== "HEAD" &&
          request.method !== "OPTIONS";
        if (mutation && !policy.mutate) {
          json(response, 405, {
            error: "DOMAIN_MUTATION_NOT_REGISTERED",
            domain: namespace,
          });
          return;
        }
        const capability = mutation ? policy.mutate : policy.read;
        const actor = await requireCapability(request, response, capability, {
          mutation,
        });
        if (!actor) return;
        if (mutation) {
          const requestSecurity = authApi.authorizeMutation(
            request,
            actor,
            `control-center.${namespace}.mutation`,
          );
          if (!requestSecurity.allowed) {
            await audit(request, actor, {
              action: `control-center.${namespace}.mutation`,
              result: "denied",
              reason: requestSecurity.reason,
            });
            json(response, 403, {
              error:
                requestSecurity.reason === "invalid_csrf"
                  ? "INVALID_CSRF"
                  : "ORIGIN_DENIED",
            });
            return;
          }
        }
        const support = supportContext(request, actor);
        if (mutation) {
          const attemptAudited = await audit(request, actor, {
            action: `control-center.${namespace}.mutation.attempt`,
            result: "attempt",
            effectiveUserId: support?.effectiveUser?.id ?? null,
            tenantId: support?.effectiveUser?.businessIds?.[0] ?? null,
            entityType: namespace,
            entityId: bounded(requestUrl.pathname, 160),
          });
          if (!attemptAudited) {
            json(response, 503, { error: "ADMIN_AUDIT_UNAVAILABLE" });
            return;
          }
        }

        const adapter = domainAdapters[namespace];
        if (!adapter?.handle) {
          json(response, 501, {
            error: "DOMAIN_ADMIN_CONTRACT_NOT_REGISTERED",
            domain: namespace,
            invariant: "NO_DIRECT_TABLE_BYPASS",
          });
          return;
        }
        await adapter.handle({
          request,
          response,
          requestUrl,
          actor,
          effectiveUser: support?.effectiveUser ?? null,
        });
        if (mutation) {
          await audit(request, actor, {
            action: `control-center.${namespace}.mutation.complete`,
            result:
              response.statusCode >= 200 && response.statusCode < 400
                ? "success"
                : "failure",
            effectiveUserId: support?.effectiveUser?.id ?? null,
            tenantId: support?.effectiveUser?.businessIds?.[0] ?? null,
            entityType: namespace,
            entityId: bounded(requestUrl.pathname, 160),
          });
        }
        return;
      }

      json(response, 404, { error: "NOT_FOUND" });
    },
  });
}
