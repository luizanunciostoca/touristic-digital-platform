import {
  authorizeBusinessAccess,
  canonicalAuthRole,
  canonicalAuthRoles,
  capabilitiesForRole,
  hasAuthCapability,
  isPlatformWideAuthRole,
  isReadOnlyAuthRole,
} from "@touristic/auth";
import {
  authenticateConfiguredUser,
  createInMemoryAuthSecurityState,
  createSessionToken,
  createSqlAuthSecurityState,
  csrfTokenForSession,
  isSameOriginAllowed,
  parseConfiguredUsers,
  parseCookies,
  serializeClearedSessionCookie,
  serializeSessionCookie,
  sessionCookieName,
  verifyCsrfToken,
  verifySessionToken,
} from "@touristic/auth-server";
import { createCrmMySqlPoolFromEnvironment } from "@touristic/crm-server";

const authPrefix = "/api/dashboard/auth";
const loginWindowMs = 15 * 60 * 1000;
const loginLimit = 10;
const maxBodyBytes = 32 * 1024;

function firstHeader(value) {
  return Array.isArray(value) ? value[0] : value;
}

function json(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(payload));
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

function publicOrigin(request, configuredOrigin, production) {
  const explicit = String(configuredOrigin || "").trim();
  if (explicit) {
    try {
      return new URL(explicit).origin;
    } catch {
      return "";
    }
  }
  if (production) return "";
  const host = firstHeader(request.headers.host);
  return host ? `http://${host}` : "";
}

function safeErrorCode(error) {
  if (!error) return "unknown";
  if (typeof error === "object" && typeof error.code === "string") {
    return error.code.slice(0, 120);
  }
  if (error instanceof Error && error.message) {
    return error.message.slice(0, 120);
  }
  return "unknown";
}

