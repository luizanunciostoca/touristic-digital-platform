import {
  authenticateConfiguredUser,
  createAuthRevocationStore,
  createSessionToken,
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

function createLoginLimiter() {
  const attempts = new Map();
  return {
    allow(key, now = Date.now()) {
      const recent = (attempts.get(key) || []).filter(
        (timestamp) => now - timestamp < loginWindowMs,
      );
      if (recent.length >= loginLimit) {
        attempts.set(key, recent);
        return false;
      }
      recent.push(now);
      attempts.set(key, recent);
      return true;
    },
  };
}

export function createAuthApi({ getEnvironmentValue, audit = () => {} }) {
  const secret = String(
    getEnvironmentValue("DASHBOARD_AUTH_SECRET") || "",
  ).trim();
  const usersJson = getEnvironmentValue("DASHBOARD_USERS_JSON") || "";
  const production = getEnvironmentValue("NODE_ENV") === "production";
  const configuredOrigin = getEnvironmentValue("DASHBOARD_AUTH_ORIGIN") || "";
  const ttlRaw = Number(
    getEnvironmentValue("DASHBOARD_SESSION_TTL_SECONDS") || 8 * 60 * 60,
  );
  const ttlSeconds = Number.isFinite(ttlRaw) ? ttlRaw : 8 * 60 * 60;
  const secureCookie = production;
  const revocations = createAuthRevocationStore();
  const limiter = createLoginLimiter();

  let users = [];
  let configurationError = null;
  try {
    users = parseConfiguredUsers(usersJson);
  } catch (error) {
    configurationError = error;
  }

  const configured = () =>
    secret.length >= 32 &&
    !configurationError &&
    users.length > 0 &&
    (!production ||
      Boolean(publicOrigin({ headers: {} }, configuredOrigin, true)));

  function originAllowed(request) {
    const expectedOrigin = publicOrigin(request, configuredOrigin, production);
    return isSameOriginAllowed({
      expectedOrigin,
      origin: firstHeader(request.headers.origin),
      referer: firstHeader(request.headers.referer),
      production,
    });
  }

  function currentSession(request) {
    if (!configured()) return null;
    const cookies = parseCookies(firstHeader(request.headers.cookie));
    const verified = verifySessionToken(cookies[sessionCookieName], secret);
    if (!verified || revocations.isRevoked(verified.sessionId)) return null;
    const currentUser = users.find((user) => user.id === verified.subject);
    if (!currentUser) return null;
    return Object.freeze({
      ...verified,
      email: currentUser.email,
      role: currentUser.role,
      businessIds: currentUser.businessIds,
    });
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

  function requireSession(request, response) {
    if (!configured()) {
      unavailable(response);
      return null;
    }
    const session = currentSession(request);
    if (!session) {
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
    if (!limiter.allow(limiterKey)) {
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

    const token = createSessionToken(
      {
        subject: user.id,
        email: user.email,
        role: user.role,
        businessIds: user.businessIds,
      },
      secret,
      { ttlSeconds },
    );
    const session = verifySessionToken(token, secret);
    if (!token || !session) {
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

  function session(request, response) {
    const active = requireSession(request, response);
    if (!active) return;
    const payload = sessionPayload(active);
    if (!payload) {
      unavailable(response);
      return;
    }
    response.setHeader("Vary", "Cookie");
    json(response, 200, payload);
  }

  function logout(request, response) {
    const active = requireSession(request, response);
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
    if (active.role === "viewer") {
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

    revocations.revoke(active);
    response.setHeader(
      "Set-Cookie",
      serializeClearedSessionCookie(secureCookie),
    );
    audit(request, { action: "dashboard.logout", result: "success" });
    json(response, 200, { success: true });
  }

  return Object.freeze({
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
        session(request, response);
        return;
      }
      if (pathname === `${authPrefix}/logout` && request.method === "POST") {
        logout(request, response);
        return;
      }
      json(response, 405, { error: "METHOD_NOT_ALLOWED" });
    },
  });
}
