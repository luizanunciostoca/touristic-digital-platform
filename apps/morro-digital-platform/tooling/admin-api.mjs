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

const searchWindowMs = 10 * 1000;
const searchAttemptLimit = 40;
const searchResultTypeOrder = Object.freeze([
  "business",
  "affiliate",
  "user",
  "lead",
  "reservation",
  "ticket",
  "order",
  "payment",
  "product",
  "offer",
  "contract",
  "content",
  "destination",
]);
const searchResultTypeLabels = Object.freeze({
  business: "Empresas",
  affiliate: "Afiliados",
  user: "Usuários",
  lead: "Leads",
  reservation: "Reservas",
  ticket: "Tickets",
  order: "Pedidos",
  payment: "Pagamentos",
  product: "Produtos",
  offer: "Ofertas",
  contract: "Contratos",
  content: "Conteúdo",
  destination: "Destinos",
});
const searchAdapterSources = Object.freeze([
  Object.freeze({
    domain: "affiliates",
    adapterKey: "affiliates",
    capability: "affiliate.read",
    types: Object.freeze(["affiliate"]),
    destinationAware: true,
  }),
  Object.freeze({
    domain: "crm",
    adapterKey: "crm",
    capability: "crm.read",
    types: Object.freeze(["lead", "contract"]),
    destinationAware: true,
  }),
  Object.freeze({
    domain: "products",
    adapterKey: "products",
    capability: "business.read",
    types: Object.freeze(["product", "offer"]),
    destinationAware: true,
  }),
  Object.freeze({
    domain: "reservations",
    adapterKey: "reservations",
    capability: "ticketing.read",
    types: Object.freeze(["reservation"]),
    destinationAware: true,
  }),
  Object.freeze({
    domain: "ticketing",
    adapterKey: "ticketing",
    capability: "ticketing.read",
    types: Object.freeze(["ticket"]),
    destinationAware: false,
  }),
  Object.freeze({
    domain: "financial",
    adapterKey: "financial",
    capability: "financial.read",
    types: Object.freeze(["order", "payment"]),
    destinationAware: false,
  }),
  Object.freeze({
    domain: "content",
    adapterKey: "content",
    capability: "content.read",
    types: Object.freeze(["content"]),
    destinationAware: true,
  }),
  Object.freeze({
    domain: "destinations",
    adapterKey: "destinations",
    capability: "platform.read",
    types: Object.freeze(["destination"]),
    destinationAware: true,
  }),
]);

function normalizeSearchText(value) {
  return bounded(value, 160)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("pt-BR");
}

function searchInteger(value, fallback, { min, max }) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max
    ? parsed
    : null;
}

function searchDestinationId(value) {
  const normalized = bounded(value, 120).toLocaleLowerCase("en-US");
  if (!normalized || normalized === "global") return "";
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(normalized) ? normalized : null;
}

function safeSearchHref(value) {
  const href = bounded(value, 320);
  if (!href) return "";
  if (href.startsWith("#") || href.startsWith("/apps/")) return href;
  return "";
}

function normalizedSearchResult(result, source) {
  const type = bounded(result?.type, 40).toLocaleLowerCase("en-US");
  if (!source.types.includes(type)) return null;
  const id = bounded(result?.id, 180);
  const title = bounded(result?.title, 240);
  const href = safeSearchHref(result?.href);
  if (!id || !title || !href) return null;
  return Object.freeze({
    type,
    id,
    title,
    context: bounded(result?.context, 320),
    href,
    domain: source.domain,
    ...(result?.destinationId
      ? { destinationId: bounded(result.destinationId, 120) }
      : {}),
  });
}

function groupSearchResults(results) {
  return searchResultTypeOrder
    .map((type) => {
      const grouped = results.filter((result) => result.type === type);
      return grouped.length
        ? Object.freeze({
            type,
            label: searchResultTypeLabels[type] ?? type,
            count: grouped.length,
            results: Object.freeze(grouped),
          })
        : null;
    })
    .filter(Boolean);
}

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

