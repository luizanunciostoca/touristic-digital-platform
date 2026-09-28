import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import {
  canonicalDatabaseDomains,
} from "./canonical-database-topology.mjs";
import {
  createDatabaseEnvironmentResolver,
} from "../../apps/morro-digital-platform/tooling/database-environment.mjs";

function required(environment, key) {
  const value = String(environment[key] ?? "").trim();
  if (!value) throw new Error(`${key}_REQUIRED`);
  return value;
}

function decode(value, code) {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new Error(code);
  }
}

function mysqlTarget(value, domain) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${domain}_DATABASE_URL_INVALID`);
  }
  if (url.protocol !== "mysql:" || url.search || url.hash) {
    throw new Error(`${domain}_DATABASE_URL_INVALID`);
  }
  const host = url.hostname.trim().toLowerCase();
  const port = Number(url.port || 3306);
  const user = decode(url.username, `${domain}_DATABASE_USER_INVALID`);
  const password = decode(url.password, `${domain}_DATABASE_PASSWORD_INVALID`);
  const database = decode(
    url.pathname.replace(/^\//u, ""),
    `${domain}_DATABASE_NAME_INVALID`,
  );
  if (
    !host ||
    !Number.isSafeInteger(port) ||
    port < 1 ||
    port > 65535 ||
    !user ||
    !password ||
    !/^[A-Za-z0-9_]+$/u.test(database)
  ) {
    throw new Error(`${domain}_DATABASE_URL_INVALID`);
  }
  return Object.freeze({ host, port, user, password, database });
}

function adminTarget(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("MYSQL_ADMIN_DATABASE_URL_INVALID");
  }
  if (url.protocol !== "mysql:" || url.search || url.hash) {
    throw new Error("MYSQL_ADMIN_DATABASE_URL_INVALID");
  }
  const host = url.hostname.trim().toLowerCase();
  const port = Number(url.port || 3306);
  const user = decode(url.username, "MYSQL_ADMIN_DATABASE_URL_INVALID");
  const password = decode(url.password, "MYSQL_ADMIN_DATABASE_URL_INVALID");
  const database = decode(url.pathname.replace(/^\//u, ""), "MYSQL_ADMIN_DATABASE_URL_INVALID") || "mysql";
  if (
    !host ||
    !Number.isSafeInteger(port) ||
    port < 1 ||
    port > 65535 ||
    !user ||
    !password ||
    !/^[A-Za-z0-9_]+$/u.test(database)
  ) {
    throw new Error("MYSQL_ADMIN_DATABASE_URL_INVALID");
  }
  return Object.freeze({ host, port, user, password, database });
}

export function resolveCanonicalDatabaseTargets(environment = process.env) {
  const resolveEnvironment = createDatabaseEnvironmentResolver({
    processEnvironment: environment,
  });
  const targets = canonicalDatabaseDomains.map((domain) => {
    const value = resolveEnvironment(domain.environmentKey);
    if (!value) throw new Error(`${domain.environmentKey}_REQUIRED`);
    const target = mysqlTarget(value, domain.domain);
    if (target.database !== domain.schema) {
      throw new Error(`${domain.domain}_DATABASE_SCHEMA_DRIFT`);
    }
    return Object.freeze({ ...domain, ...target });
  });

  const endpoint = new Set(
    targets.map(({ host, port }) => `${host}:${port}`),
  );
  if (endpoint.size !== 1) {
    throw new Error("MYSQL_CANONICAL_DOMAINS_HOST_DRIFT");
  }

  const passwordsByUser = new Map();
  for (const target of targets) {
    const previous = passwordsByUser.get(target.user);
    if (previous !== undefined && previous !== target.password) {
      throw new Error("MYSQL_SHARED_USER_PASSWORD_DRIFT");
    }
    passwordsByUser.set(target.user, target.password);
  }

  return Object.freeze(targets);
}

export async function reconcileMysqlTopology({
  environment = process.env,
  mysqlClient,
} = {}) {
  const admin = adminTarget(required(environment, "MYSQL_ADMIN_DATABASE_URL"));
  const targets = resolveCanonicalDatabaseTargets(environment);

  for (const target of targets) {
    if (target.host !== admin.host || target.port !== admin.port) {
      throw new Error("MYSQL_ADMIN_TARGET_HOST_DRIFT");
    }
  }

  const client = mysqlClient ?? (await import("mysql2/promise")).default;
  const connection = await client.createConnection({
    host: admin.host,
    port: admin.port,
    user: admin.user,
    password: admin.password,
    database: admin.database,
    multipleStatements: false,
  });

  try {
    const provisionedUsers = new Set();
    for (const target of targets) {
      await connection.query(
        "CREATE DATABASE IF NOT EXISTS ?? CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci",
        [target.database],
      );

      if (!provisionedUsers.has(target.user)) {
        await connection.query("CREATE USER IF NOT EXISTS ?@'%' IDENTIFIED BY ?", [
          target.user,
          target.password,
        ]);
        await connection.query("ALTER USER ?@'%' IDENTIFIED BY ?", [
          target.user,
          target.password,
        ]);
        provisionedUsers.add(target.user);
      }

      await connection.query("GRANT ALL PRIVILEGES ON ??.* TO ?@'%'", [
        target.database,
        target.user,
      ]);
    }
    await connection.query("FLUSH PRIVILEGES");
  } finally {
    await connection.end();
  }

  return Object.freeze({
    contract: "MORRO-MYSQL-TOPOLOGY-RECONCILE",
    contractVersion: 1,
    status: "pass",
    domains: Object.freeze(targets.map(({ id }) => id)),
    schemaCount: targets.length,
  });
}

function safeCode(error) {
  const value = error instanceof Error ? error.message : "";
  return /^[A-Z][A-Z0-9_:-]{2,160}$/u.test(value)
    ? value
    : "MYSQL_TOPOLOGY_RECONCILE_FAILED";
}

const invokedDirectly =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (invokedDirectly) {
  try {
    process.stdout.write(`${JSON.stringify(await reconcileMysqlTopology())}\n`);
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({
        contract: "MORRO-MYSQL-TOPOLOGY-RECONCILE",
        status: "fail",
        reason: safeCode(error),
      })}\n`,
    );
    process.exitCode = 1;
  }
}