export function createAuthApi({ getEnvironmentValue, audit = () => {} }) {
  const secret = String(
    getEnvironmentValue("DASHBOARD_AUTH_SECRET") || "",
  ).trim();
  const usersJson = getEnvironmentValue("DASHBOARD_USERS_JSON") || "";
  const production = getEnvironmentValue("NODE_ENV") === "production";
  const configuredOrigin = getEnvironmentValue("DASHBOARD_AUTH_ORIGIN") || "";
  const authDatabaseUrl = String(
    getEnvironmentValue("AUTH_DATABASE_URL") || "",
  ).trim();
  const adminGlobalBypassConfirmed =
    String(getEnvironmentValue("DASHBOARD_ADMIN_GLOBAL_BYPASS_CONFIRMED") || "")
      .trim()
      .toLowerCase() === "true";
  const ttlRaw = Number(
    getEnvironmentValue("DASHBOARD_SESSION_TTL_SECONDS") || 8 * 60 * 60,
  );
  const ttlSeconds = Number.isFinite(ttlRaw) ? ttlRaw : 8 * 60 * 60;
  const secureCookie = production;

  let securityState;
  let durableSecurityStateCreated = false;
  try {
    if (authDatabaseUrl) {
      const pool = createCrmMySqlPoolFromEnvironment({
        CRM_DATABASE_URL: authDatabaseUrl,
      });
      securityState = createSqlAuthSecurityState(pool);
      durableSecurityStateCreated = true;
    } else {
      securityState = createInMemoryAuthSecurityState();
    }
  } catch (error) {
    durableSecurityStateCreated = false;
    securityState = createInMemoryAuthSecurityState();
    audit(null, {
      action: "dashboard.security_state",
      result: "unavailable",
      reason: safeErrorCode(error),
    });
  }

  let users = [];
  let configurationError = null;
  let securityStateInitialized = false;
  let securityStateHealthy = false;
  let securityStateError = null;
  let stopped = false;
  const delegatedSessions = new WeakMap();

  try {
    users = parseConfiguredUsers(usersJson);
  } catch (error) {
    configurationError = error;
  }

  const hasGlobalAdmin = users.some((user) =>
    isPlatformWideAuthRole(user.role),
  );
  const productionSecurityConfigured =
    !production ||
    (durableSecurityStateCreated &&
      (!hasGlobalAdmin || adminGlobalBypassConfirmed));

  function baseConfigured() {
    return (
      secret.length >= 32 &&
      !configurationError &&
      users.length > 0 &&
      productionSecurityConfigured &&
      (!production ||
        Boolean(publicOrigin({ headers: {} }, configuredOrigin, true)))
    );
  }

  const configured = () => baseConfigured() && securityStateInitialized;

  function markSecurityHealthy() {
    securityStateHealthy = true;
    securityStateError = null;
  }

  function markSecurityFailure(error) {
    securityStateHealthy = false;
    securityStateError = safeErrorCode(error);
  }

  function readinessCheck() {
    if (!baseConfigured()) {
      const reason = !productionSecurityConfigured
        ? !authDatabaseUrl
          ? "AUTH_DATABASE_URL_REQUIRED_IN_PRODUCTION"
          : !durableSecurityStateCreated
            ? "AUTH_DURABLE_SECURITY_STATE_INVALID"
            : "ADMIN_GLOBAL_BYPASS_CONFIRMATION_REQUIRED"
        : configurationError
          ? "DASHBOARD_USERS_JSON_INVALID"
          : secret.length < 32
            ? "DASHBOARD_AUTH_SECRET_INVALID"
            : users.length === 0
              ? "DASHBOARD_USERS_REQUIRED"
              : "DASHBOARD_AUTH_ORIGIN_REQUIRED";
      return Object.freeze({ status: "fail", critical: true, detail: reason });
    }
    if (!securityStateInitialized || !securityStateHealthy) {
      return Object.freeze({
        status: "fail",
        critical: true,
        detail: securityStateError || "AUTH_SECURITY_STATE_NOT_READY",
      });
    }
    return Object.freeze({
      status: "pass",
      critical: true,
      detail: durableSecurityStateCreated
        ? "shared-durable"
        : "process-local-development",
    });
  }

  function originAllowed(request) {
    const expectedOrigin = publicOrigin(request, configuredOrigin, production);
    return isSameOriginAllowed({
      expectedOrigin,
      origin: firstHeader(request.headers.origin),
      referer: firstHeader(request.headers.referer),
      production,
    });
  }

  function configuredUserById(userId) {
    return (
      users.find((candidate) => candidate.id === String(userId || "").trim()) ??
      null
    );
  }

  function effectiveRole(user, state) {
    if (!state?.roleOverride) return user.role;
    if (!canonicalAuthRoles.includes(state.roleOverride)) {
      throw new Error("AUTH_PRINCIPAL_ROLE_OVERRIDE_INVALID");
    }
    return state.roleOverride;
  }

  async function effectiveConfiguredUser(user) {
    const state = await securityState.getPrincipalAdminState(user.id);
    markSecurityHealthy();
    const role = effectiveRole(user, state);
    return Object.freeze({
      id: user.id,
      email: user.email,
      role,
      canonicalRole: canonicalAuthRole(role),
      capabilities: capabilitiesForRole(role),
      businessIds: user.businessIds,
      configuredRole: user.role,
      configuredCanonicalRole: canonicalAuthRole(user.role),
      status: state?.status ?? "active",
      policyUpdatedAt: state?.updatedAt ?? null,
      policyUpdatedBy: state?.updatedBy ?? null,
    });
  }

  async function listAdminUsers() {
    try {
      return Object.freeze(
        await Promise.all(users.map((user) => effectiveConfiguredUser(user))),
      );
    } catch (error) {
      markSecurityFailure(error);
      throw error;
    }
  }

  async function findAdminUser(userId) {
    const user = configuredUserById(userId);
    if (!user) return null;
    try {
      return await effectiveConfiguredUser(user);
    } catch (error) {
      markSecurityFailure(error);
      throw error;
    }
  }

  async function revokeAllUserSessions(userId) {
    const sessions = await securityState.listSessions(userId);
    let revokedSessions = 0;
    for (const session of sessions) {
      if (!session.active) continue;
      const result = await securityState.revokeSessionHandle(
        userId,
        session.handle,
      );
      if (result.found) revokedSessions += 1;
    }
    markSecurityHealthy();
    return revokedSessions;
  }

  function assertMutableAdminTarget(
    actorSubject,
    target,
    nextRole,
    nextStatus,
  ) {
    if (target.id === actorSubject) {
      if (nextStatus === "blocked") {
        throw new Error("AUTH_SELF_BLOCK_DENIED");
      }
      if (nextRole && canonicalAuthRole(nextRole) !== target.canonicalRole) {
        throw new Error("AUTH_SELF_ROLE_CHANGE_DENIED");
      }
    }
    if (
      target.configuredCanonicalRole === "PLATFORM_OWNER" &&
      (nextStatus === "blocked" ||
        (nextRole && canonicalAuthRole(nextRole) !== "PLATFORM_OWNER"))
    ) {
      throw new Error("AUTH_BOOTSTRAP_OWNER_PROTECTED");
    }
  }

  async function updateUserStatus(userId, status, actorSubject) {
    if (status !== "active" && status !== "blocked") {
      throw new Error("AUTH_PRINCIPAL_STATUS_INVALID");
    }
    const target = await findAdminUser(userId);
    if (!target) return null;
    assertMutableAdminTarget(actorSubject, target, null, status);
    const previousState = target;
    await securityState.setPrincipalAdminState({
      subject: target.id,
      status,
      roleOverride: target.role === target.configuredRole ? null : target.role,
      updatedBy: actorSubject,
    });
    const revokedSessions = await revokeAllUserSessions(target.id);
    const newState = await findAdminUser(target.id);
    return Object.freeze({
      previousState,
      newState,
      revokedSessions,
    });
  }

  async function updateUserRole(userId, roleInput, actorSubject) {
    const role =
      typeof roleInput === "string" && canonicalAuthRoles.includes(roleInput)
        ? roleInput
        : null;
    if (!role) throw new Error("AUTH_PRINCIPAL_ROLE_INVALID");
    const target = await findAdminUser(userId);
    if (!target) return null;
    assertMutableAdminTarget(actorSubject, target, role, target.status);
    const previousState = target;
    await securityState.setPrincipalAdminState({
      subject: target.id,
      status: target.status,
      roleOverride: role === target.configuredRole ? null : role,
      updatedBy: actorSubject,
    });
    const revokedSessions = await revokeAllUserSessions(target.id);
    const newState = await findAdminUser(target.id);
    return Object.freeze({
      previousState,
      newState,
      revokedSessions,
    });
  }

  async function currentSession(request) {
    if (!configured()) return null;
    const delegated = delegatedSessions.get(request);
    if (delegated) return delegated;
    const cookies = parseCookies(firstHeader(request.headers.cookie));
    const verified = verifySessionToken(cookies[sessionCookieName], secret);
    if (!verified) return null;
    try {
      const revoked = await securityState.isRevoked(verified.sessionId);
      markSecurityHealthy();
      if (revoked) return null;
    } catch (error) {
      markSecurityFailure(error);
      audit(request, {
        action: "dashboard.security_state",
        result: "unavailable",
        reason: securityStateError,
      });
      return null;
    }
    const currentUser = configuredUserById(verified.subject);
    if (!currentUser) return null;
    try {
      const effective = await effectiveConfiguredUser(currentUser);
      if (effective.status === "blocked") return null;
      return Object.freeze({
        ...verified,
        email: effective.email,
        role: effective.role,
        businessIds: effective.businessIds,
      });
    } catch (error) {
      markSecurityFailure(error);
      audit(request, {
        action: "dashboard.principal_state",
        result: "unavailable",
        reason: securityStateError,
      });
      return null;
    }
  }

  function sessionPayload(session) {
    const csrfToken = csrfTokenForSession(session, secret);
    if (!csrfToken) return null;
    return {
      authenticated: true,
      csrfToken,
      user: {
        id: session.subject,
        email: session.email,
        role: session.role,
        canonicalRole: canonicalAuthRole(session.role),
        capabilities: capabilitiesForRole(session.role),
        businessIds: session.businessIds,
      },
    };
  }

  function unavailable(response) {
    json(response, 503, {
      error: "DASHBOARD_AUTH_NOT_CONFIGURED",
      message: "Acesso ao painel temporariamente indisponível.",
    });
  }

  async function requireSession(request, response) {
    if (!configured()) {
      unavailable(response);
      return null;
    }
    const session = await currentSession(request);
    if (!session) {
      if (!securityStateHealthy) {
        unavailable(response);
        return null;
      }
      audit(request, {
        action: "dashboard.session",
        result: "denied",
        reason: "missing_or_invalid_session",
      });
      json(response, 401, {
        error: "AUTH_REQUIRED",
        message: "Autenticação obrigatória.",
      });
      return null;
    }
    return session;
  }

  function authorizeMutation(
    request,
    active,
    auditAction = "platform.mutation",
  ) {
    if (!originAllowed(request)) {
      audit(request, {
        action: auditAction,
        result: "denied",
        reason: "cross_origin_request",
      });
      return Object.freeze({ allowed: false, reason: "cross_origin_request" });
    }
    if (
      !verifyCsrfToken(
        firstHeader(request.headers["x-csrf-token"]),
        active,
        secret,
      )
    ) {
      audit(request, {
        action: auditAction,
        result: "denied",
        reason: "invalid_csrf",
      });
      return Object.freeze({ allowed: false, reason: "invalid_csrf" });
    }
    return Object.freeze({ allowed: true });
  }

  async function authorizeBusinessRequest(
    request,
    response,
    businessIdInput,
    { mutation = false, auditAction = "business.resource" } = {},
  ) {
    const active = await requireSession(request, response);
    if (!active) return null;
    if (mutation && !originAllowed(request)) {
      audit(request, {
        action: auditAction,
        result: "denied",
        reason: "cross_origin_request",
      });
      json(response, 403, {
        error: "ORIGIN_DENIED",
        message: "Origem da solicitação não autorizada.",
      });
      return null;
    }
    if (
      mutation &&
      !verifyCsrfToken(
        firstHeader(request.headers["x-csrf-token"]),
        active,
        secret,
      )
    ) {
      audit(request, {
        action: auditAction,
        result: "denied",
        reason: "invalid_csrf",
      });
      json(response, 403, {
        error: "INVALID_CSRF",
        message: "Validação de segurança expirada. Recarregue o painel.",
      });
      return null;
    }
    const decision = authorizeBusinessAccess(active, businessIdInput, {
      mutation,
    });
    if (!decision.allowed || !decision.businessId) {
      audit(request, {
        action: auditAction,
        result: "denied",
        reason: decision.reason,
      });
      if (decision.reason === "invalid_business_id")
        json(response, 400, {
          error: "INVALID_BUSINESS_ID",
          message: "Identificador de empresa inválido.",
        });
      else if (decision.reason === "read_only_role")
        json(response, 403, {
          error: "READ_ONLY_ROLE",
          message: "Este usuário possui acesso somente para leitura.",
        });
      else
        json(response, 403, {
          error: "BUSINESS_ACCESS_DENIED",
          message: "Acesso à empresa não autorizado.",
        });
      return null;
    }
    if (
      isPlatformWideAuthRole(active.role) &&
      !active.businessIds.includes(decision.businessId)
    ) {
      audit(request, {
        action: "dashboard.admin_global_tenant_bypass",
        result: "allowed",
        reason: production ? "operator_confirmed" : "development",
        businessId: decision.businessId,
      });
    }
    return Object.freeze({ session: active, businessId: decision.businessId });
  }

  async function login(request, response) {
    if (!originAllowed(request)) {
      audit(request, {
        action: "dashboard.origin",
        result: "denied",
        reason: "cross_origin_request",
      });
      json(response, 403, {
        error: "ORIGIN_DENIED",
        message: "Origem da solicitação não autorizada.",
      });
      return;
    }
    if (!configured()) {
      unavailable(response);
      return;
    }

    const limiterKey = request.socket?.remoteAddress || "unknown";
    let allowed;
    try {
      allowed = await securityState.consumeLoginAttempt(limiterKey, {
        windowMs: loginWindowMs,
        limit: loginLimit,
      });
      markSecurityHealthy();
    } catch (error) {
      markSecurityFailure(error);
      audit(request, {
        action: "dashboard.login_rate_limit",
        result: "unavailable",
        reason: securityStateError,
      });
      unavailable(response);
      return;
    }
    if (!allowed) {
      audit(request, {
        action: "dashboard.login_rate_limit",
        result: "denied",
        reason: "limit_exceeded",
      });
      json(response, 429, {
        error: "RATE_LIMITED",
        message: "Muitas tentativas de login. Tente novamente mais tarde.",
      });
      return;
    }

    let body;
    try {
      body = await readJsonBody(request);
    } catch {
      json(response, 400, {
        error: "INVALID_REQUEST",
        message: "Solicitação de login inválida.",
      });
      return;
    }

    const user = authenticateConfiguredUser(users, body?.email, body?.password);
    if (!user) {
      audit(request, {
        action: "dashboard.login",
        result: "denied",
        reason: "invalid_credentials",
      });
      json(response, 401, {
        error: "INVALID_CREDENTIALS",
        message: "E-mail ou senha inválidos.",
      });
      return;
    }

    let effectiveUser;
    try {
      effectiveUser = await effectiveConfiguredUser(user);
    } catch (error) {
      markSecurityFailure(error);
      audit(request, {
        action: "dashboard.principal_state",
        result: "unavailable",
        reason: securityStateError,
      });
      unavailable(response);
      return;
    }
    if (effectiveUser.status === "blocked") {
      audit(request, {
        action: "dashboard.login",
        result: "denied",
        reason: "account_blocked",
      });
      json(response, 403, {
        error: "ACCOUNT_BLOCKED",
        message: "Esta conta está bloqueada.",
      });
      return;
    }

    const token = createSessionToken(
      {
        subject: effectiveUser.id,
        email: effectiveUser.email,
        role: effectiveUser.role,
        businessIds: effectiveUser.businessIds,
      },
      secret,
      { ttlSeconds },
    );
    const session = verifySessionToken(token, secret);
    if (!token || !session) {
      unavailable(response);
      return;
    }

    try {
      await securityState.registerSession({
        sessionId: session.sessionId,
        subject: session.subject,
        issuedAt: session.issuedAt,
        expiresAt: session.expiresAt,
      });
      markSecurityHealthy();
    } catch (error) {
      markSecurityFailure(error);
      audit(request, {
        action: "dashboard.session_registry",
        result: "unavailable",
        reason: securityStateError,
      });
      unavailable(response);
      return;
    }

    const payload = sessionPayload(session);
    if (!payload) {
      unavailable(response);
      return;
    }

    response.setHeader(
      "Set-Cookie",
      serializeSessionCookie(token, {
        maxAgeSeconds: ttlSeconds,
        secure: secureCookie,
      }),
    );
    audit(request, { action: "dashboard.login", result: "success" });
    json(response, 200, { success: true, ...payload });
  }

  async function session(request, response) {
    const active = await requireSession(request, response);
    if (!active) return;
    const payload = sessionPayload(active);
    if (!payload) {
      unavailable(response);
      return;
    }
    response.setHeader("Vary", "Cookie");
    json(response, 200, payload);
  }

  async function logout(request, response) {
    const active = await requireSession(request, response);
    if (!active) return;

    if (!originAllowed(request)) {
      audit(request, {
        action: "dashboard.mutation",
        result: "denied",
        reason: "cross_origin_request",
      });
      json(response, 403, {
        error: "ORIGIN_DENIED",
        message: "Origem da solicitação não autorizada.",
      });
      return;
    }
    if (isReadOnlyAuthRole(active.role)) {
      audit(request, {
        action: "dashboard.mutation",
        result: "denied",
        reason: "read_only_role",
      });
      json(response, 403, {
        error: "READ_ONLY_ROLE",
        message: "Este usuário possui acesso somente para leitura.",
      });
      return;
    }
    if (
      !verifyCsrfToken(
        firstHeader(request.headers["x-csrf-token"]),
        active,
        secret,
      )
    ) {
      audit(request, {
        action: "dashboard.mutation",
        result: "denied",
        reason: "invalid_csrf",
      });
      json(response, 403, {
        error: "INVALID_CSRF",
        message: "Validação de segurança expirada. Recarregue o painel.",
      });
      return;
    }

    try {
      await securityState.revoke(active);
      markSecurityHealthy();
    } catch (error) {
      markSecurityFailure(error);
      audit(request, {
        action: "dashboard.logout",
        result: "unavailable",
        reason: securityStateError,
      });
      unavailable(response);
      return;
    }
    response.setHeader(
      "Set-Cookie",
      serializeClearedSessionCookie(secureCookie),
    );
    audit(request, { action: "dashboard.logout", result: "success" });
    json(response, 200, { success: true });
  }

  return Object.freeze({
    authorizeBusinessRequest,
    authorizeMutation,
    listAdminUsers,
    findAdminUser,
    updateUserStatus,
    updateUserRole,
    listConfiguredUsers() {
      return Object.freeze(
        users.map((user) =>
          Object.freeze({
            id: user.id,
            email: user.email,
            role: user.role,
            canonicalRole: canonicalAuthRole(user.role),
            capabilities: capabilitiesForRole(user.role),
            businessIds: user.businessIds,
          }),
        ),
      );
    },
    findConfiguredUser(userId) {
      const user = configuredUserById(userId);
      if (!user) return null;
      return Object.freeze({
        id: user.id,
        email: user.email,
        role: user.role,
        canonicalRole: canonicalAuthRole(user.role),
        capabilities: capabilitiesForRole(user.role),
        businessIds: user.businessIds,
      });
    },
    reauthenticate(userId, password) {
      const user = configuredUserById(userId);
      if (!user) {
        authenticateConfiguredUser(users, "missing@example.invalid", password);
        return false;
      }
      return Boolean(authenticateConfiguredUser(users, user.email, password));
    },
    async listUserSessions(userId) {
      const user = configuredUserById(userId);
      if (!user) return null;
      try {
        const sessions = await securityState.listSessions(user.id);
        markSecurityHealthy();
        return sessions;
      } catch (error) {
        markSecurityFailure(error);
        throw error;
      }
    },
    async revokeUserSession(userId, handle) {
      const user = configuredUserById(userId);
      if (!user) return null;
      try {
        const result = await securityState.revokeSessionHandle(user.id, handle);
        markSecurityHealthy();
        return result;
      } catch (error) {
        markSecurityFailure(error);
        throw error;
      }
    },
    async withDelegatedSession(request, effectiveUserId, operation) {
      if (
        !request ||
        typeof request !== "object" ||
        typeof operation !== "function" ||
        delegatedSessions.has(request)
      ) {
        throw new Error("AUTH_DELEGATION_CONTEXT_INVALID");
      }

      const actor = await currentSession(request);
      if (
        !actor ||
        !isPlatformWideAuthRole(actor.role) ||
        !hasAuthCapability(actor.role, "support.impersonate")
      ) {
        throw new Error("AUTH_DELEGATION_NOT_AUTHORIZED");
      }

      const configuredTarget = configuredUserById(effectiveUserId);
      if (!configuredTarget) {
        throw new Error("AUTH_DELEGATION_TARGET_INVALID");
      }
      const target = await effectiveConfiguredUser(configuredTarget);
      if (target.status === "blocked" || isPlatformWideAuthRole(target.role)) {
        throw new Error("AUTH_DELEGATION_TARGET_INVALID");
      }

      const delegated = Object.freeze({
        ...actor,
        subject: target.id,
        email: target.email,
        role: target.role,
        businessIds: target.businessIds,
      });

      delegatedSessions.set(request, delegated);
      try {
        return await operation(delegated);
      } finally {
        delegatedSessions.delete(request);
      }
    },
    resolveSession: currentSession,
    readinessCheck,

    async start() {
      if (stopped) throw new Error("AUTH_RUNTIME_ALREADY_STOPPED");
      if (production && !durableSecurityStateCreated) {
        securityStateError = authDatabaseUrl
          ? "AUTH_DURABLE_SECURITY_STATE_INVALID"
          : "AUTH_DATABASE_URL_REQUIRED_IN_PRODUCTION";
        return;
      }
      try {
        await securityState.initialize();
        securityStateInitialized = true;
        markSecurityHealthy();
      } catch (error) {
        securityStateInitialized = false;
        markSecurityFailure(error);
        audit(null, {
          action: "dashboard.security_state",
          result: "unavailable",
          reason: securityStateError,
        });
      }
    },

    async stop() {
      if (stopped) return;
      stopped = true;
      try {
        await securityState.close();
      } finally {
        securityStateInitialized = false;
        securityStateHealthy = false;
      }
    },

    matches(pathname) {
      return (
        pathname === `${authPrefix}/login` ||
        pathname === `${authPrefix}/session` ||
        pathname === `${authPrefix}/logout`
      );
    },
    async handle(request, response, pathname) {
      if (pathname === `${authPrefix}/login` && request.method === "POST") {
        await login(request, response);
        return;
      }
      if (pathname === `${authPrefix}/session` && request.method === "GET") {
        await session(request, response);
        return;
      }
      if (pathname === `${authPrefix}/logout` && request.method === "POST") {
        await logout(request, response);
        return;
      }
      json(response, 405, { error: "METHOD_NOT_ALLOWED" });
    },
  });
}