function replayJsonRequest(request, body) {
  const payload = Buffer.from(JSON.stringify(body ?? {}), "utf8");
  return Object.freeze({
    method: request.method,
    headers: Object.freeze({
      ...(request.headers ?? {}),
      "content-type": "application/json",
      "content-length": String(payload.length),
    }),
    socket: request.socket,
    morroCorrelationId: request.morroCorrelationId,
    async *[Symbol.asyncIterator]() {
      yield payload;
    },
  });
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
    configuredRole: user.configuredRole ?? user.role,
    configuredCanonicalRole:
      user.configuredCanonicalRole ?? canonicalAuthRole(user.role),
    status: user.status ?? "active",
    policyUpdatedAt: user.policyUpdatedAt ?? null,
    policyUpdatedBy: user.policyUpdatedBy ?? null,
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

async function businessDirectoryProjection(users, adapter, destinationId = "") {
  const directory = businessesFromUsers(users);
  const ownerProjectionAvailable =
    typeof adapter?.readDirectoryProfile === "function";
  const projected = await Promise.all(
    directory.map(async (business) => {
      let profile = null;
      if (ownerProjectionAvailable) {
        try {
          profile = await adapter.readDirectoryProfile(business.id);
        } catch {
          profile = null;
        }
      }
      return Object.freeze({
        ...business,
        name: profile?.name ?? null,
        destinationId: profile?.destinationId ?? null,
        profileState: profile ? "available" : "unavailable",
      });
    }),
  );

  const scopedDestinationId =
    destinationId && destinationId !== "global" ? destinationId : "";
  const businesses = scopedDestinationId
    ? projected.filter(
        (business) => business.destinationId === scopedDestinationId,
      )
    : projected;

  return Object.freeze({
    businesses: Object.freeze(businesses),
    destinationId: scopedDestinationId || null,
    destinationScope:
      scopedDestinationId && !ownerProjectionAvailable
        ? "unavailable"
        : ownerProjectionAvailable
          ? "owner-backed"
          : "identity-only",
    unscopedCount: projected.filter((business) => !business.destinationId)
      .length,
  });
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
    !authApi?.listAdminUsers ||
    !authApi?.findAdminUser ||
    !authApi?.updateUserStatus ||
    !authApi?.updateUserRole ||
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

  const searchAttempts = new Map();

  function consumeSearchAttempt(actorSubject) {
    const now = Date.now();
    const recent = (searchAttempts.get(actorSubject) ?? []).filter(
      (timestamp) => now - timestamp < searchWindowMs,
    );
    if (recent.length >= searchAttemptLimit) {
      searchAttempts.set(actorSubject, recent);
      return false;
    }
    recent.push(now);
    searchAttempts.set(actorSubject, recent);
    return true;
  }

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

  async function handleUserCriticalAction(request, response, requestUrl) {
    const match =
      /^\/api\/admin\/v1\/users\/([^/]+)\/(block|reactivate|role)$/u.exec(
        requestUrl.pathname,
      );
    if (!match) return false;
    if (request.method !== "POST") {
      json(response, 405, { error: "METHOD_NOT_ALLOWED" });
      return true;
    }

    let userId;
    try {
      userId = decodeURIComponent(match[1]);
    } catch {
      json(response, 400, { error: "INVALID_USER_ID" });
      return true;
    }
    const operation = match[2];
    const target = await authApi.findAdminUser(userId);
    if (!target) {
      json(response, 404, { error: "USER_NOT_FOUND" });
      return true;
    }

    const actor = await requireCapability(request, response, "users.manage", {
      mutation: true,
    });
    if (!actor) return true;

    const requestSecurity = authApi.authorizeMutation(
      request,
      actor,
      "control-center.users.manage",
    );
    if (!requestSecurity.allowed) {
      await audit(request, actor, {
        action: `users.${operation}`,
        result: "denied",
        reason: requestSecurity.reason,
        effectiveUserId: userId,
        entityType: "auth_principal",
        entityId: userId,
      });
      json(response, 403, {
        error:
          requestSecurity.reason === "invalid_csrf"
            ? "INVALID_CSRF"
            : "ORIGIN_DENIED",
      });
      return true;
    }

    const support = supportContext(request, actor);
    if (support) {
      await audit(request, actor, {
        action: `users.${operation}`,
        result: "denied",
        reason: "support_mode_critical_action_denied",
        effectiveUserId: support.effectiveUser?.id ?? null,
        entityType: "auth_principal",
        entityId: userId,
      });
      json(response, 403, { error: "SUPPORT_MODE_CRITICAL_ACTION_DENIED" });
      return true;
    }

    if (!stepUpContext(request, actor)) {
      await audit(request, actor, {
        action: `users.${operation}`,
        result: "denied",
        reason: "step_up_required",
        entityType: "auth_principal",
        entityId: userId,
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

    const confirmation =
      operation === "block"
        ? "BLOQUEAR"
        : operation === "reactivate"
          ? "REATIVAR"
          : "ALTERAR PERFIL";
    if (body?.confirmation !== confirmation) {
      await audit(request, actor, {
        action: `users.${operation}`,
        result: "denied",
        reason: "text_confirmation_required",
        entityType: "auth_principal",
        entityId: userId,
      });
      json(response, 400, {
        error: "TEXT_CONFIRMATION_REQUIRED",
        expected: confirmation,
      });
      return true;
    }

    const attemptAudited = await audit(request, actor, {
      action: `users.${operation}.attempt`,
      result: "attempt",
      effectiveUserId: userId,
      entityType: "auth_principal",
      entityId: userId,
      reason,
      previousState: userProjection(target),
    });
    if (!attemptAudited) {
      json(response, 503, { error: "ADMIN_AUDIT_UNAVAILABLE" });
      return true;
    }

    let result;
    try {
      result =
        operation === "role"
          ? await authApi.updateUserRole(userId, body?.role, actor.subject)
          : await authApi.updateUserStatus(
              userId,
              operation === "block" ? "blocked" : "active",
              actor.subject,
            );
    } catch (error) {
      const code =
        error instanceof Error
          ? error.message
          : "AUTH_ADMIN_POLICY_UNAVAILABLE";
      const statusCode =
        code === "AUTH_PRINCIPAL_ROLE_INVALID" ||
        code === "AUTH_PRINCIPAL_STATUS_INVALID"
          ? 400
          : 409;
      await audit(request, actor, {
        action: `users.${operation}.complete`,
        result: "failure",
        effectiveUserId: userId,
        entityType: "auth_principal",
        entityId: userId,
        reason: code,
        previousState: userProjection(target),
      });
      json(response, statusCode, { error: code });
      return true;
    }

    if (!result?.newState) {
      json(response, 404, { error: "USER_NOT_FOUND" });
      return true;
    }

    const completed = await audit(request, actor, {
      action: `users.${operation}.complete`,
      result: "success",
      effectiveUserId: userId,
      entityType: "auth_principal",
      entityId: userId,
      reason,
      previousState: userProjection(result.previousState),
      newState: userProjection(result.newState),
    });
    if (!completed) {
      json(response, 503, { error: "ADMIN_AUDIT_UNAVAILABLE" });
      return true;
    }

    json(response, 200, {
      success: true,
      user: userProjection(result.newState),
      revokedSessions: result.revokedSessions,
    });
    return true;
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

  async function handleTicketingCriticalAction(request, response, requestUrl) {
    const checkIn =
      requestUrl.pathname === `${adminPrefix}/ticketing/operator/check-in`;
    const provision =
      requestUrl.pathname ===
      `${adminPrefix}/ticketing/operator/offline-devices`;
    const revokeMatch =
      /^\/api\/admin\/v1\/ticketing\/operator\/offline-devices\/(tdv_[A-Za-z0-9_-]{8,116})\/revoke$/u.exec(
        requestUrl.pathname,
      );
    if (!checkIn && !provision && !revokeMatch) return false;
    if (request.method !== "POST") {
      json(response, 405, { error: "METHOD_NOT_ALLOWED" });
      return true;
    }

    const operation = checkIn
      ? "check-in"
      : provision
        ? "offline-device-provision"
        : "offline-device-revoke";
    const confirmation = checkIn
      ? "VALIDAR CHECK-IN"
      : provision
        ? "PROVISIONAR DISPOSITIVO"
        : "REVOGAR DISPOSITIVO";

    const actor = await requireCapability(
      request,
      response,
      "ticketing.manage",
      { mutation: true },
    );
    if (!actor) return true;

    const requestSecurity = authApi.authorizeMutation(
      request,
      actor,
      `control-center.ticketing.${operation}`,
    );
    if (!requestSecurity.allowed) {
      await audit(request, actor, {
        action: `ticketing.${operation}`,
        result: "denied",
        reason: requestSecurity.reason,
        entityType: "ticketing_operation",
        entityId: revokeMatch?.[1] ?? null,
      });
      json(response, 403, {
        error:
          requestSecurity.reason === "invalid_csrf"
            ? "INVALID_CSRF"
            : "ORIGIN_DENIED",
      });
      return true;
    }

    const support = supportContext(request, actor);
    if (support) {
      await audit(request, actor, {
        action: `ticketing.${operation}`,
        result: "denied",
        reason: "support_mode_critical_action_denied",
        effectiveUserId: support.effectiveUser?.id ?? null,
        entityType: "ticketing_operation",
        entityId: revokeMatch?.[1] ?? null,
      });
      json(response, 403, { error: "SUPPORT_MODE_CRITICAL_ACTION_DENIED" });
      return true;
    }

    if (!stepUpContext(request, actor)) {
      await audit(request, actor, {
        action: `ticketing.${operation}`,
        result: "denied",
        reason: "step_up_required",
        entityType: "ticketing_operation",
        entityId: revokeMatch?.[1] ?? null,
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
    if (body?.confirmation !== confirmation) {
      json(response, 400, {
        error: "TEXT_CONFIRMATION_REQUIRED",
        expected: confirmation,
      });
      return true;
    }

    let ownerBody = {};
    let entityId = revokeMatch?.[1] ?? null;
    if (checkIn) {
      const qrPayload =
        typeof body?.qrPayload === "string" ? body.qrPayload.trim() : "";
      if (!qrPayload) {
        json(response, 400, { error: "QR_PAYLOAD_REQUIRED" });
        return true;
      }
      ownerBody = { qrPayload };
    } else if (provision) {
      const deviceId =
        typeof body?.deviceId === "string" ? body.deviceId.trim() : "";
      const destinationId =
        typeof body?.destinationId === "string"
          ? body.destinationId.trim()
          : "";
      const ttlSeconds =
        body?.ttlSeconds === undefined ? undefined : Number(body.ttlSeconds);
      if (
        !/^tdv_[A-Za-z0-9_-]{8,116}$/u.test(deviceId) ||
        !destinationId ||
        (ttlSeconds !== undefined &&
          (!Number.isSafeInteger(ttlSeconds) ||
            ttlSeconds < 300 ||
            ttlSeconds > 86400))
      ) {
        json(response, 400, { error: "INVALID_DEVICE_REQUEST" });
        return true;
      }
      entityId = deviceId;
      ownerBody = {
        deviceId,
        destinationId,
        ...(ttlSeconds === undefined ? {} : { ttlSeconds }),
      };
    }

    const attemptAudited = await audit(request, actor, {
      action: `ticketing.${operation}.attempt`,
      result: "attempt",
      entityType: checkIn ? "ticket_checkin" : "offline_device",
      entityId,
      reason,
    });
    if (!attemptAudited) {
      json(response, 503, { error: "ADMIN_AUDIT_UNAVAILABLE" });
      return true;
    }

    const adapter = domainAdapters.ticketing;
    if (!adapter?.handle) {
      json(response, 501, {
        error: "DOMAIN_ADMIN_CONTRACT_NOT_REGISTERED",
        domain: "ticketing",
        invariant: "NO_DIRECT_TABLE_BYPASS",
      });
      return true;
    }

    try {
      await adapter.handle({
        request: replayJsonRequest(request, ownerBody),
        response,
        requestUrl,
        actor,
        effectiveUser: null,
      });
      await audit(request, actor, {
        action: `ticketing.${operation}.complete`,
        result:
          response.statusCode >= 200 && response.statusCode < 400
            ? "success"
            : "failure",
        entityType: checkIn ? "ticket_checkin" : "offline_device",
        entityId,
        reason,
      });
    } catch (error) {
      await audit(request, actor, {
        action: `ticketing.${operation}.complete`,
        result: "failure",
        entityType: checkIn ? "ticket_checkin" : "offline_device",
        entityId,
        reason: error instanceof Error ? bounded(error.message) : reason,
      });
      json(response, 503, { error: "TICKETING_ADMIN_UNAVAILABLE" });
    }
    return true;
  }

  async function handleProductCriticalAction(request, response, requestUrl) {
    const create = requestUrl.pathname === `${adminPrefix}/products/offers`;
    const disableMatch = /^\/api\/admin\/v1\/products\/([^/]+)\/disable$/u.exec(
      requestUrl.pathname,
    );
    if (!create && !disableMatch) return false;
    if (request.method !== "POST") {
      json(response, 405, { error: "METHOD_NOT_ALLOWED" });
      return true;
    }

    const operation = create ? "create" : "disable";
    let inventoryId = null;
    if (disableMatch?.[1]) {
      try {
        inventoryId = decodeURIComponent(disableMatch[1]);
      } catch {
        json(response, 400, { error: "INVALID_INVENTORY_ID" });
        return true;
      }
    }

    const actor = await requireCapability(
      request,
      response,
      "ticketing.manage",
      { mutation: true },
    );
    if (!actor) return true;

    const requestSecurity = authApi.authorizeMutation(
      request,
      actor,
      `control-center.products.${operation}`,
    );
    if (!requestSecurity.allowed) {
      await audit(request, actor, {
        action: `products.offer.${operation}`,
        result: "denied",
        reason: requestSecurity.reason,
        entityType: "ticket_inventory",
        entityId: inventoryId,
      });
      json(response, 403, {
        error:
          requestSecurity.reason === "invalid_csrf"
            ? "INVALID_CSRF"
            : "ORIGIN_DENIED",
      });
      return true;
    }

    const support = supportContext(request, actor);
    if (support) {
      await audit(request, actor, {
        action: `products.offer.${operation}`,
        result: "denied",
        reason: "support_mode_critical_action_denied",
        effectiveUserId: support.effectiveUser?.id ?? null,
        entityType: "ticket_inventory",
        entityId: inventoryId,
      });
      json(response, 403, { error: "SUPPORT_MODE_CRITICAL_ACTION_DENIED" });
      return true;
    }

    if (!stepUpContext(request, actor)) {
      await audit(request, actor, {
        action: `products.offer.${operation}`,
        result: "denied",
        reason: "step_up_required",
        entityType: "ticket_inventory",
        entityId: inventoryId,
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

    const confirmation = create ? "CRIAR OFERTA" : "DESATIVAR OFERTA";
    if (body?.confirmation !== confirmation) {
      json(response, 400, {
        error: "TEXT_CONFIRMATION_REQUIRED",
        expected: confirmation,
      });
      return true;
    }

    const businessId =
      typeof body?.businessId === "string" ? body.businessId.trim() : "";
    if (!/^[a-z0-9][a-z0-9_-]{0,119}$/u.test(businessId)) {
      json(response, 400, { error: "INVALID_BUSINESS_ID" });
      return true;
    }

    const adapter = domainAdapters.products;
    if (
      !adapter?.readOffer ||
      !adapter?.createBusinessOffer ||
      !adapter?.disableBusinessOffer
    ) {
      json(response, 501, {
        error: "DOMAIN_ADMIN_CONTRACT_NOT_REGISTERED",
        domain: "products",
        invariant: "NO_DIRECT_TABLE_BYPASS",
      });
      return true;
    }

    let previousState = null;
    if (!create) {
      const current = await adapter.readOffer(inventoryId);
      if (current?.status === "not_found") {
        json(response, 404, { error: "PRODUCT_OFFER_NOT_FOUND" });
        return true;
      }
      if (current?.status !== "found" || !current.data?.projection) {
        json(response, 503, {
          error: current?.error || "TICKETING_ADMIN_UNAVAILABLE",
        });
        return true;
      }
      previousState = current.data.projection;
      if (previousState.businessId !== businessId) {
        json(response, 409, { error: "BUSINESS_OFFER_SCOPE_MISMATCH" });
        return true;
      }
    }

    const attemptAudited = await audit(request, actor, {
      action: `products.offer.${operation}.attempt`,
      result: "attempt",
      tenantId: businessId,
      entityType: "ticket_inventory",
      entityId: inventoryId,
      reason,
      previousState,
    });
    if (!attemptAudited) {
      json(response, 503, { error: "ADMIN_AUDIT_UNAVAILABLE" });
      return true;
    }

    let result;
    if (create) {
      const requestKey =
        typeof body?.requestKey === "string" ? body.requestKey.trim() : "";
      if (!/^[A-Za-z0-9_-]{8,120}$/u.test(requestKey)) {
        json(response, 400, { error: "INVALID_IDEMPOTENCY_KEY" });
        return true;
      }
      result = await adapter.createBusinessOffer({
        request,
        businessId,
        offer: body?.offer,
        requestKey,
      });
    } else {
      result = await adapter.disableBusinessOffer({
        request,
        businessId,
        inventoryId,
      });
    }

    const successful =
      result?.status === "created" || result?.status === "updated";
    if (result?.status === "denied") {
      json(response, 403, { error: result.error || "CAPABILITY_DENIED" });
    } else if (result?.status === "invalid") {
      json(response, 400, {
        error: result.error || "INVALID_PRODUCT_OFFER_MUTATION",
      });
    } else if (result?.status === "not_found") {
      json(response, 404, { error: "PRODUCT_OFFER_NOT_FOUND" });
    } else if (result?.status === "conflict") {
      json(response, 409, {
        error: result.error || "PRODUCT_OFFER_CONFLICT",
      });
    } else if (!successful) {
      json(response, 503, {
        error: result?.error || "TICKETING_ADMIN_UNAVAILABLE",
      });
    } else {
      json(response, create ? 201 : 200, { data: result.data });
    }

    await audit(request, actor, {
      action: `products.offer.${operation}.complete`,
      result: successful ? "success" : "failure",
      tenantId: businessId,
      entityType: "ticket_inventory",
      entityId: inventoryId ?? result?.data?.id ?? null,
      reason,
      previousState,
      newState: successful ? result.data : null,
    });
    return true;
  }

  async function handleReservationCriticalAction(
    request,
    response,
    requestUrl,
  ) {
    const match = /^\/api\/admin\/v1\/reservations\/([^/]+)\/cancel$/u.exec(
      requestUrl.pathname,
    );
    if (!match) return false;
    if (request.method !== "POST") {
      json(response, 405, { error: "METHOD_NOT_ALLOWED" });
      return true;
    }

    let reservationId;
    try {
      reservationId = decodeURIComponent(match[1]);
    } catch {
      json(response, 400, { error: "INVALID_RESERVATION_ID" });
      return true;
    }

    const actor = await requireCapability(
      request,
      response,
      "ticketing.manage",
      { mutation: true },
    );
    if (!actor) return true;

    const requestSecurity = authApi.authorizeMutation(
      request,
      actor,
      "control-center.reservations.cancel",
    );
    if (!requestSecurity.allowed) {
      await audit(request, actor, {
        action: "reservations.cancel",
        result: "denied",
        reason: requestSecurity.reason,
        entityType: "reservation",
        entityId: reservationId,
      });
      json(response, 403, {
        error:
          requestSecurity.reason === "invalid_csrf"
            ? "INVALID_CSRF"
            : "ORIGIN_DENIED",
      });
      return true;
    }

    const support = supportContext(request, actor);
    if (support) {
      await audit(request, actor, {
        action: "reservations.cancel",
        result: "denied",
        reason: "support_mode_critical_action_denied",
        effectiveUserId: support.effectiveUser?.id ?? null,
        entityType: "reservation",
        entityId: reservationId,
      });
      json(response, 403, { error: "SUPPORT_MODE_CRITICAL_ACTION_DENIED" });
      return true;
    }

    if (!stepUpContext(request, actor)) {
      await audit(request, actor, {
        action: "reservations.cancel",
        result: "denied",
        reason: "step_up_required",
        entityType: "reservation",
        entityId: reservationId,
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
    if (body?.confirmation !== "CANCELAR RESERVA") {
      await audit(request, actor, {
        action: "reservations.cancel",
        result: "denied",
        reason: "text_confirmation_required",
        entityType: "reservation",
        entityId: reservationId,
      });
      json(response, 400, {
        error: "TEXT_CONFIRMATION_REQUIRED",
        expected: "CANCELAR RESERVA",
      });
      return true;
    }

    const adapter = domainAdapters.reservations;
    if (!adapter?.readReservation || !adapter?.cancelHeldReservation) {
      json(response, 501, {
        error: "DOMAIN_ADMIN_CONTRACT_NOT_REGISTERED",
        domain: "reservations",
        invariant: "NO_DIRECT_TABLE_BYPASS",
      });
      return true;
    }

    const current = await adapter.readReservation(reservationId);
    if (current?.status === "not_found") {
      json(response, 404, { error: "RESERVATION_NOT_FOUND" });
      return true;
    }
    if (current?.status !== "found" || !current.data?.reservation) {
      json(response, 503, {
        error: current?.error || "TICKETING_ADMIN_UNAVAILABLE",
      });
      return true;
    }
    if (current.data.reservation.status !== "held") {
      json(response, 409, { error: "TICKETING_RESERVATION_NOT_HELD" });
      return true;
    }

    const attemptAudited = await audit(request, actor, {
      action: "reservations.cancel.attempt",
      result: "attempt",
      entityType: "reservation",
      entityId: reservationId,
      reason,
      previousState: current.data.reservation,
    });
    if (!attemptAudited) {
      json(response, 503, { error: "ADMIN_AUDIT_UNAVAILABLE" });
      return true;
    }

    const result = await adapter.cancelHeldReservation({
      reservationId,
      actorReference: actor.subject,
    });
    if (result?.status === "not_found") {
      json(response, 404, { error: "RESERVATION_NOT_FOUND" });
    } else if (result?.status === "conflict") {
      json(response, 409, {
        error: result.error || "TICKETING_RESERVATION_NOT_HELD",
      });
    } else if (result?.status === "invalid") {
      json(response, 400, {
        error: result.error || "INVALID_RESERVATION_MUTATION",
      });
    } else if (result?.status !== "updated") {
      json(response, 503, {
        error: result?.error || "TICKETING_ADMIN_UNAVAILABLE",
      });
    } else {
      json(response, 200, { data: result.data });
    }

    await audit(request, actor, {
      action: "reservations.cancel.complete",
      result:
        response.statusCode >= 200 && response.statusCode < 400
          ? "success"
          : "failure",
      entityType: "reservation",
      entityId: reservationId,
      reason,
      previousState: result?.data?.previousState ?? current.data.reservation,
      newState: result?.data?.newState ?? null,
    });
    return true;
  }

  async function handleAffiliateCriticalAction(request, response, requestUrl) {
    const match =
      /^\/api\/admin\/v1\/affiliates\/(aff_[A-Za-z0-9._:-]{8,116})\/memberships\/([A-Za-z0-9._:-]{2,120})\/(suspend|reactivate)$/u.exec(
        requestUrl.pathname,
      );
    if (!match) return false;

    if (request.method !== "POST") {
      json(response, 405, { error: "METHOD_NOT_ALLOWED" });
      return true;
    }

    const affiliateId = match[1];
    const programId = match[2];
    const operation = match[3];
    const definition =
      operation === "suspend"
        ? Object.freeze({
            status: "suspended",
            confirmation: "SUSPENDER",
            action: "affiliate.membership.suspend",
          })
        : Object.freeze({
            status: "approved",
            confirmation: "REATIVAR",
            action: "affiliate.membership.reactivate",
          });

    const actor = await requireCapability(
      request,
      response,
      "affiliate.suspend",
      { mutation: true },
    );
    if (!actor) return true;

    const requestSecurity = authApi.authorizeMutation(
      request,
      actor,
      `control-center.${definition.action}`,
    );
    if (!requestSecurity.allowed) {
      await audit(request, actor, {
        action: definition.action,
        result: "denied",
        reason: requestSecurity.reason,
        entityType: "affiliate_membership",
        entityId: `${affiliateId}:${programId}`,
      });
      json(response, 403, {
        error:
          requestSecurity.reason === "invalid_csrf"
            ? "INVALID_CSRF"
            : "ORIGIN_DENIED",
      });
      return true;
    }

    const support = supportContext(request, actor);
    if (support) {
      await audit(request, actor, {
        action: definition.action,
        result: "denied",
        reason: "support_mode_critical_action_denied",
        effectiveUserId: support.effectiveUser?.id ?? null,
        entityType: "affiliate_membership",
        entityId: `${affiliateId}:${programId}`,
      });
      json(response, 403, { error: "SUPPORT_MODE_CRITICAL_ACTION_DENIED" });
      return true;
    }

    if (!stepUpContext(request, actor)) {
      await audit(request, actor, {
        action: definition.action,
        result: "denied",
        reason: "step_up_required",
        entityType: "affiliate_membership",
        entityId: `${affiliateId}:${programId}`,
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
    if (body?.confirmation !== definition.confirmation) {
      await audit(request, actor, {
        action: definition.action,
        result: "denied",
        reason: "text_confirmation_required",
        entityType: "affiliate_membership",
        entityId: `${affiliateId}:${programId}`,
      });
      json(response, 400, {
        error: "TEXT_CONFIRMATION_REQUIRED",
        expected: definition.confirmation,
      });
      return true;
    }

    const adapter = domainAdapters.affiliates;
    if (!adapter?.changeMembershipStatus) {
      json(response, 501, {
        error: "DOMAIN_ADMIN_CONTRACT_NOT_REGISTERED",
        domain: "affiliates",
        invariant: "NO_DIRECT_TABLE_BYPASS",
      });
      return true;
    }

    const attemptAudited = await audit(request, actor, {
      action: `${definition.action}.attempt`,
      result: "attempt",
      entityType: "affiliate_membership",
      entityId: `${affiliateId}:${programId}`,
      reason,
    });
    if (!attemptAudited) {
      json(response, 503, { error: "ADMIN_AUDIT_UNAVAILABLE" });
      return true;
    }

    const result = await adapter.changeMembershipStatus({
      actor,
      affiliateId,
      programId,
      status: definition.status,
      correlationId: request.morroCorrelationId,
    });

    if (result.status === "denied") {
      json(response, 403, { error: "CAPABILITY_DENIED" });
    } else if (result.status === "not_found") {
      json(response, 404, { error: "AFFILIATE_MEMBERSHIP_NOT_FOUND" });
    } else if (result.status === "conflict") {
      json(response, 409, {
        error: result.error || "AFFILIATE_MEMBERSHIP_TRANSITION_INVALID",
      });
    } else if (result.status === "unavailable") {
      json(response, 503, {
        error: result.error || "AFFILIATE_ADMIN_UNAVAILABLE",
      });
    } else if (result.status === "invalid") {
      json(response, 400, { error: "INVALID_AFFILIATE_ADMIN_MUTATION" });
    } else {
      json(response, 200, { data: result.data });
    }

    await audit(request, actor, {
      action: `${definition.action}.complete`,
      result:
        response.statusCode >= 200 && response.statusCode < 400
          ? "success"
          : "failure",
      entityType: "affiliate_membership",
      entityId: `${affiliateId}:${programId}`,
      reason,
    });
    return true;
  }

  async function handleFinancialCriticalAction(request, response, requestUrl) {
    const refundMatch =
      /^\/api\/admin\/v1\/financial\/refunds\/([A-Za-z0-9_-]+)$/u.exec(
        requestUrl.pathname,
      );
    const reconciliationRunMatch =
      /^\/api\/admin\/v1\/financial\/reconciliation\/payments\/([A-Za-z0-9_-]+)\/runs$/u.exec(
        requestUrl.pathname,
      );
    const reconciliationAckMatch =
      /^\/api\/admin\/v1\/financial\/reconciliation\/findings\/([A-Za-z0-9_-]+)\/acknowledge$/u.exec(
        requestUrl.pathname,
      );

    if (!refundMatch && !reconciliationRunMatch && !reconciliationAckMatch) {
      return false;
    }

    if (request.method !== "POST") {
      json(response, 405, { error: "METHOD_NOT_ALLOWED" });
      return true;
    }

    const definition = refundMatch
      ? Object.freeze({
          capability: "financial.refund",
          confirmation: "REFUNDAR",
          action: "financial.refund",
          entityType: "payment",
          entityId: refundMatch[1],
          adapterMethod: "refund",
        })
      : reconciliationRunMatch
        ? Object.freeze({
            capability: "financial.reconcile",
            confirmation: "RECONCILIAR",
            action: "financial.reconciliation.run",
            entityType: "payment",
            entityId: reconciliationRunMatch[1],
            adapterMethod: "reconciliationRun",
          })
        : Object.freeze({
            capability: "financial.reconcile",
            confirmation: "CONFIRMAR",
            action: "financial.reconciliation.acknowledge",
            entityType: "reconciliation_finding",
            entityId: reconciliationAckMatch[1],
            adapterMethod: "reconciliationAcknowledge",
          });

    const actor = await requireCapability(
      request,
      response,
      definition.capability,
      { mutation: true },
    );
    if (!actor) return true;

    if (production) {
      await audit(request, actor, {
        action: definition.action,
        result: "denied",
        reason: "production_financial_effect_not_authorized",
        entityType: definition.entityType,
        entityId: definition.entityId,
      });
      json(response, 403, {
        error: "PRODUCTION_FINANCIAL_EFFECT_NOT_AUTHORIZED",
      });
      return true;
    }

    const requestSecurity = authApi.authorizeMutation(
      request,
      actor,
      `control-center.${definition.action}`,
    );
    if (!requestSecurity.allowed) {
      await audit(request, actor, {
        action: definition.action,
        result: "denied",
        reason: requestSecurity.reason,
        entityType: definition.entityType,
        entityId: definition.entityId,
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
        action: definition.action,
        result: "denied",
        reason: "step_up_required",
        entityType: definition.entityType,
        entityId: definition.entityId,
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
    if (body?.confirmation !== definition.confirmation) {
      await audit(request, actor, {
        action: definition.action,
        result: "denied",
        reason: "text_confirmation_required",
        entityType: definition.entityType,
        entityId: definition.entityId,
      });
      json(response, 400, {
        error: "TEXT_CONFIRMATION_REQUIRED",
        expected: definition.confirmation,
      });
      return true;
    }

    const adapter = domainAdapters.financial;
    const scopeMethod = reconciliationAckMatch
      ? "resolveFindingTenant"
      : "resolvePaymentTenant";
    if (
      !adapter ||
      typeof adapter[definition.adapterMethod] !== "function" ||
      typeof adapter[scopeMethod] !== "function"
    ) {
      json(response, 501, {
        error: "DOMAIN_ADMIN_CONTRACT_NOT_REGISTERED",
        domain: "financial",
        invariant: "NO_DIRECT_TABLE_BYPASS",
      });
      return true;
    }

    const scope = await adapter[scopeMethod](definition.entityId);
    if (scope?.status === "invalid") {
      json(response, 400, { error: "INVALID_FINANCIAL_RESOURCE_SCOPE" });
      return true;
    }
    if (scope?.status === "unavailable") {
      json(response, 503, { error: "FINANCIAL_RESOURCE_SCOPE_UNAVAILABLE" });
      return true;
    }
    if (scope?.status !== "found" || !scope.tenantId) {
      json(response, 404, { error: "FINANCIAL_RESOURCE_SCOPE_NOT_FOUND" });
      return true;
    }

    const support = supportContext(request, actor);
    if (
      support &&
      !(support.effectiveUser?.businessIds ?? []).includes(scope.tenantId)
    ) {
      await audit(request, actor, {
        action: definition.action,
        result: "denied",
        reason: "support_scope_mismatch",
        effectiveUserId: support.effectiveUser?.id ?? null,
        tenantId: scope.tenantId,
        entityType: definition.entityType,
        entityId: definition.entityId,
      });
      json(response, 403, { error: "SUPPORT_SCOPE_MISMATCH" });
      return true;
    }

    const attemptAudited = await audit(request, actor, {
      action: `${definition.action}.attempt`,
      result: "attempt",
      effectiveUserId: support?.effectiveUser?.id ?? null,
      tenantId: scope.tenantId,
      entityType: definition.entityType,
      entityId: definition.entityId,
      reason,
    });
    if (!attemptAudited) {
      json(response, 503, { error: "ADMIN_AUDIT_UNAVAILABLE" });
      return true;
    }

    const adapterInput = {
      request,
      response,
      requestUrl,
      actor,
      reason,
      ...(refundMatch ? { paymentId: refundMatch[1] } : {}),
      ...(reconciliationRunMatch
        ? {
            paymentId: reconciliationRunMatch[1],
            runId: body?.runId,
          }
        : {}),
      ...(reconciliationAckMatch
        ? { findingId: reconciliationAckMatch[1] }
        : {}),
    };

    await adapter[definition.adapterMethod](adapterInput);

    await audit(request, actor, {
      action: `${definition.action}.complete`,
      result:
        response.statusCode >= 200 && response.statusCode < 400
          ? "success"
          : "failure",
      effectiveUserId: support?.effectiveUser?.id ?? null,
      tenantId: scope.tenantId,
      entityType: definition.entityType,
      entityId: definition.entityId,
      reason,
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

  function unavailableSource(reason) {
    return Object.freeze({
      status: "UNAVAILABLE",
      count: null,
      knownCount: null,
      items: Object.freeze([]),
      reason,
    });
  }

  function notSupportedSource(reason) {
    return Object.freeze({
      status: "NOT_SUPPORTED",
      count: null,
      knownCount: null,
      items: Object.freeze([]),
      reason,
    });
  }

  function combineAvailability(statuses) {
    const values = statuses.filter(Boolean);
    if (values.length === 0) return "NOT_SUPPORTED";
    if (values.every((status) => status === "READY")) return "READY";
    if (values.every((status) => status === "NOT_SUPPORTED")) {
      return "NOT_SUPPORTED";
    }
    const hasUsable = values.some(
      (status) => status === "READY" || status === "PARTIAL",
    );
    if (!hasUsable && values.some((status) => status === "UNAVAILABLE")) {
      return "UNAVAILABLE";
    }
    return "PARTIAL";
  }

  async function dashboardRealData(requestUrl, health) {
    const requestedValues = requestUrl.searchParams.getAll("destinationId");
    if (requestedValues.length > 1) {
      return Object.freeze({
        error: "INVALID_DESTINATION_SCOPE",
        statusCode: 400,
      });
    }
    const requestedDestinationId = bounded(requestedValues[0] ?? "", 120);
    const destinationOwner = domainAdapters.destinations;
    if (typeof destinationOwner?.listOwnerDestinations !== "function") {
      return Object.freeze({
        attention: Object.freeze({
          status: "UNAVAILABLE",
          count: null,
          knownCount: null,
          items: Object.freeze([]),
          sources: Object.freeze({}),
          reason: "DESTINATION_OWNER_UNAVAILABLE",
        }),
        destinationSummary: Object.freeze({
          status: "UNAVAILABLE",
          items: null,
          reason: "DESTINATION_OWNER_UNAVAILABLE",
        }),
      });
    }

    const ownerDestinations = await destinationOwner.listOwnerDestinations();
    if (
      ownerDestinations?.status !== "found" ||
      !Array.isArray(ownerDestinations.data)
    ) {
      return Object.freeze({
        attention: Object.freeze({
          status: "UNAVAILABLE",
          count: null,
          knownCount: null,
          items: Object.freeze([]),
          sources: Object.freeze({}),
          reason: "DESTINATION_OWNER_UNAVAILABLE",
        }),
        destinationSummary: Object.freeze({
          status: "UNAVAILABLE",
          items: null,
          reason: "DESTINATION_OWNER_UNAVAILABLE",
        }),
      });
    }

    let destinations = ownerDestinations.data;
    if (requestedDestinationId && requestedDestinationId !== "global") {
      destinations = destinations.filter(
        (destination) => destination?.id === requestedDestinationId,
      );
      if (destinations.length === 0) {
        return Object.freeze({
          error: "DESTINATION_NOT_FOUND",
          statusCode: 404,
        });
      }
    }
    const destinationIds = destinations
      .map((destination) => destination?.id)
      .filter((value) => typeof value === "string" && value);
    const financialOwner = domainAdapters.financial;
    let financialResult = { status: "unavailable", data: null };
    if (
      destinationIds.length > 0 &&
      typeof financialOwner?.aggregateDestinations === "function"
    ) {
      try {
        financialResult = await financialOwner.aggregateDestinations({
          destinationIds,
        });
      } catch {
        financialResult = { status: "unavailable", data: null };
      }
    }
    const financialByDestination = new Map(
      financialResult?.status === "found" &&
        Array.isArray(financialResult.data?.destinations)
        ? financialResult.data.destinations.map((item) => [
            item.destinationId,
            item,
          ])
        : [],
    );

    const healthItems = (health.checks ?? [])
      .filter((check) => check.status !== "pass")
      .map((check) =>
        Object.freeze({
          id: `health:${bounded(check.name, 120)}`,
          kind: "incident",
          destinationId: platformOperations.destinationId,
          severity:
            check.status === "fail" || check.critical ? "critical" : "warning",
          title: bounded(check.name, 160),
          detail: bounded(check.detail || check.status, 240),
        }),
      );

    const summaryItems = destinations.map((destination) => {
      const destinationId = destination.id;
      const financial = financialByDestination.get(destinationId);
      const financialAttention = financial
        ? Object.freeze({
            status: financial.financialAttention.status,
            count: financial.financialAttention.count,
            knownCount: financial.financialAttention.knownCount,
            items: financial.financialAttention.items,
            itemsTruncated: financial.financialAttention.itemsTruncated,
            reason:
              financial.financialAttention.status === "PARTIAL"
                ? "PAYMENTS_AGGREGATE_LIMIT_REACHED"
                : null,
          })
        : unavailableSource("FINANCIAL_OWNER_UNAVAILABLE");
      const incidents =
        destinationId === platformOperations.destinationId
          ? Object.freeze({
              status: "READY",
              count: healthItems.length,
              knownCount: healthItems.length,
              items: Object.freeze(healthItems),
              reason: null,
            })
          : notSupportedSource(
              "MULTI_DESTINATION_INCIDENT_OWNER_NOT_AVAILABLE",
            );
      const sources = Object.freeze({
        businessApprovals: notSupportedSource(
          "BUSINESS_APPROVAL_OWNER_NOT_AVAILABLE",
        ),
        financialReconciliation: financialAttention,
        refundReview: notSupportedSource("REFUND_REVIEW_OWNER_NOT_AVAILABLE"),
        supportRequests: notSupportedSource(
          "SUPPORT_REQUEST_OWNER_NOT_AVAILABLE",
        ),
        incidents,
      });
      const alertStatus = combineAvailability(
        Object.values(sources).map((source) => source.status),
      );
      const knownCount = Object.values(sources).reduce(
        (total, source) =>
          total +
          (Number.isSafeInteger(source.knownCount) ? source.knownCount : 0),
        0,
      );
      const alerts = Object.freeze({
        status: alertStatus,
        count: alertStatus === "READY" ? knownCount : null,
        knownCount,
        items: Object.freeze(
          Object.values(sources)
            .flatMap((source) => source.items ?? [])
            .slice(0, 100),
        ),
        sources,
      });
      const revenue = financial?.revenue
        ? financial.revenue
        : Object.freeze({
            status: "UNAVAILABLE",
            currencies: null,
            scannedPayments: null,
            complete: false,
          });
      return Object.freeze({
        destinationId,
        alerts,
        revenue,
      });
    });

    const destinationStatus =
      summaryItems.length === 0
        ? "READY"
        : combineAvailability(
            summaryItems.flatMap((item) => [
              item.alerts.status,
              item.revenue.status,
            ]),
          );
    const allSources = summaryItems.flatMap((item) =>
      Object.values(item.alerts.sources).map((source) => ({
        destinationId: item.destinationId,
        source,
      })),
    );
    const attentionKnownCount = summaryItems.reduce(
      (total, item) => total + item.alerts.knownCount,
      0,
    );
    const attentionItems = Object.freeze(
      summaryItems.flatMap((item) => item.alerts.items).slice(0, 100),
    );
    const sources = Object.freeze({
      businessApprovals: notSupportedSource(
        "BUSINESS_APPROVAL_OWNER_NOT_AVAILABLE",
      ),
      financialReconciliation: Object.freeze({
        status: combineAvailability(
          summaryItems.map(
            (item) => item.alerts.sources.financialReconciliation.status,
          ),
        ),
        count: summaryItems.every(
          (item) =>
            item.alerts.sources.financialReconciliation.status === "READY",
        )
          ? summaryItems.reduce(
              (total, item) =>
                total +
                (item.alerts.sources.financialReconciliation.count ?? 0),
              0,
            )
          : null,
        knownCount: summaryItems.reduce(
          (total, item) =>
            total +
            (item.alerts.sources.financialReconciliation.knownCount ?? 0),
          0,
        ),
      }),
      refundReview: notSupportedSource("REFUND_REVIEW_OWNER_NOT_AVAILABLE"),
      supportRequests: notSupportedSource(
        "SUPPORT_REQUEST_OWNER_NOT_AVAILABLE",
      ),
      incidents: Object.freeze({
        status: combineAvailability(
          summaryItems.map((item) => item.alerts.sources.incidents.status),
        ),
        count: summaryItems.every(
          (item) => item.alerts.sources.incidents.status === "READY",
        )
          ? summaryItems.reduce(
              (total, item) =>
                total + (item.alerts.sources.incidents.count ?? 0),
              0,
            )
          : null,
        knownCount: summaryItems.reduce(
          (total, item) =>
            total + (item.alerts.sources.incidents.knownCount ?? 0),
          0,
        ),
      }),
    });
    const attentionStatus = combineAvailability(
      Object.values(sources).map((source) => source.status),
    );

    return Object.freeze({
      attention: Object.freeze({
        status: attentionStatus,
        count: attentionStatus === "READY" ? attentionKnownCount : null,
        knownCount: attentionKnownCount,
        items: attentionItems,
        sources,
      }),
      destinationSummary: Object.freeze({
        status: destinationStatus,
        items: Object.freeze(summaryItems),
      }),
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
        const users = await authApi.listAdminUsers();
        const businesses = businessesFromUsers(users);
        const health = platformOperations.healthSnapshot(
          request.morroCorrelationId,
        );
        const realData = await dashboardRealData(requestUrl, health);
        if (realData.error) {
          json(response, realData.statusCode, { error: realData.error });
          return;
        }
        json(response, 200, {
          generatedAt: new Date().toISOString(),
          summary: {
            businesses: businesses.length,
            users: users.length,
            alerts:
              realData.attention.status === "READY"
                ? realData.attention.knownCount
                : null,
            alertsKnownCount: realData.attention.knownCount,
            alertsStatus: realData.attention.status,
          },
          attention: realData.attention,
          destinationSummary: realData.destinationSummary,
          health,
          modules: {
            businesses: {
              state: domainAdapters.businesses?.state ?? "contract-required",
              coverage: Object.freeze([
                "identity-membership-directory",
                ...(domainAdapters.businesses?.coverage ?? []),
                "owner-backed-360-composition",
              ]),
            },
            users: {
              state: "available",
              source: "auth-owner",
              coverage: Object.freeze([
                "list",
                "detail",
                "sessions",
                "session-revoke",
                "block",
                "reactivate",
                "role-change",
              ]),
            },
            affiliates: {
              state: domainAdapters.affiliates?.state ?? "contract-required",
              coverage: domainAdapters.affiliates?.coverage ?? [],
            },
            crm: {
              state: domainAdapters.crm?.state ?? "contract-required",
              coverage: domainAdapters.crm?.coverage ?? [],
            },
            products: {
              state: domainAdapters.products?.state ?? "contract-required",
              coverage: domainAdapters.products?.coverage ?? [],
            },
            reservations: {
              state: domainAdapters.reservations?.state ?? "contract-required",
              coverage: domainAdapters.reservations?.coverage ?? [],
            },
            ticketing: {
              state: domainAdapters.ticketing?.state ?? "contract-required",
              coverage: domainAdapters.ticketing?.coverage ?? [],
            },
            orders: {
              state: domainAdapters.orders?.state ?? "contract-required",
              coverage: domainAdapters.orders?.coverage ?? [],
            },
            financial: {
              state: domainAdapters.financial?.state ?? "contract-required",
              coverage: domainAdapters.financial?.coverage ?? [],
            },
            content: {
              state: domainAdapters.content?.state ?? "contract-required",
              coverage: domainAdapters.content?.coverage ?? [],
            },
            destinations: {
              state: domainAdapters.destinations?.state ?? "contract-required",
              coverage: domainAdapters.destinations?.coverage ?? [],
            },
            support: {
              state: "available",
              coverage: Object.freeze([
                "signed-session",
                "actor-preserved",
                "effective-user",
                "critical-actions-denied",
              ]),
            },
            permissions: {
              state: "available",
              source: "auth-owner",
              coverage: Object.freeze([
                "canonical-role",
                "capabilities",
                "durable-policy",
                "session-invalidation",
              ]),
            },
            audit: {
              state:
                auditStore.durability?.() === "mysql-append-only"
                  ? "available"
                  : "runtime-projection",
              durable: auditStore.durability?.() === "mysql-append-only",
            },
            system: {
              state: "available",
              coverage: Object.freeze(["health", "readiness", "release"]),
            },
            settings: {
              state: "available",
              coverage: Object.freeze(["local-safe-preferences"]),
            },
          },
        });
        return;
      }

      if (await handleUserCriticalAction(request, response, requestUrl)) {
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
            users: (await authApi.listAdminUsers()).map(userProjection),
          });
          return;
        }
        const id = decodeURIComponent(
          pathname.slice(`${adminPrefix}/users/`.length),
        );
        const user = await authApi.findAdminUser(id);
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
        const destinationId = bounded(
          requestUrl.searchParams.get("destinationId"),
          120,
        );
        const projection = await businessDirectoryProjection(
          await authApi.listAdminUsers(),
          domainAdapters.businesses,
          destinationId,
        );
        json(response, 200, {
          ...projection,
          source: "identity-membership+business-owner-profile",
          authority: "read-only-directory",
          mutationContract: domainAdapters.businesses
            ? "BUSINESS_ADMIN_CONTRACT_REGISTERED"
            : "BUSINESS_ADMIN_CONTRACT_REQUIRED",
        });
        return;
      }

      if (pathname === adminPrefix + "/search") {
        const actor = await requireCapability(
          request,
          response,
          "platform.read",
        );
        if (!actor) return;

        const rawQuery = bounded(requestUrl.searchParams.get("q"), 160);
        const normalizedQuery = normalizeSearchText(rawQuery);
        const destinationId = searchDestinationId(
          requestUrl.searchParams.get("destinationId"),
        );
        const limit = searchInteger(requestUrl.searchParams.get("limit"), 30, {
          min: 1,
          max: 50,
        });
        const offset = searchInteger(requestUrl.searchParams.get("offset"), 0, {
          min: 0,
          max: 500,
        });

        if (destinationId === null) {
          json(response, 400, { error: "INVALID_DESTINATION_ID" });
          return;
        }
        if (limit === null || offset === null) {
          json(response, 400, { error: "INVALID_SEARCH_PAGINATION" });
          return;
        }

        if (Array.from(rawQuery).length < 2) {
          json(response, 200, {
            query: rawQuery,
            normalizedQuery,
            destinationId: destinationId || null,
            state: "idle",
            results: [],
            groups: [],
            partial: [],
            pagination: {
              limit,
              offset,
              total: 0,
              hasMore: false,
              nextOffset: null,
            },
          });
          return;
        }

        if (!consumeSearchAttempt(actor.subject)) {
          json(response, 429, { error: "SEARCH_RATE_LIMITED" });
          return;
        }

        const results = [];
        const partial = [];
        const support = supportContext(request, actor);
        const capabilityAllowed = (capability) =>
          authorizeCapability(actor, capability).allowed;
        const configuredUsers = await authApi.listAdminUsers();

        if (capabilityAllowed("users.read")) {
          if (destinationId) {
            partial.push(
              Object.freeze({
                domain: "users",
                types: Object.freeze(["user"]),
                reason: "destination_scope_unavailable",
              }),
            );
          } else {
            for (const user of configuredUsers) {
              const searchable = normalizeSearchText(
                [
                  user.id,
                  user.email,
                  user.role,
                  canonicalAuthRole(user.role),
                  ...(user.businessIds ?? []),
                ].join(" "),
              );
              if (!searchable.includes(normalizedQuery)) continue;
              results.push(
                Object.freeze({
                  type: "user",
                  id: user.id,
                  title: user.email,
                  context: canonicalAuthRole(user.role),
                  href: "#users:" + encodeURIComponent(user.id),
                  domain: "users",
                }),
              );
            }
          }
        }

        if (capabilityAllowed("business.read")) {
          const businessProjection = await businessDirectoryProjection(
            configuredUsers,
            domainAdapters.businesses,
            destinationId,
          );
          if (
            destinationId &&
            businessProjection.destinationScope !== "owner-backed"
          ) {
            partial.push(
              Object.freeze({
                domain: "businesses",
                types: Object.freeze(["business"]),
                reason: "destination_scope_unavailable",
              }),
            );
          } else {
            for (const business of businessProjection.businesses) {
              const searchable = normalizeSearchText(
                [
                  business.id,
                  business.name,
                  ...business.members.flatMap((member) => [
                    member.email,
                    member.id,
                  ]),
                ]
                  .filter(Boolean)
                  .join(" "),
              );
              if (!searchable.includes(normalizedQuery)) continue;
              results.push(
                Object.freeze({
                  type: "business",
                  id: business.id,
                  title: business.name || business.id,
                  context: [
                    business.destinationId,
                    String(business.members.length) + " membro(s)",
                  ]
                    .filter(Boolean)
                    .join(" · "),
                  href: "#businesses:" + encodeURIComponent(business.id),
                  domain: "businesses",
                  ...(business.destinationId
                    ? { destinationId: business.destinationId }
                    : {}),
                }),
              );
            }
          }
        }

        for (const source of searchAdapterSources) {
          const adapter = domainAdapters[source.adapterKey];
          if (
            typeof adapter?.searchCapability === "string" &&
            adapter.searchCapability !== source.capability
          ) {
            partial.push(
              Object.freeze({
                domain: source.domain,
                types: source.types,
                reason: "capability_contract_mismatch",
              }),
            );
            continue;
          }
          if (!capabilityAllowed(source.capability)) continue;

          if (
            typeof adapter?.searchDestinationAware === "boolean" &&
            adapter.searchDestinationAware !== source.destinationAware
          ) {
            partial.push(
              Object.freeze({
                domain: source.domain,
                types: source.types,
                reason: "destination_contract_mismatch",
              }),
            );
            continue;
          }

          if (destinationId && !source.destinationAware) {
            partial.push(
              Object.freeze({
                domain: source.domain,
                types: source.types,
                reason: "destination_scope_unavailable",
              }),
            );
            continue;
          }
          if (typeof adapter?.search !== "function") {
            partial.push(
              Object.freeze({
                domain: source.domain,
                types: source.types,
                reason: "owner_search_unavailable",
              }),
            );
            continue;
          }

          try {
            const domainResults = await adapter.search({
              query: rawQuery,
              actor,
              request,
              effectiveUser: support?.effectiveUser ?? null,
              destinationId,
              limit: 50,
            });
            for (const result of domainResults ?? []) {
              const normalized = normalizedSearchResult(result, source);
              if (!normalized) continue;
              if (
                destinationId &&
                source.destinationAware &&
                normalized.destinationId !== destinationId
              ) {
                continue;
              }
              results.push(normalized);
            }
            if (destinationId && source.domain === "crm") {
              partial.push(
                Object.freeze({
                  domain: "crm",
                  types: Object.freeze(["contract"]),
                  reason: "contract_destination_scope_unavailable",
                }),
              );
            }
          } catch {
            partial.push(
              Object.freeze({
                domain: source.domain,
                types: source.types,
                reason: "owner_search_failed",
              }),
            );
          }
        }

        const orderOf = (type) => {
          const index = searchResultTypeOrder.indexOf(type);
          return index === -1 ? searchResultTypeOrder.length : index;
        };
        const deduplicated = Array.from(
          new Map(
            results.map((result) => [
              [result.type, result.id, result.href].join(":"),
              result,
            ]),
          ).values(),
        ).sort(
          (left, right) =>
            orderOf(left.type) - orderOf(right.type) ||
            left.title.localeCompare(right.title, "pt-BR", {
              sensitivity: "base",
            }),
        );
        const page = deduplicated.slice(offset, offset + limit);
        const hasMore = offset + page.length < deduplicated.length;
        const state =
          partial.length > 0
            ? "partial"
            : page.length === 0
              ? "empty"
              : "complete";

        json(response, 200, {
          query: rawQuery,
          normalizedQuery,
          destinationId: destinationId || null,
          state,
          results: page,
          groups: groupSearchResults(page),
          partial: Object.freeze(partial),
          pagination: {
            limit,
            offset,
            total: deduplicated.length,
            hasMore,
            nextOffset: hasMore ? offset + page.length : null,
          },
        });
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

      if (await handleTicketingCriticalAction(request, response, requestUrl)) {
        return;
      }

      if (await handleProductCriticalAction(request, response, requestUrl)) {
        return;
      }

      if (
        await handleReservationCriticalAction(request, response, requestUrl)
      ) {
        return;
      }

      if (await handleAffiliateCriticalAction(request, response, requestUrl)) {
        return;
      }

      if (await handleFinancialCriticalAction(request, response, requestUrl)) {
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
        if (mutation && namespace === "destinations") {
          const stepUp = stepUpContext(request, actor);
          if (!stepUp) {
            await audit(request, actor, {
              action: "control-center.destinations.mutation",
              result: "denied",
              reason: "step_up_required",
              effectiveUserId: support?.effectiveUser?.id ?? null,
              entityType: "destination",
              entityId: bounded(requestUrl.pathname, 160),
            });
            json(response, 403, { error: "STEP_UP_REQUIRED" });
            return;
          }
        }

        const adapterOutcome = await adapter.handle({
          request,
          response,
          requestUrl,
          actor,
          effectiveUser: support?.effectiveUser ?? null,
        });
        if (mutation) {
          const auditContext =
            adapterOutcome?.audit && typeof adapterOutcome.audit === "object"
              ? adapterOutcome.audit
              : adapterOutcome && typeof adapterOutcome === "object"
                ? adapterOutcome
                : {};
          await audit(request, actor, {
            action: `control-center.${namespace}.mutation.complete`,
            result:
              response.statusCode >= 200 && response.statusCode < 400
                ? "success"
                : "failure",
            effectiveUserId: support?.effectiveUser?.id ?? null,
            tenantId: support?.effectiveUser?.businessIds?.[0] ?? null,
            entityType: auditContext.entityType ?? namespace,
            entityId:
              auditContext.entityId ?? bounded(requestUrl.pathname, 160),
            reason: auditContext.reason ?? null,
            previousState: auditContext.previousState ?? null,
            newState: auditContext.newState ?? null,
          });
        }
        return;
      }

      json(response, 404, { error: "NOT_FOUND" });
    },
  });
}
