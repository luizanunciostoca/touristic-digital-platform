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
  "ORDERING_DATABASE_URL",
  "FINANCIAL_DATABASE_URL",
  "PAYMENTS_DESTINATION_ID",
  "PAYMENTS_RETURN_URL_ORIGINS",
  "PAYMENTS_PROVIDER_MODE",
  "PAYMENTS_RUNTIME_REPLICA_COUNT",
  "PAYMENTS_RATE_LIMIT_DISTRIBUTED_STORE_CONFIGURED",
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

console.log(
  `Environment inventory valid: ${values.size} keys; Payments replicas=${replicas}; distributedRateLimit=${distributed}`,
);
