import fs from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const productionDatabaseDomains = Object.freeze([
  Object.freeze({
    key: "AUTH_DATABASE_URL",
    prefix: "AUTH",
    schema: "morro_auth",
  }),
  Object.freeze({
    key: "CONTROL_CENTER_AUDIT_DATABASE_URL",
    prefix: "AUDIT",
    schema: "morro_audit",
  }),
  Object.freeze({
    key: "DESTINATIONS_DATABASE_URL",
    prefix: "DESTINATIONS",
    schema: "morro_destinations",
  }),
  Object.freeze({
    key: "CONTENT_DATABASE_URL",
    prefix: "CONTENT",
    schema: "morro_content",
  }),
  Object.freeze({
    key: "BUSINESS_DATABASE_URL",
    prefix: "BUSINESS",
    schema: "morro_business",
  }),
  Object.freeze({
    key: "ORDERING_DATABASE_URL",
    prefix: "ORDERING",
    schema: "morro_ordering",
  }),
  Object.freeze({
    key: "FINANCIAL_DATABASE_URL",
    prefix: "FINANCIAL",
    schema: "morro_financial",
  }),
  Object.freeze({
    key: "TICKETING_DATABASE_URL",
    prefix: "TICKETING",
    schema: "morro_ticketing",
  }),
  Object.freeze({
    key: "NOTIFICATIONS_DATABASE_URL",
    prefix: "NOTIFICATIONS",
    schema: "morro_notifications",
  }),
  Object.freeze({
    key: "AFFILIATES_DATABASE_URL",
    prefix: "AFFILIATES",
    schema: "morro_affiliates",
  }),
  Object.freeze({
    key: "ANALYTICS_DATABASE_URL",
    prefix: "ANALYTICS",
    schema: "morro_analytics",
  }),
  Object.freeze({
    key: "CRM_DATABASE_URL",
    prefix: "CRM",
    schema: "morro_crm",
  }),
  Object.freeze({
    key: "COMMERCE_DATABASE_URL",
    prefix: "COMMERCE",
    schema: "morro_commerce",
  }),
]);

const SHA = /^[0-9a-f]{40}$/u;

export function normalizeRenderEnvVars(payload) {
  if (!Array.isArray(payload)) {
    throw new Error("RENDER_ENV_RESPONSE_INVALID");
  }

  const entries = [];
  const seen = new Set();
  for (const item of payload) {
    const envVar = item?.envVar ?? item;
    const key = typeof envVar?.key === "string" ? envVar.key.trim() : "";
    if (!key) throw new Error("RENDER_ENV_KEY_INVALID");
    if (seen.has(key)) throw new Error(`RENDER_ENV_DUPLICATE_KEY:${key}`);
    if (typeof envVar.value !== "string") {
      throw new Error(`RENDER_ENV_VALUE_UNAVAILABLE:${key}`);
    }
    seen.add(key);
    entries.push(Object.freeze({ key, value: envVar.value }));
  }
  return Object.freeze(entries);
}

function asMap(entries) {
  return new Map(entries.map(({ key, value }) => [key, value]));
}

function required(map, key) {
  const value = String(map.get(key) ?? "");
  if (!value) throw new Error(`PRODUCTION_MYSQL_ENV_REQUIRED:${key}`);
  return value;
}

export function databaseUrl({ host, port, user, password, database }) {
  if (!host || !/^\d{1,5}$/u.test(String(port))) {
    throw new Error("PRODUCTION_MYSQL_ENDPOINT_INVALID");
  }
  if (!/^[A-Za-z0-9_]+$/u.test(user) || !/^[A-Za-z0-9_]+$/u.test(database)) {
    throw new Error("PRODUCTION_MYSQL_IDENTIFIER_INVALID");
  }
  const url = new URL("mysql://placeholder.invalid/");
  url.hostname = host;
  url.port = String(port);
  url.username = user;
  url.password = password;
  url.pathname = `/${database}`;
  return url.toString();
}

