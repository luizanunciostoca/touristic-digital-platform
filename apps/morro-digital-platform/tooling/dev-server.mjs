import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createAssistantApi } from "./assistant-api.mjs";
import { createAuthApi } from "./auth-api.mjs";
import { createBusinessApi } from "./business-api.mjs";
import { createCrmApi } from "./crm-api.mjs";

const repositoryRoot = resolve(
  fileURLToPath(new URL("../../../", import.meta.url)),
);
const defaultDocument = resolve(
  repositoryRoot,
  "apps/morro-digital-platform/public/index.html",
);
const envFile = resolve(repositoryRoot, ".env");
const host = process.env.HOST?.trim() || "127.0.0.1";
const port = Number(process.env.PORT || "4173");
const morroLatitude = -13.3769;
const morroLongitude = -38.9146;
const weatherTimeoutMs = 8_000;
const weatherFreshTtlMs = 5 * 60 * 1000;
const weatherStaleTtlMs = 30 * 60 * 1000;
const runtimeEnvironmentKeys = Object.freeze([
  "VITE_MAPBOX_ACCESS_TOKEN",
  "VITE_MAPBOX_STYLE",
  "VITE_MAPBOX_CONTAINER_ID",
  "VITE_MAPBOX_INITIAL_ZOOM",
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

function auditSecurityEvent(request, event) {
  const pathname = (() => {
    try {
      return new URL(request.url || "/", `http://${host}:${port}`).pathname;
    } catch {
      return "/";
    }
  })();
  const record = {
    action: String(event?.action || "security.unknown"),
    result: String(event?.result || "unknown"),
    reason: event?.reason ? String(event.reason) : undefined,
    method: String(request.method || "GET"),
    pathname,
  };
  console.warn(`[security-audit] ${JSON.stringify(record)}`);
}

const assistantApi = createAssistantApi({
  getEnvironmentValue: (key) => process.env[key] ?? localEnvironment[key] ?? "",
});

const authApi = createAuthApi({
  getEnvironmentValue: (key) => process.env[key] ?? localEnvironment[key] ?? "",
  audit: auditSecurityEvent,
});

const crmApi = createCrmApi({
  authApi,
  getEnvironmentValue: (key) => process.env[key] ?? localEnvironment[key] ?? "",
});
await crmApi.start();

const businessApi = createBusinessApi({ authApi });

function createRuntimeEnvironment() {
  return Object.freeze(
    Object.fromEntries(
      runtimeEnvironmentKeys.map((key) => [
        key,
        process.env[key] ?? localEnvironment[key] ?? "",
      ]),
    ),
  );
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
  const requestedPath = resolve(repositoryRoot, `.${decoded}`);
  const repositoryPrefix = `${repositoryRoot}${sep}`;

  if (!requestedPath.startsWith(repositoryPrefix)) {
    throw new Error("Requested path is outside the repository root.");
  }

  return requestedPath;
}

function applySecurityHeaders(response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  response.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://unpkg.com https://api.mapbox.com",
      "style-src 'self' 'unsafe-inline' https://unpkg.com https://api.mapbox.com https://cdnjs.cloudflare.com https://fonts.googleapis.com",
      "img-src 'self' data: blob: https://*.tile.openstreetmap.org https://unpkg.com https://api.mapbox.com https://*.tiles.mapbox.com",
      "connect-src 'self' https://api.mapbox.com https://*.tiles.mapbox.com",
      "worker-src blob:",
      "font-src 'self' data: https://api.mapbox.com https://cdnjs.cloudflare.com https://fonts.gstatic.com",
      "object-src 'none'",
      "base-uri 'self'",
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

function conditionToWeatherCode(condition) {
  const value = String(condition || "").toLowerCase();
  if (value.includes("thunder")) return 95;
  if (value.includes("snow") || value.includes("sleet")) return 71;
  if (value.includes("rain") || value.includes("drizzle")) return 61;
  if (value.includes("fog") || value.includes("mist")) return 45;
  if (value.includes("overcast")) return 3;
  if (value.includes("cloud") || value.includes("partially")) return 2;
  return 0;
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

  const payload = await response.json();
  const current = payload?.currentConditions;
  const today = payload?.days?.[0];
  const temperatureCelsius = current?.temp;
  if (typeof temperatureCelsius !== "number") {
    throw new Error("Visual Crossing returned incomplete current conditions.");
  }

  const icon = String(current?.icon || "");
  if (
    typeof today?.tempmax !== "number" ||
    typeof today?.tempmin !== "number" ||
    typeof current?.humidity !== "number" ||
    typeof current?.windspeed !== "number" ||
    typeof today?.precipprob !== "number"
  ) {
    throw new Error("Visual Crossing returned incomplete weather details.");
  }

  return {
    temperatureCelsius,
    temperatureMaxCelsius: today.tempmax,
    temperatureMinCelsius: today.tempmin,
    humidityPercent: current.humidity,
    windSpeedKph: current.windspeed,
    rainChancePercent: today.precipprob,
    weatherCode: conditionToWeatherCode(current?.conditions || icon),
    isDay: !icon.includes("night"),
    provider: "visual-crossing",
  };
}

async function fetchOpenMeteoWeather() {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(morroLatitude));
  url.searchParams.set("longitude", String(morroLongitude));
  url.searchParams.set(
    "current",
    "temperature_2m,relative_humidity_2m,weather_code,is_day,wind_speed_10m",
  );
  url.searchParams.set(
    "daily",
    "temperature_2m_max,temperature_2m_min,precipitation_probability_max",
  );
  url.searchParams.set("timezone", "America/Bahia");

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(weatherTimeoutMs),
  });
  if (!response.ok) {
    throw new Error(`Open-Meteo returned HTTP ${response.status}.`);
  }

  const payload = await response.json();
  const current = payload?.current;
  const daily = payload?.daily;
  if (
    typeof current?.temperature_2m !== "number" ||
    typeof current?.relative_humidity_2m !== "number" ||
    typeof current?.wind_speed_10m !== "number" ||
    typeof daily?.temperature_2m_max?.[0] !== "number" ||
    typeof daily?.temperature_2m_min?.[0] !== "number" ||
    typeof daily?.precipitation_probability_max?.[0] !== "number" ||
    typeof current?.weather_code !== "number" ||
    (current?.is_day !== 0 && current?.is_day !== 1)
  ) {
    throw new Error("Open-Meteo returned incomplete current conditions.");
  }

  return {
    temperatureCelsius: current.temperature_2m,
    temperatureMaxCelsius: daily.temperature_2m_max[0],
    temperatureMinCelsius: daily.temperature_2m_min[0],
    humidityPercent: current.relative_humidity_2m,
    windSpeedKph: current.wind_speed_10m,
    rainChancePercent: daily.precipitation_probability_max[0],
    weatherCode: current.weather_code,
    isDay: current.is_day === 1,
    provider: "open-meteo",
  };
}

