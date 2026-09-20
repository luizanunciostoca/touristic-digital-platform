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
    append(entry) {
      entries.push(Object.freeze({ ...entry }));
    },
    list(limit = 100) {
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
  affiliates: "affiliate.read",
  crm: "crm.read",
  products: "business.read",
  inventory: "business.read",
  reservations: "ticketing.read",
  ticketing: "ticketing.read",
  orders: "financial.read",
  payments: "financial.read",
  financial: "financial.read",
  content: "content.read",
  destinations: "platform.read",
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
    !authApi?.listConfiguredUsers ||
    !authApi?.findConfiguredUser
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

  function audit(request, actor, event) {
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
    auditStore.append(entry);
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
  }

  async function requireCapability(request, response, capability, options = {}) {
    const actor = await authApi.resolveSession(request);
    const decision = authorizeCapability(actor, capability, options);
    if (!decision.allowed) {
      audit(request, actor, {
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

  function supportContext(request, actor) {
    if (!actor || supportSecret.length < 32) return null;
    const cookies = parseCookies(firstHeader(request.headers?.cookie));
    const payload = verifySupportToken(cookies[supportCookieName], supportSecret);
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
      audit(request, actor, {
        action: "support.session.mutate",
        result: "denied",
        reason: mutation.reason,
      });
      json(response, 403, {
        error:
          mutation.reason === "invalid_csrf"
            ? "INVALID_CSRF"
            : "ORIGIN_DENIED",
      });
      return;
    }

    if (request.method === "DELETE") {
      const previous = supportContext(request, actor);
      response.setHeader(
        "Set-Cookie",
        serializeClearedSupportCookie(production),
      );
      audit(request, actor, {
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
    response.setHeader(
      "Set-Cookie",
      serializeSupportCookie(
        createSupportToken(payload, supportSecret),
        production,
      ),
    );
    audit(request, actor, {
      action: "support.session.start",
      result: "success",
      effectiveUserId: effectiveUser.id,
      reason,
      tenantId: effectiveUser.businessIds?.[0] ?? null,
    });
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
        const actor = await requireCapability(request, response, "platform.read");
        if (!actor) return;
        json(response, 200, {
          actor: userProjection(actor),
          support: supportContext(request, actor),
        });
        return;
      }

      if (pathname === `${adminPrefix}/dashboard`) {
        const actor = await requireCapability(request, response, "platform.read");
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
              health.checks?.filter((check) => check.status !== "pass").length ??
              0,
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
              state: domainAdapters.crm ? "available" : "contract-required",
            },
            ticketing: {
              state: domainAdapters.ticketing
                ? "available"
                : "contract-required",
            },
            financial: {
              state: domainAdapters.financial
                ? "available"
                : "contract-required",
            },
            content: {
              state: domainAdapters.content
                ? "available"
                : "contract-required",
            },
            destinations: {
              state: domainAdapters.destinations
                ? "available"
                : "contract-required",
            },
            audit: { state: "runtime-projection", durable: false },
          },
        });
        return;
      }

      if (pathname === `${adminPrefix}/users` || pathname.startsWith(`${adminPrefix}/users/`)) {
        const actor = await requireCapability(request, response, "users.read");
        if (!actor) return;
        if (pathname === `${adminPrefix}/users`) {
          json(response, 200, {
            users: authApi.listConfiguredUsers().map(userProjection),
          });
          return;
        }
        const id = decodeURIComponent(pathname.slice(`${adminPrefix}/users/`.length));
        const user = authApi.findConfiguredUser(id);
        if (!user) {
          json(response, 404, { error: "USER_NOT_FOUND" });
          return;
        }
        json(response, 200, { user: userProjection(user) });
        return;
      }

      if (pathname === `${adminPrefix}/businesses`) {
        const actor = await requireCapability(request, response, "business.read");
        if (!actor) return;
        json(response, 200, {
          businesses: businessesFromUsers(authApi.listConfiguredUsers()),
          source: "identity-membership",
          authority: "read-only-directory",
          mutationContract: "BUSINESS_ADMIN_CONTRACT_REQUIRED",
        });
        return;
      }

      if (pathname === `${adminPrefix}/search`) {
        const actor = await requireCapability(request, response, "platform.read");
        if (!actor) return;
        const query = bounded(requestUrl.searchParams.get("q"), 160).toLowerCase();
        const results = [];
        if (query.length >= 2) {
          for (const user of authApi.listConfiguredUsers()) {
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
          durability: "runtime-projection-only",
          entries: auditStore.list(requestUrl.searchParams.get("limit")),
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

      const namespace = pathname
        .slice(adminPrefix.length + 1)
        .split("/", 1)[0];
      const capability = namespaceCapabilities[namespace];
      if (capability) {
        const actor = await requireCapability(request, response, capability);
        if (!actor) return;
        const adapter = domainAdapters[namespace];
        if (!adapter?.handle) {
          json(response, 501, {
            error: "DOMAIN_ADMIN_CONTRACT_NOT_REGISTERED",
            domain: namespace,
            invariant: "NO_DIRECT_TABLE_BYPASS",
          });
          return;
        }
        await adapter.handle({ request, response, requestUrl, actor });
        return;
      }

      json(response, 404, { error: "NOT_FOUND" });
    },
  });
}
