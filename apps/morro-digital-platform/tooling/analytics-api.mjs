const analyticsHttpPath = "/api/analytics/v1/events";
const analyticsRuntimePackage = "@touristic/analytics-server";
const maxBodyBytes = 16 * 1024;
const rateLimitWindowMs = 60_000;
const rateLimitMaxRequests = 120;
const maxRateLimitSubjects = 10_000;
const defaultRetentionDays = 90;
const purgeIntervalMs = 60 * 60 * 1_000;

class AnalyticsHttpInputError extends Error {
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

function featureEnabled(value) {
  if (!value || value === "false") return false;
  if (value === "true") return true;
  throw new Error("ANALYTICS_FEATURE_ENABLED_INVALID");
}

function retentionDays(value) {
  if (!value) return defaultRetentionDays;
  if (!/^[0-9]+$/u.test(value)) {
    throw new Error("ANALYTICS_RETENTION_DAYS_INVALID");
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 365) {
    throw new Error("ANALYTICS_RETENTION_DAYS_INVALID");
  }
  return parsed;
}

function clientIp(request) {
  const forwarded = header(request, "x-forwarded-for");
  const first = forwarded.split(",", 1)[0]?.trim();
  return first || request.socket?.remoteAddress || "unknown";
}

function sameOrigin(request) {
  const rawOrigin = header(request, "origin");
  const host = header(request, "host").toLowerCase();
  if (!rawOrigin || !host) return false;

  let origin;
  try {
    origin = new URL(rawOrigin);
  } catch {
    return false;
  }

  if (origin.host.toLowerCase() !== host) return false;

  const forwardedProtocol = header(request, "x-forwarded-proto")
    .split(",", 1)[0]
    ?.trim()
    .toLowerCase();
  if (forwardedProtocol) return origin.protocol === `${forwardedProtocol}:`;

  const encrypted = Boolean(request.socket?.encrypted);
  return origin.protocol === (encrypted ? "https:" : "http:");
}

async function readJsonBody(request) {
  const declared = Number(header(request, "content-length") || "0");
  if (Number.isFinite(declared) && declared > maxBodyBytes) {
    throw new AnalyticsHttpInputError(413, "ANALYTICS_REQUEST_TOO_LARGE");
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
      throw new AnalyticsHttpInputError(400, "ANALYTICS_REQUEST_INVALID");
    }
    total += chunk.length;
    if (total > maxBodyBytes) {
      throw new AnalyticsHttpInputError(413, "ANALYTICS_REQUEST_TOO_LARGE");
    }
    chunks.push(chunk);
  }
  if (total === 0) {
    throw new AnalyticsHttpInputError(400, "ANALYTICS_REQUEST_INVALID");
  }

  try {
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)),
    );
  } catch {
    throw new AnalyticsHttpInputError(400, "ANALYTICS_JSON_INVALID");
  }
}

function json(response, status, body) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Vary", "Origin");
  response.end(JSON.stringify(body));
}

function createRateLimiter(now = Date.now) {
  const subjects = new Map();

  return Object.freeze({
    claim(subject) {
      const timestamp = now();
      for (const [key, state] of subjects) {
        if (timestamp - state.windowStart >= rateLimitWindowMs) {
          subjects.delete(key);
        }
      }
      if (subjects.size >= maxRateLimitSubjects && !subjects.has(subject)) {
        const oldest = subjects.keys().next().value;
        if (oldest !== undefined) subjects.delete(oldest);
      }

      const current = subjects.get(subject);
      if (!current || timestamp - current.windowStart >= rateLimitWindowMs) {
        subjects.set(subject, { windowStart: timestamp, count: 1 });
        return true;
      }
      if (current.count >= rateLimitMaxRequests) return false;
      current.count += 1;
      return true;
    },
    clear() {
      subjects.clear();
    },
  });
}

