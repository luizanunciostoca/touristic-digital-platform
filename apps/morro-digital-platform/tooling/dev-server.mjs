import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(
  fileURLToPath(new URL("../../../", import.meta.url)),
);
const defaultDocument = resolve(
  repositoryRoot,
  "apps/morro-digital-platform/public/index.html",
);
const host = process.env.HOST?.trim() || "127.0.0.1";
const port = Number(process.env.PORT || "4173");
const morroLatitude = -13.3769;
const morroLongitude = -38.9146;
const weatherTimeoutMs = 8_000;
const weatherFreshTtlMs = 5 * 60 * 1000;
const weatherStaleTtlMs = 30 * 60 * 1000;

let weatherCache = null;
let weatherRequestInFlight = null;

const contentTypes = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
});

function resolveRequestPath(pathname) {
  if (pathname === "/") return defaultDocument;

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
      "script-src 'self' 'unsafe-inline' https://unpkg.com",
      "style-src 'self' 'unsafe-inline' https://unpkg.com https://cdnjs.cloudflare.com https://fonts.googleapis.com",
      "img-src 'self' data: https://*.tile.openstreetmap.org https://unpkg.com",
      "connect-src 'self'",
      "font-src 'self' data: https://cdnjs.cloudflare.com https://fonts.gstatic.com",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
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
  url.searchParams.set("include", "current");
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
  const temperatureCelsius = current?.temp;
  if (typeof temperatureCelsius !== "number") {
    throw new Error("Visual Crossing returned incomplete current conditions.");
  }

  const icon = String(current?.icon || "");
  return {
    temperatureCelsius,
    weatherCode: conditionToWeatherCode(current?.conditions || icon),
    isDay: !icon.includes("night"),
    provider: "visual-crossing",
  };
}

async function fetchOpenMeteoWeather() {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(morroLatitude));
  url.searchParams.set("longitude", String(morroLongitude));
  url.searchParams.set("current", "temperature_2m,weather_code,is_day");
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
  if (
    typeof current?.temperature_2m !== "number" ||
    typeof current?.weather_code !== "number" ||
    (current?.is_day !== 0 && current?.is_day !== 1)
  ) {
    throw new Error("Open-Meteo returned incomplete current conditions.");
  }

  return {
    temperatureCelsius: current.temperature_2m,
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
    if (requestUrl.pathname === "/api/weather") {
      await serveWeather(response);
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
  } catch {
    response.statusCode = 404;
    response.setHeader("Content-Type", "text/plain; charset=utf-8");
    response.end("Recurso não encontrado.");
  }
});

server.listen(port, host, () => {
  console.log(`Morro Digital disponível em http://${host}:${port}`);
});
