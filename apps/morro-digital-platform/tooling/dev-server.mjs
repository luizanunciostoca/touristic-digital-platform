import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createAnalyticsApi } from "./analytics-api.mjs";
import { createAssistantApi } from "./assistant-api.mjs";
import { createAdminApi } from "./admin-api.mjs";
import { createAdminAuditRuntime } from "./admin-audit-runtime.mjs";
import { createAdminDomainAdapters } from "./admin-domain-adapters.mjs";
import { createAffiliateAdminRuntime } from "./affiliate-admin-runtime.mjs";
import { createAuthApi } from "./auth-api.mjs";
import { createBusinessApi } from "./business-api.mjs";
import { createContentAdminRuntime } from "./content-admin-runtime.mjs";
import { createCrmApi } from "./crm-api.mjs";
import { createDestinationAdminRuntime } from "./destination-admin-runtime.mjs";
import { createDatabaseEnvironmentResolver } from "./database-environment.mjs";
import { resolvePublicDestination } from "./destination-public-projection.mjs";
import { createPaymentsApi } from "./payments-runtime-api.mjs";
import { createPlatformOperations } from "./platform-operations.mjs";
import { createPlacePlatformRuntime } from "./place-platform-runtime.mjs";
import {
  fetchWeatherWithFallback,
  mapOpenMeteoWeatherPayload,
  mapVisualCrossingWeatherPayload,
} from "./weather-provider-mappers.mjs";
import { rewriteWorkspaceModuleSpecifiers } from "./workspace-browser-modules.mjs";

const repositoryRoot = resolve(
  fileURLToPath(new URL("../../../", import.meta.url)),
);
const morroPublicRoot = resolve(
  repositoryRoot,
  "apps/morro-digital-platform/public",
);
const morroDistRoot = resolve(
  repositoryRoot,
  "apps/morro-digital-platform/dist",
);
const morroRuntimeRoot = resolve(morroDistRoot, "runtime");
const morroAnalyticsRoot = resolve(morroDistRoot, "analytics");
const defaultDocument = resolve(morroPublicRoot, "index.html");
const envFile = resolve(repositoryRoot, ".env");
const host = process.env.HOST?.trim() || "127.0.0.1";
const port = Number(process.env.PORT || "4173");
const publicDestinationFallback = Object.freeze({
  id: "morro-de-sao-paulo",
  name: "Morro de São Paulo",
  countryCode: "BR",
  timezone: "America/Bahia",
  currency: "BRL",
  center: Object.freeze({ latitude: -13.3833, longitude: -38.9167 }),
  radiusMeters: 15000,
  modules: Object.freeze({
    marketplace: true,
    map: true,
    navigation: true,
    assistant: true,
    businessPortal: true,
    adminCrm: true,
    booking: false,
    payments: false,
    affiliates: false,
  }),
});
const morroLatitude = -13.3769;
const morroLongitude = -38.9146;
const weatherTimeoutMs = 8_000;
const weatherFreshTtlMs = 5 * 60 * 1000;
const weatherStaleTtlMs = 30 * 60 * 1000;
const mercadoPagoWebhookPath = "/api/payments/v1/webhooks/sandbox";
const runtimeEnvironmentKeys = Object.freeze([
  "VITE_MAPBOX_ACCESS_TOKEN",
  "VITE_MAPBOX_STYLE",
  "VITE_MAPBOX_CONTAINER_ID",
  "VITE_MAPBOX_INITIAL_ZOOM",
  "VITE_MERCADO_PAGO_PUBLIC_KEY",
]);

let weatherCache = null;
let weatherRequestInFlight = null;

const contentTypes = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
});

const publicCrmDocuments = Object.freeze([
  {
    pattern: /^\/proposals\/view\/[A-Za-z0-9_-]{16,64}$/u,
    relativePath: "apps/admin-crm/public/proposal-public.html",
  },
  {
    pattern: /^\/contracts\/view\/[A-Za-z0-9_-]{16,64}$/u,
    relativePath: "apps/admin-crm/public/contract-public.html",
  },
]);

const publicStaticRoots = Object.freeze([
  morroPublicRoot,
  morroDistRoot,
  resolve(repositoryRoot, "apps/admin-crm/public"),
  resolve(repositoryRoot, "apps/control-center/public"),
  resolve(repositoryRoot, "dashboard"),
  resolve(repositoryRoot, "images"),
]);
const packagesRoot = resolve(repositoryRoot, "packages");