export function buildCutoverEnvironment({
  mysqlEnvironment,
  webEnvironment,
  host = "morro-digital-v2-production-mysql",
  port = "3306",
  expectedSha,
  previousDeployId,
  previousReleaseSha,
}) {
  if (!SHA.test(expectedSha ?? "")) throw new Error("EXPECTED_SHA_INVALID");
  if (!/^dep-[A-Za-z0-9_-]+$/u.test(previousDeployId ?? "")) {
    throw new Error("PREVIOUS_DEPLOY_ID_INVALID");
  }
  if (!SHA.test(previousReleaseSha ?? "")) {
    throw new Error("PREVIOUS_RELEASE_SHA_INVALID");
  }

  const mysql = normalizeRenderEnvVars(mysqlEnvironment);
  const web = normalizeRenderEnvVars(webEnvironment);
  const mysqlMap = asMap(mysql);
  const webMap = asMap(web);

  if (webMap.get("MORRO_DATABASE_TOPOLOGY") === "render-private-domain-users") {
    throw new Error("PRODUCTION_MYSQL_CUTOVER_ALREADY_APPLIED");
  }

  const generated = [];
  const previous = [];
  for (const domain of productionDatabaseDomains) {
    const database = required(mysqlMap, `${domain.prefix}_DATABASE_NAME`);
    const user = required(mysqlMap, `${domain.prefix}_DATABASE_USER`);
    const password = required(mysqlMap, `${domain.prefix}_DATABASE_PASSWORD`);
    if (database !== domain.schema) {
      throw new Error(`PRODUCTION_MYSQL_SCHEMA_MISMATCH:${domain.prefix}`);
    }
    if (user !== domain.schema) {
      throw new Error(`PRODUCTION_MYSQL_OWNER_MISMATCH:${domain.prefix}`);
    }

    generated.push(
      Object.freeze({
        key: domain.key,
        value: databaseUrl({ host, port, user, password, database }),
      }),
    );
    previous.push(
      Object.freeze({
        key: domain.key,
        present: webMap.has(domain.key),
        value: webMap.get(domain.key) ?? "",
      }),
    );
  }

  const rollbackSnapshot = Buffer.from(
    JSON.stringify({ version: 1, variables: previous }),
    "utf8",
  ).toString("base64");

  const replacements = new Map(generated.map(({ key, value }) => [key, value]));
  replacements.set("MORRO_DATABASE_TOPOLOGY", "render-private-domain-users");
  replacements.set("MORRO_DATABASE_CUTOVER_SHA", expectedSha);
  replacements.set("MORRO_DATABASE_ROLLBACK_DEPLOY_ID", previousDeployId);
  replacements.set("MORRO_DATABASE_ROLLBACK_RELEASE_SHA", previousReleaseSha);
  replacements.set("MORRO_DATABASE_ROLLBACK_URLS_B64", rollbackSnapshot);

  const next = [];
  const replacedKeys = new Set(replacements.keys());
  for (const entry of web) {
    if (!replacedKeys.has(entry.key)) next.push(entry);
  }
  for (const [key, value] of replacements) {
    next.push(Object.freeze({ key, value }));
  }

  return Object.freeze({
    original: web,
    next: Object.freeze(next),
    generated: Object.freeze(generated),
    rollbackSnapshot,
  });
}

function mask(value) {
  if (process.env.GITHUB_ACTIONS === "true" && value) {
    process.stdout.write(`::add-mask::${value}\n`);
  }
}

function writeSensitiveJson(path, value) {
  fs.writeFileSync(path, JSON.stringify(value));
  fs.chmodSync(path, 0o600);
}

async function main() {
  const [mysqlInput, webInput, originalOutput, cutoverOutput] =
    process.argv.slice(2);
  if (!mysqlInput || !webInput || !originalOutput || !cutoverOutput) {
    throw new Error("CUTOVER_ENV_USAGE_INVALID");
  }

  const mysqlEnvironment = JSON.parse(fs.readFileSync(mysqlInput, "utf8"));
  const webEnvironment = JSON.parse(fs.readFileSync(webInput, "utf8"));
  const result = buildCutoverEnvironment({
    mysqlEnvironment,
    webEnvironment,
    host:
      String(process.env.PRODUCTION_MYSQL_PRIVATE_HOST ?? "").trim() ||
      "morro-digital-v2-production-mysql",
    port:
      String(process.env.PRODUCTION_MYSQL_PRIVATE_PORT ?? "").trim() || "3306",
    expectedSha: process.env.EXPECTED_SHA,
    previousDeployId: process.env.PREVIOUS_DEPLOY_ID,
    previousReleaseSha: process.env.PREVIOUS_RELEASE_SHA,
  });

  for (const entry of result.generated) mask(entry.value);
  mask(result.rollbackSnapshot);

  writeSensitiveJson(originalOutput, result.original);
  writeSensitiveJson(cutoverOutput, result.next);

  console.log(
    JSON.stringify({
      contract: "MORRO-PRODUCTION-MYSQL-CUTOVER-ENV",
      status: "pass",
      domains: productionDatabaseDomains.length,
      originalEnvironmentVariables: result.original.length,
      cutoverEnvironmentVariables: result.next.length,
      rollbackSnapshotStored: true,
    }),
  );
}

const invokedDirectly =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  main().catch((error) => {
    const message =
      error instanceof Error
        ? error.message
        : "PRODUCTION_MYSQL_CUTOVER_ENV_FAILED";
    console.error(`MORRO_PRODUCTION_MYSQL_CUTOVER_ENV_FAILED:${message}`);
    process.exitCode = 1;
  });
}
