import fs from "node:fs";

const envExample = fs.readFileSync(
  new URL("../../.env.example", import.meta.url),
  "utf8",
);
const lines = envExample.split(/\r?\n/u);
const values = new Map();
for (const line of lines) {
  if (!line || line.startsWith("#")) continue;
  const match = /^(?<key>[A-Z0-9_]+)=(?<value>.*)$/u.exec(line);
  if (!match) continue;
  if (values.has(match.groups.key))
    throw new Error(`Duplicate environment key: ${match.groups.key}`);
  values.set(match.groups.key, match.groups.value);
}

const required = [
  "PLATFORM_SHUTDOWN_READINESS_DELAY_MS",
  "PLATFORM_SHUTDOWN_DRAIN_TIMEOUT_MS",
  "DASHBOARD_AUTH_SECRET",
  "DASHBOARD_AUTH_ORIGIN",
  "DASHBOARD_USERS_JSON",
  "AUTH_DATABASE_URL",
  "DASHBOARD_ADMIN_GLOBAL_BYPASS_CONFIRMED",
  "ORDERING_DATABASE_URL",
  "FINANCIAL_DATABASE_URL",
  "ORDERING_PRICING_CATALOG_JSON",
  "PAYMENTS_DESTINATION_ID",
  "PAYMENTS_RETURN_URL_ORIGINS",
  "PAYMENTS_STATUS_TOKEN_SECRET",
  "PAYMENTS_HANDOFF_SECRET",
  "PAYMENTS_PROVIDER_MODE",
  "PAYMENTS_WEBHOOK_URL",
  "PAYMENTS_WEBHOOK_TOLERANCE_SECONDS",
  "PAYMENTS_PROVIDER_TIMEOUT_MS",
  "PAYMENTS_PROVIDER_MAX_ATTEMPTS",
  "PAYMENTS_PROVIDER_RETRY_BASE_MS",
  "PAYMENTS_RUNTIME_REPLICA_COUNT",
  "PAYMENTS_RATE_LIMIT_DISTRIBUTED_STORE_CONFIGURED",
  "V1_PAYMENT_PROVIDER_API_URL",
  "MERCADO_PAGO_ACCESS_TOKEN",
  "MERCADO_PAGO_WEBHOOK_SECRET",
  "MERCADO_PAGO_CHECKOUT_ORIGINS",
  "MERCADO_PAGO_CHECKOUT_MODE",
  "AFFILIATES_DATABASE_URL",
  "AFFILIATES_DATABASE_POOL_SIZE",
];
const missing = required.filter((key) => !values.has(key));
if (missing.length > 0)
  throw new Error(`Environment inventory missing: ${missing.join(", ")}`);

const replicas = Number(values.get("PAYMENTS_RUNTIME_REPLICA_COUNT"));
const distributed =
  values.get("PAYMENTS_RATE_LIMIT_DISTRIBUTED_STORE_CONFIGURED") === "true";
if (!Number.isSafeInteger(replicas) || replicas < 1)
  throw new Error("PAYMENTS_RUNTIME_REPLICA_COUNT must be a positive integer");
if (replicas > 1 && !distributed)
  throw new Error(
    "Multi-replica Payments requires a distributed rate-limit store",
  );

const checkoutMode = values.get("MERCADO_PAGO_CHECKOUT_MODE");
if (checkoutMode !== "test" && checkoutMode !== "production") {
  throw new Error("MERCADO_PAGO_CHECKOUT_MODE must be test or production");
}

const readinessDelay = Number(values.get("PLATFORM_SHUTDOWN_READINESS_DELAY_MS"));
const drainTimeout = Number(values.get("PLATFORM_SHUTDOWN_DRAIN_TIMEOUT_MS"));
if (!Number.isSafeInteger(readinessDelay) || readinessDelay < 0)
  throw new Error("PLATFORM_SHUTDOWN_READINESS_DELAY_MS must be non-negative");
if (!Number.isSafeInteger(drainTimeout) || drainTimeout < 1000)
  throw new Error("PLATFORM_SHUTDOWN_DRAIN_TIMEOUT_MS must be >= 1000");

console.log(
  `Environment inventory valid: ${values.size} keys; Payments replicas=${replicas}; distributedRateLimit=${distributed}; MercadoPagoMode=${checkoutMode}`,
);