function parseDotEnv(content) {
  const values = {};
  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

async function loadLocalEnvironment() {
  try {
    return parseDotEnv(await readFile(envFile, "utf8"));
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return {};
    }
    throw error;
  }
}

const localEnvironment = await loadLocalEnvironment();
const getEnvironmentValue = createDatabaseEnvironmentResolver({
  processEnvironment: process.env,
  localEnvironment,
});

let platformOperations = null;
let paymentsRuntimeReady = false;
let ticketingRuntimeReady = false;
let contentAdminRuntime = null;
let destinationRuntimeReady = false;
let placePlatformRuntime = null;

function auditSecurityEvent(request, event) {
  const pathname = (() => {
    try {
      return new URL(request?.url || "/", `http://${host}:${port}`).pathname;
    } catch {
      return "/";
    }
  })();
  if (!platformOperations) return;
  platformOperations.emit({
    kind: "audit",
    name: "platform.security.audit",
    severity:
      event?.result === "denied" || event?.result === "unavailable"
        ? "warn"
        : "info",
    correlationId: request?.morroCorrelationId,
    attributes: {
      action: String(event?.action || "security.unknown"),
      result: String(event?.result || "unknown"),
      reason: event?.reason ? String(event.reason) : null,
      method: String(request?.method || "runtime"),
      pathname,
      businessId: event?.businessId ? String(event.businessId) : null,
    },
  });
}

const analyticsApi = createAnalyticsApi({ getEnvironmentValue });
const assistantApi = createAssistantApi({ getEnvironmentValue });
const adminAuditRuntime = createAdminAuditRuntime({ getEnvironmentValue });
const affiliateAdminRuntime = createAffiliateAdminRuntime({
  getEnvironmentValue,
});

const authApi = createAuthApi({
  getEnvironmentValue,
  audit: auditSecurityEvent,
});

platformOperations = createPlatformOperations({
  getEnvironmentValue,
  additionalReadinessChecks: () => [
    { name: "auth-security-state", ...authApi.readinessCheck() },
    { name: "analytics-runtime", ...analyticsApi.readinessCheck() },
    {
      name: "control-center-audit",
      ...adminAuditRuntime.readinessCheck(),
    },
    {
      name: "affiliate-admin",
      ...affiliateAdminRuntime.readinessCheck(),
    },
    {
      name: "destination-owner",
      status: destinationRuntimeReady ? "pass" : "fail",
      critical: false,
      detail: destinationRuntimeReady
        ? "destination-owner-ready"
        : "DESTINATION_OWNER_UNAVAILABLE",
    },
    {
      name: "payments-runtime",
      status: paymentsRuntimeReady ? "pass" : "fail",
      critical: true,
      detail: paymentsRuntimeReady
        ? "payments-runtime-ready"
        : "PAYMENTS_RUNTIME_UNAVAILABLE",
    },
    { name: "assistant-provider", ...assistantApi.readinessCheck() },
    {
      name: "ticketing-runtime",
      status: ticketingRuntimeReady ? "pass" : "fail",
      critical: true,
      detail: ticketingRuntimeReady
        ? "ticketing-runtime-ready"
        : "TICKETING_RUNTIME_UNAVAILABLE",
    },
    {
      name: "content-admin-runtime",
      ...(contentAdminRuntime?.readinessCheck() ?? {
        status: "fail",
        critical: false,
        detail: "CONTENT_ADMIN_NOT_STARTED",
      }),
    },
    {
      name: "place-platform-runtime",
      ...(placePlatformRuntime?.readinessCheck() ?? {
        status: "fail",
        critical: false,
        detail: "PLACE_PLATFORM_NOT_STARTED",
      }),
    },
  ],
});
await authApi.start();
await analyticsApi.start();
await adminAuditRuntime.start();
await affiliateAdminRuntime.start();

const destinationRuntime = createDestinationAdminRuntime({
  DESTINATIONS_DATABASE_URL: getEnvironmentValue("DESTINATIONS_DATABASE_URL"),
  DESTINATIONS_DATABASE_POOL_SIZE: getEnvironmentValue(
    "DESTINATIONS_DATABASE_POOL_SIZE",
  ),
});
await destinationRuntime.start();
destinationRuntimeReady = (await destinationRuntime.readiness()).ready;

const crmApi = createCrmApi({ authApi, getEnvironmentValue });
await crmApi.start();