async function fetchWeatherFromProviders() {
  const visualCrossingKey = process.env.VISUAL_CROSSING_API_KEY?.trim();
  if (visualCrossingKey) {
    try {
      return await fetchVisualCrossingWeather(visualCrossingKey);
    } catch (error) {
      console.warn(
        "Visual Crossing weather request failed; using Open-Meteo fallback.",
        error instanceof Error ? error.message : error,
      );
    }
  }
  return fetchOpenMeteoWeather();
}

function cacheAgeMs(now = Date.now()) {
  return weatherCache ? now - weatherCache.fetchedAt : Number.POSITIVE_INFINITY;
}

async function refreshWeatherCache() {
  if (weatherRequestInFlight) return weatherRequestInFlight;

  weatherRequestInFlight = fetchWeatherFromProviders()
    .then((weather) => {
      weatherCache = { weather, fetchedAt: Date.now() };
      return weather;
    })
    .finally(() => {
      weatherRequestInFlight = null;
    });

  return weatherRequestInFlight;
}

async function getMorroWeather() {
  const age = cacheAgeMs();
  if (weatherCache && age <= weatherFreshTtlMs) {
    return { weather: weatherCache.weather, cacheState: "fresh" };
  }

  try {
    const weather = await refreshWeatherCache();
    return { weather, cacheState: "refreshed" };
  } catch (error) {
    const staleAge = cacheAgeMs();
    if (weatherCache && staleAge <= weatherStaleTtlMs) {
      console.warn(
        "Weather providers unavailable; serving stale cached conditions.",
        error instanceof Error ? error.message : error,
      );
      return { weather: weatherCache.weather, cacheState: "stale" };
    }
    throw error;
  }
}

async function serveWeather(response) {
  try {
    const { weather, cacheState } = await getMorroWeather();
    response.statusCode = 200;
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("X-Weather-Cache", cacheState);
    response.setHeader(
      "Cache-Control",
      "public, max-age=300, stale-while-revalidate=300",
    );
    response.end(JSON.stringify(weather));
  } catch (error) {
    console.error(
      "Weather runtime unavailable.",
      error instanceof Error ? error.message : error,
    );
    response.statusCode = 503;
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("Cache-Control", "no-store");
    response.end(JSON.stringify({ error: "weather_unavailable" }));
  }
}

const server = createServer(async (request, response) => {
  applySecurityHeaders(response);

  try {
    const requestUrl = new URL(request.url || "/", `http://${host}:${port}`);
    if (requestUrl.pathname === "/runtime-config.js") {
      serveRuntimeConfig(response);
      return;
    }
    if (requestUrl.pathname === "/api/weather") {
      await serveWeather(response);
      return;
    }
    if (authApi.matches(requestUrl.pathname)) {
      await authApi.handle(request, response, requestUrl.pathname);
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
    if (assistantApi.matches(requestUrl.pathname)) {
      await assistantApi.handle(request, response);
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
    createReadStream(filePath).pipe(response);
  } catch (error) {
    if (String(request.url || "").startsWith("/api/")) {
      console.error(
        "API runtime failure.",
        error instanceof Error ? error.stack || error.message : error,
      );
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

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Encerrando Morro Digital após ${signal}.`);
  server.close(() => {
    void crmApi
      .stop()
      .then(() => process.exit(0))
      .catch((error) => {
        console.error(
          "Falha ao encerrar o runtime CRM.",
          error instanceof Error ? error.stack || error.message : error,
        );
        process.exit(1);
      });
  });
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

server.listen(port, host, () => {
  console.log(`Morro Digital disponível em http://${host}:${port}`);
});