export function createAnalyticsApi({
  getEnvironmentValue,
  loadRuntime = () => import(analyticsRuntimePackage),
  now = Date.now,
}) {
  const enabledValue = String(
    getEnvironmentValue("ANALYTICS_FEATURE_ENABLED") ?? "",
  ).trim();
  const databaseUrl = String(
    getEnvironmentValue("ANALYTICS_DATABASE_URL") ?? "",
  ).trim();
  const configuredRetentionDays = String(
    getEnvironmentValue("ANALYTICS_RETENTION_DAYS") ?? "",
  ).trim();

  const limiter = createRateLimiter(now);
  let enabled = false;
  let ready = false;
  let started = false;
  let pool = null;
  let transport = null;
  let purgeRepository = null;
  let purgeTimer = null;

  async function start() {
    if (started) return ready;
    started = true;

    try {
      enabled = featureEnabled(enabledValue);
      if (!enabled) {
        ready = true;
        return true;
      }

      if (!databaseUrl) throw new Error("ANALYTICS_DATABASE_URL_REQUIRED");
      const days = retentionDays(configuredRetentionDays);
      const runtime = await loadRuntime();
      pool = runtime.createAnalyticsMySqlPool(databaseUrl);
      await runtime.applyAnalyticsSchema(pool);
      transport = runtime.createAnalyticsHttpTransport({
        pool,
        retentionDays: days,
      });
      purgeRepository = new runtime.MySqlAnalyticsEventRepository(pool);
      await purgeRepository.purgeExpired(new Date(now()).toISOString());
      purgeTimer = setInterval(() => {
        void purgeRepository
          ?.purgeExpired(new Date(now()).toISOString())
          .catch(() => undefined);
      }, purgeIntervalMs);
      purgeTimer.unref?.();
      ready = true;
      return true;
    } catch {
      ready = false;
      if (purgeTimer) clearInterval(purgeTimer);
      purgeTimer = null;
      await pool?.end?.().catch(() => undefined);
      pool = null;
      transport = null;
      purgeRepository = null;
      return false;
    }
  }

  async function stop() {
    if (purgeTimer) clearInterval(purgeTimer);
    purgeTimer = null;
    limiter.clear();
    const activePool = pool;
    pool = null;
    transport = null;
    purgeRepository = null;
    ready = false;
    started = false;
    await activePool?.end?.();
  }

  return Object.freeze({
    matches(pathname) {
      return pathname === analyticsHttpPath;
    },

    readinessCheck() {
      if (!enabled && started && ready) {
        return Object.freeze({
          status: "pass",
          critical: true,
          detail: "analytics-disabled",
        });
      }
      return Object.freeze({
        status: ready ? "pass" : "fail",
        critical: true,
        detail: ready ? "analytics-runtime-ready" : "ANALYTICS_UNAVAILABLE",
      });
    },

    start,
    stop,

    async handle(request, response, requestUrl) {
      if (!enabled) {
        json(response, 503, { error: "ANALYTICS_FEATURE_DISABLED" });
        return;
      }
      if (!ready || !transport) {
        json(response, 503, { error: "ANALYTICS_UNAVAILABLE" });
        return;
      }
      if (String(request.method || "GET").toUpperCase() !== "POST") {
        json(response, 405, { error: "METHOD_NOT_ALLOWED" });
        return;
      }
      if (!sameOrigin(request)) {
        json(response, 403, { error: "ORIGIN_DENIED" });
        return;
      }
      if (!limiter.claim(clientIp(request))) {
        response.setHeader("Retry-After", "60");
        json(response, 429, { error: "RATE_LIMITED" });
        return;
      }

      const contentType = header(request, "content-type")
        .split(";", 1)[0]
        .trim()
        .toLowerCase();
      if (contentType !== "application/json") {
        json(response, 415, { error: "UNSUPPORTED_MEDIA_TYPE" });
        return;
      }

      let body;
      try {
        body = await readJsonBody(request);
      } catch (error) {
        const status =
          error instanceof AnalyticsHttpInputError ? error.status : 400;
        const code =
          error instanceof AnalyticsHttpInputError
            ? error.code
            : "ANALYTICS_REQUEST_INVALID";
        json(response, status, { error: code });
        return;
      }

      const result = await transport.handle({
        method: "POST",
        pathname: requestUrl.pathname,
        body,
      });
      json(response, result.status, result.body);
    },
  });
}

export {
  analyticsHttpPath,
  maxBodyBytes as analyticsMaxBodyBytes,
  rateLimitMaxRequests as analyticsRateLimitMaxRequests,
};