const businessApi = createBusinessApi({ authApi });

const paymentsApi = createPaymentsApi({ authApi, getEnvironmentValue });
paymentsRuntimeReady = await paymentsApi.start();

const { createTicketingApi } = await import("./ticketing-api.mjs");
const ticketingApi = createTicketingApi({ authApi, getEnvironmentValue });
ticketingRuntimeReady = await ticketingApi.start();

contentAdminRuntime = createContentAdminRuntime({ getEnvironmentValue });
await contentAdminRuntime.start();

placePlatformRuntime = createPlacePlatformRuntime({
  authApi,
  getEnvironmentValue,
  platformOperations,
});
await placePlatformRuntime.start();

const adminApi = createAdminApi({
  authApi,
  platformOperations,
  getEnvironmentValue,
  auditStore: adminAuditRuntime,
  domainAdapters: createAdminDomainAdapters({
    authApi,
    businessApi,
    crmApi,
    ticketingApi,
    paymentsApi,
    affiliateAdminRuntime,
    contentRuntime: contentAdminRuntime,
    destinationRuntime,
    placePlatformRuntime,
  }),
});

function createRuntimeEnvironment() {
  return Object.freeze(
    Object.fromEntries(
      runtimeEnvironmentKeys.map((key) => [key, getEnvironmentValue(key)]),
    ),
  );
}

function isWithinStaticRoot(candidate, root) {
  return candidate === root || candidate.startsWith(`${root}${sep}`);
}

function isPublicStaticPath(candidate) {
  if (publicStaticRoots.some((root) => isWithinStaticRoot(candidate, root))) {
    return true;
  }

  const packagesPrefix = `${packagesRoot}${sep}`;
  if (!candidate.startsWith(packagesPrefix)) return false;
  const packageSegments = candidate.slice(packagesPrefix.length).split(sep);
  return Boolean(packageSegments[0] && packageSegments[1] === "dist");
}

function resolveRequestPath(pathname) {
  if (pathname === "/") return defaultDocument;

  const publicDocument = publicCrmDocuments.find(({ pattern }) =>
    pattern.test(pathname),
  );
  if (publicDocument) {
    return resolve(repositoryRoot, publicDocument.relativePath);
  }

  const decoded = decodeURIComponent(pathname);
  if (decoded.startsWith("/runtime/")) {
    const runtimePath = resolve(
      morroRuntimeRoot,
      decoded.slice("/runtime/".length),
    );
    if (!isWithinStaticRoot(runtimePath, morroRuntimeRoot)) {
      throw new Error("Requested runtime path is outside the runtime root.");
    }
    return runtimePath;
  }

  if (decoded.startsWith("/analytics/")) {
    const analyticsPath = resolve(
      morroAnalyticsRoot,
      decoded.slice("/analytics/".length),
    );
    if (!isWithinStaticRoot(analyticsPath, morroAnalyticsRoot)) {
      throw new Error(
        "Requested analytics path is outside the analytics root.",
      );
    }
    return analyticsPath;
  }

  const rootMountedPath =
    decoded.startsWith("/apps/") ||
    decoded.startsWith("/dashboard/") ||
    decoded.startsWith("/images/") ||
    decoded.startsWith("/packages/")
      ? null
      : resolve(morroPublicRoot, `.${decoded}`);
  if (rootMountedPath && isWithinStaticRoot(rootMountedPath, morroPublicRoot)) {
    return rootMountedPath;
  }

  const requestedPath = resolve(repositoryRoot, `.${decoded}`);
  const repositoryPrefix = `${repositoryRoot}${sep}`;

  if (!requestedPath.startsWith(repositoryPrefix)) {
    throw new Error("Requested path is outside the repository root.");
  }
  if (!isPublicStaticPath(requestedPath)) {
    throw new Error("Requested path is not a public static asset.");
  }

  return requestedPath;
}

function applySecurityHeaders(response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(self)",
  );
  response.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://unpkg.com https://api.mapbox.com https://sdk.mercadopago.com https://http2.mlstatic.com",
      "style-src 'self' 'unsafe-inline' https://unpkg.com https://api.mapbox.com https://cdnjs.cloudflare.com https://fonts.googleapis.com",
      "img-src 'self' data: blob: https://*.tile.openstreetmap.org https://unpkg.com https://api.mapbox.com https://*.tiles.mapbox.com",
      "connect-src 'self' https://api.mapbox.com https://*.tiles.mapbox.com https://api.mercadopago.com https://*.mercadopago.com https://*.mercadopago.com.br https://http2.mlstatic.com https://api.mercadolibre.com",
      "frame-src 'self' https://*.mercadopago.com https://*.mercadopago.com.br",
      "worker-src 'self' blob:",
      "font-src 'self' data: https://api.mapbox.com https://cdnjs.cloudflare.com https://fonts.gstatic.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
  );
}

