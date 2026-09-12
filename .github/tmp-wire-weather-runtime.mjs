import { readFile, writeFile } from "node:fs/promises";

const serverPath = "apps/morro-digital-platform/tooling/dev-server.mjs";
const workflowPath = ".github/workflows/v1-home-parity-browser-regression.yml";

let server = await readFile(serverPath, "utf8");

const importAnchor = 'import { createPlatformOperations } from "./platform-operations.mjs";\n';
const providerImport = `import {\n  fetchWeatherWithFallback,\n  mapOpenMeteoWeatherPayload,\n  mapVisualCrossingWeatherPayload,\n} from "./weather-provider-mappers.mjs";\n`;
if (!server.includes(providerImport)) {
  if (!server.includes(importAnchor)) throw new Error("dev-server import anchor not found");
  server = server.replace(importAnchor, importAnchor + providerImport);
}

const providerBlockStart = server.indexOf("function conditionToWeatherCode(condition) {");
const providerBlockEnd = server.indexOf("function safeProviderError(error) {");
if (providerBlockStart < 0 || providerBlockEnd < 0 || providerBlockEnd <= providerBlockStart) {
  throw new Error("weather provider mapping block not found");
}

const providerFunctions = `async function fetchVisualCrossingWeather(apiKey) {\n  const location = \`${"${morroLatitude},${morroLongitude}"}\`;\n  const url = new URL(\n    \`https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/${"${location}"}\`,\n  );\n  url.searchParams.set("unitGroup", "metric");\n  url.searchParams.set("include", "current,days");\n  url.searchParams.set("key", apiKey);\n  url.searchParams.set("contentType", "json");\n\n  const response = await fetch(url, {\n    headers: { Accept: "application/json" },\n    signal: AbortSignal.timeout(weatherTimeoutMs),\n  });\n  if (!response.ok) {\n    throw new Error(\`Visual Crossing returned HTTP ${"${response.status}"}.\`);\n  }\n\n  return mapVisualCrossingWeatherPayload(await response.json());\n}\n\nasync function fetchOpenMeteoWeather() {\n  const url = new URL("https://api.open-meteo.com/v1/forecast");\n  url.searchParams.set("latitude", String(morroLatitude));\n  url.searchParams.set("longitude", String(morroLongitude));\n  url.searchParams.set(\n    "current",\n    "temperature_2m,relative_humidity_2m,weather_code,is_day,wind_speed_10m",\n  );\n  url.searchParams.set(\n    "daily",\n    "temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code,relative_humidity_2m_max,wind_speed_10m_max",\n  );\n  url.searchParams.set("timezone", "America/Bahia");\n\n  const response = await fetch(url, {\n    headers: { Accept: "application/json" },\n    signal: AbortSignal.timeout(weatherTimeoutMs),\n  });\n  if (!response.ok) {\n    throw new Error(\`Open-Meteo returned HTTP ${"${response.status}"}.\`);\n  }\n\n  return mapOpenMeteoWeatherPayload(await response.json());\n}\n\n`;
server =
  server.slice(0, providerBlockStart) +
  providerFunctions +
  server.slice(providerBlockEnd);

const fallbackStart = server.indexOf("async function fetchWeatherFromProviders(correlationId) {");
const fallbackEnd = server.indexOf("function cacheAgeMs(", fallbackStart);
if (fallbackStart < 0 || fallbackEnd < 0 || fallbackEnd <= fallbackStart) {
  throw new Error("weather provider fallback block not found");
}

const fallbackFunction = `async function fetchWeatherFromProviders(correlationId) {\n  const visualCrossingKey = getEnvironmentValue(\n    "VISUAL_CROSSING_API_KEY",\n  ).trim();\n\n  return fetchWeatherWithFallback({\n    visualCrossingKey,\n    fetchVisualCrossing: fetchVisualCrossingWeather,\n    fetchOpenMeteo: fetchOpenMeteoWeather,\n    onRecovered(provider) {\n      platformOperations.providerRecovered(provider, correlationId);\n    },\n    onDegraded(provider, error) {\n      platformOperations.providerDegraded(\n        provider,\n        safeProviderError(error),\n        correlationId,\n      );\n    },\n  });\n}\n\n`;
server =
  server.slice(0, fallbackStart) +
  fallbackFunction +
  server.slice(fallbackEnd);

await writeFile(serverPath, server);

let workflow = await readFile(workflowPath, "utf8");
const triggerAnchor = "      - apps/morro-digital-platform/tooling/dev-server.mjs\n";
const helperTriggers =
  "      - apps/morro-digital-platform/tooling/weather-provider-mappers.mjs\n" +
  "      - apps/morro-digital-platform/tooling/weather-provider-mappers.test.mjs\n";
if (!workflow.includes(helperTriggers)) {
  if (!workflow.includes(triggerAnchor)) throw new Error("workflow trigger anchor not found");
  workflow = workflow.replace(triggerAnchor, triggerAnchor + helperTriggers);
}
await writeFile(workflowPath, workflow);