function serveRuntimeConfig(response) {
  const serialized = JSON.stringify(createRuntimeEnvironment()).replaceAll(
    "<",
    "\\u003c",
  );
  response.statusCode = 200;
  response.setHeader("Content-Type", "text/javascript; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(
    `globalThis.__MORRO_RUNTIME_ENV__ = Object.freeze(${serialized});\n`,
  );
}

async function servePublicDestination(response) {
  const destination = await resolvePublicDestination(
    destinationRuntime,
    publicDestinationFallback,
  );
  response.statusCode = 200;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(
    JSON.stringify({
      destination,
      source:
        destination === publicDestinationFallback
          ? "static-fallback"
          : "destination-owner",
    }),
  );
}

function serveLiveness(response) {
  response.statusCode = 200;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(
    JSON.stringify({
      status: "live",
      service: platformOperations.service,
      release: platformOperations.release,
      checkedAt: new Date().toISOString(),
    }),
  );
}

function serveReadiness(response, correlationId) {
  const snapshot = platformOperations.healthSnapshot(correlationId);
  response.statusCode = snapshot.readiness === "ready" ? 200 : 503;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(snapshot));
}

async function fetchVisualCrossingWeather(apiKey) {
  const location = `${morroLatitude},${morroLongitude}`;
  const url = new URL(
    `https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/${location}`,
  );
  url.searchParams.set("unitGroup", "metric");
  url.searchParams.set("include", "current,days");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("contentType", "json");

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(weatherTimeoutMs),
  });
  if (!response.ok) {
    throw new Error(`Visual Crossing returned HTTP ${response.status}.`);
  }

  return mapVisualCrossingWeatherPayload(await response.json());
}

async function fetchOpenMeteoWeather() {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(morroLatitude));
  url.searchParams.set("longitude", String(morroLongitude));
  url.searchParams.set(
    "current",
    "temperature_2m,relative_humidity_2m,weather_code,is_day,wind_speed_10m",
  );
  url.searchParams.set("hourly", "relative_humidity_2m");
  url.searchParams.set(
    "daily",
    "temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code,wind_speed_10m_max",
  );
  url.searchParams.set("forecast_days", "7");
  url.searchParams.set("timezone", "America/Bahia");

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(weatherTimeoutMs),
  });
  if (!response.ok) {
    throw new Error(`Open-Meteo returned HTTP ${response.status}.`);
  }

  return mapOpenMeteoWeatherPayload(await response.json());
}

function safeProviderError(error) {
  return error instanceof Error ? error.message : String(error || "unknown");
}

async function fetchWeatherFromProviders(correlationId) {
  const visualCrossingKey = getEnvironmentValue(
    "VISUAL_CROSSING_API_KEY",
  ).trim();

  return fetchWeatherWithFallback({
    visualCrossingKey,
    fetchVisualCrossing: fetchVisualCrossingWeather,
    fetchOpenMeteo: fetchOpenMeteoWeather,
    onRecovered(provider) {
      platformOperations.providerRecovered(provider, correlationId);
    },
    onDegraded(provider, error) {
      platformOperations.providerDegraded(
        provider,
        safeProviderError(error),
        correlationId,
      );
    },
  });
}

function cacheAgeMs(now = Date.now()) {
  return weatherCache ? now - weatherCache.fetchedAt : Number.POSITIVE_INFINITY;
}

async function refreshWeatherCache(correlationId) {
  if (weatherRequestInFlight) return weatherRequestInFlight;

  weatherRequestInFlight = fetchWeatherFromProviders(correlationId)
    .then((weather) => {
      weatherCache = { weather, fetchedAt: Date.now() };
      return weather;
    })
    .finally(() => {
      weatherRequestInFlight = null;
    });

  return weatherRequestInFlight;
}

async function getMorroWeather(correlationId) {
  const age = cacheAgeMs();
  if (weatherCache && age <= weatherFreshTtlMs) {
    return { weather: weatherCache.weather, cacheState: "fresh" };
  }

  try {
    const weather = await refreshWeatherCache(correlationId);
    platformOperations.providerRecovered("weather-runtime", correlationId);
    return { weather, cacheState: "refreshed" };
  } catch (error) {
    const staleAge = cacheAgeMs();
    if (weatherCache && staleAge <= weatherStaleTtlMs) {
      platformOperations.providerDegraded(
        "weather-runtime",
        "serving-stale-cache",
        correlationId,
      );
      return { weather: weatherCache.weather, cacheState: "stale" };
    }
    platformOperations.providerDegraded(
      "weather-runtime",
      safeProviderError(error),
      correlationId,
    );
    throw error;
  }
}

async function serveWeather(response, correlationId) {
  try {
    const { weather, cacheState } = await getMorroWeather(correlationId);
    response.statusCode = 200;
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("X-Weather-Cache", cacheState);
    response.setHeader(
      "Cache-Control",
      "public, max-age=300, stale-while-revalidate=300",
    );
    response.end(JSON.stringify(weather));
  } catch {
    response.statusCode = 503;
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("Cache-Control", "no-store");
    response.end(JSON.stringify({ error: "weather_unavailable" }));
  }
}

function serviceDraining(response) {
  response.statusCode = 503;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Retry-After", "5");
  response.end(JSON.stringify({ error: "SERVICE_DRAINING" }));
}

const server = createServer(async (request, response) => {
  applySecurityHeaders(response);
  const correlationId = platformOperations.correlationIdFromRequest(request);
  request.morroCorrelationId = correlationId;
  platformOperations.bindResponse(response, correlationId);

  try {
    const requestUrl = new URL(request.url || "/", `http://${host}:${port}`);
    if (requestUrl.pathname === "/healthz") {
      serveLiveness(response);
      return;
    }
    if (requestUrl.pathname === "/readyz") {
      serveReadiness(response, correlationId);
      return;
    }
    if (!platformOperations.isAcceptingTraffic()) {
      serviceDraining(response);
      return;
    }
    if (requestUrl.pathname === "/runtime-config.js") {
      serveRuntimeConfig(response);
      return;
    }
    if (requestUrl.pathname === "/api/runtime/destination") {
      await servePublicDestination(response);
      return;
    }
    if (requestUrl.pathname === "/api/weather") {
      await serveWeather(response, correlationId);
      return;
    }
    if (analyticsApi.matches(requestUrl.pathname)) {
      await analyticsApi.handle(request, response, requestUrl);
      return;
    }
    if (authApi.matches(requestUrl.pathname)) {
      await authApi.handle(request, response, requestUrl.pathname);
      return;
    }
    if (requestUrl.pathname.startsWith("/api/places/v1/")) {
      const handled = await placePlatformRuntime.handlePublic(
        request,
        response,
        requestUrl,
      );
      if (handled) return;
    }
    if (adminApi.matches(requestUrl.pathname)) {
      await adminApi.handle(request, response, requestUrl);
      return;
    }
    if (crmApi.matches(requestUrl.pathname)) {
      await crmApi.handle(request, response, requestUrl);
      return;
    }
    if (businessApi.matches(requestUrl.pathname)) {
      await businessApi.handle(request, response, requestUrl.pathname);
      return;
    }
    if (paymentsApi.matches(requestUrl.pathname)) {
      if (requestUrl.pathname === mercadoPagoWebhookPath) {
        request.headers["x-morro-provider-data-id"] =
          requestUrl.searchParams.get("data.id") ?? "";
      }
      await paymentsApi.handle(request, response, requestUrl);
      return;
    }
    if (
      requestUrl.pathname.startsWith("/api/ticketing") &&
      ticketingApi.matches(requestUrl.pathname)
    ) {
      await ticketingApi.handle(request, response, requestUrl);
      return;
    }
    if (assistantApi.matches(requestUrl.pathname)) {
      await assistantApi.handle(request, response);
      return;
    }
    if (requestUrl.pathname.startsWith("/api/")) {
      response.statusCode = 404;
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.setHeader("Cache-Control", "no-store");
      response.end(JSON.stringify({ error: "NOT_FOUND" }));
      return;
    }

    const filePath = resolveRequestPath(requestUrl.pathname);
    const fileStat = await stat(filePath);

    if (!fileStat.isFile()) {
      throw new Error("Requested resource is not a file.");
    }

    response.statusCode = 200;
    response.setHeader(
      "Content-Type",
      contentTypes[extname(filePath)] || "application/octet-stream",
    );
    if (requestUrl.pathname === "/service-worker.js") {
      response.setHeader("Cache-Control", "no-cache");
    }
    if (extname(filePath) === ".js") {
      const source = await readFile(filePath, "utf8");
      response.end(rewriteWorkspaceModuleSpecifiers(source));
      return;
    }
    createReadStream(filePath).pipe(response);
  } catch (error) {
    if (String(request.url || "").startsWith("/api/")) {
      platformOperations.emit({
        kind: "alert",
        name: "platform.http.unhandled_failure",
        severity: "error",
        correlationId,
        attributes: {
          method: String(request.method || "GET"),
          pathname: String(request.url || "/").split("?", 1)[0],
          reason: safeProviderError(error),
        },
      });
      response.statusCode = 500;
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.setHeader("Cache-Control", "no-store");
      response.end(JSON.stringify({ error: "INTERNAL_SERVER_ERROR" }));
      return;
    }
    response.statusCode = 404;
    response.setHeader("Content-Type", "text/plain; charset=utf-8");
    response.end("Recurso não encontrado.");
  }
});

const openSockets = new Set();
server.on("connection", (socket) => {
  openSockets.add(socket);
  socket.once("close", () => openSockets.delete(socket));
});

let shuttingDown = false;

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function closeServerWithin(timeoutMs, correlationId) {
  return new Promise((resolveClose, rejectClose) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      platformOperations.emit({
        kind: "alert",
        name: "platform.shutdown.drain_timeout",
        severity: "critical",
        correlationId,
        attributes: { timeoutMs, openConnections: openSockets.size },
      });
      if (typeof server.closeAllConnections === "function") {
        server.closeAllConnections();
      } else {
        for (const socket of openSockets) socket.destroy();
      }
      rejectClose(new Error("PLATFORM_SHUTDOWN_DRAIN_TIMEOUT"));
    }, timeoutMs);

    server.close((error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) rejectClose(error);
      else resolveClose();
    });
  });
}

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  const correlationId = platformOperations.correlationIdFromRequest({
    headers: {},
  });
  platformOperations.beginShutdown(signal, correlationId);

  if (platformOperations.shutdownReadinessDelayMs > 0) {
    await delay(platformOperations.shutdownReadinessDelayMs);
  }

  platformOperations.emit({
    kind: "log",
    name: "platform.shutdown.drain_started",
    severity: "info",
    correlationId,
    attributes: { openConnections: openSockets.size },
  });

  let exitCode = 0;
  try {
    await closeServerWithin(
      platformOperations.shutdownDrainTimeoutMs,
      correlationId,
    );
  } catch (error) {
    exitCode = 1;
    platformOperations.emit({
      kind: "alert",
      name: "platform.shutdown.drain_failed",
      severity: "error",
      correlationId,
      attributes: { reason: safeProviderError(error) },
    });
  }

  const stops = await Promise.allSettled([
    analyticsApi.stop(),
    adminApi.stop(),
    adminAuditRuntime.stop(),
    authApi.stop(),
    crmApi.stop(),
    paymentsApi.stop(),
    affiliateAdminRuntime.stop(),
    ticketingApi.stop(),
    contentAdminRuntime ? contentAdminRuntime.stop() : Promise.resolve(),
    placePlatformRuntime ? placePlatformRuntime.stop() : Promise.resolve(),
    destinationRuntime.stop(),
  ]);
  paymentsRuntimeReady = false;
  ticketingRuntimeReady = false;
  const failedStops = stops.filter((result) => result.status === "rejected");
  if (failedStops.length > 0) {
    exitCode = 1;
    platformOperations.emit({
      kind: "alert",
      name: "platform.shutdown.runtime_stop_failed",
      severity: "error",
      correlationId,
      attributes: { failedRuntimes: failedStops.length },
    });
  }

  platformOperations.emit({
    kind: "log",
    name: "platform.shutdown.completed",
    severity: exitCode === 0 ? "info" : "error",
    correlationId,
    attributes: { exitCode },
  });
  platformOperations.setListening(false, correlationId);
  process.exitCode = exitCode;
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

server.listen(port, host, () => {
  const correlationId = platformOperations.correlationIdFromRequest({
    headers: {},
  });
  platformOperations.setListening(true, correlationId);
  console.log(`Morro Digital disponível em http://${host}:${port}`);
});
