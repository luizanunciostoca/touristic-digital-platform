import mysql from "mysql2/promise";

import { canonicalProductionDomains } from "./production-database-predeploy.mjs";

const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const FORBIDDEN_GRANT =
  /\b(?:ALL PRIVILEGES|ALTER|CREATE|DROP|GRANT OPTION|INDEX|REFERENCES|TRIGGER|CREATE USER|RELOAD|PROCESS|SUPER|SYSTEM_USER)\b/iu;

function required(environment, key) {
  const value = String(environment[key] ?? "").trim();
  if (!value) throw new Error(`${key}_REQUIRED`);
  return value;
}

function validateIdentity(environment) {
  if (required(environment, "RENDER_SERVICE_NAME") !== "morro-digital-v2") {
    throw new Error("PRODUCTION_RUNTIME_PREDEPLOY_SERVICE_DENIED");
  }
  const expectedSha = required(environment, "EXPECTED_SHA");
  const releaseSha = required(environment, "MORRO_RELEASE_SHA");
  if (!SHA_PATTERN.test(expectedSha) || !SHA_PATTERN.test(releaseSha)) {
    throw new Error("PRODUCTION_RUNTIME_PREDEPLOY_SHA_INVALID");
  }
  if (expectedSha !== releaseSha) {
    throw new Error("PRODUCTION_RUNTIME_PREDEPLOY_SHA_MISMATCH");
  }
  if (
    String(environment.MORRO_DATABASE_SCHEMA_MODE ?? "").trim() !== "external"
  ) {
    throw new Error("PRODUCTION_RUNTIME_SCHEMA_MODE_EXTERNAL_REQUIRED");
  }
  return { expectedSha, releaseSha };
}

function validateUrl(environment, domain) {
  let url;
  try {
    url = new URL(required(environment, domain.envKey));
  } catch {
    throw new Error(
      `PRODUCTION_RUNTIME_DATABASE_URL_INVALID_${domain.name.toUpperCase()}`,
    );
  }
  const expectedUser = `${domain.schema}_runtime`;
  if (
    url.protocol !== "mysql:" ||
    url.hostname !== "morro-digital-v2-production-mysql" ||
    url.port !== "3306" ||
    url.username !== expectedUser ||
    !url.password ||
    url.pathname !== `/${domain.schema}`
  ) {
    throw new Error(
      `PRODUCTION_RUNTIME_DATABASE_IDENTITY_INVALID_${domain.name.toUpperCase()}`,
    );
  }
  return url.toString();
}

async function validateDomain(domain, databaseUrl, poolFactory) {
  const pool = poolFactory(databaseUrl);
  try {
    const [[identity]] = await pool.query(
      "SELECT DATABASE() AS database_name, SUBSTRING_INDEX(CURRENT_USER(), '@', 1) AS current_user_name",
    );
    if (
      String(identity?.database_name ?? "") !== domain.schema ||
      String(identity?.current_user_name ?? "") !==
        `${domain.schema}_runtime`
    ) {
      throw new Error(
        `PRODUCTION_RUNTIME_DATABASE_CURRENT_USER_INVALID_${domain.name.toUpperCase()}`,
      );
    }

    const [tables] = await pool.query(
      `SELECT TABLE_NAME AS table_name
         FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_TYPE = 'BASE TABLE'
        ORDER BY TABLE_NAME`,
    );
    const observed = tables.map((row) => String(row.table_name)).sort();
    const expected = [...domain.expectedTables].sort();
    if (JSON.stringify(observed) !== JSON.stringify(expected)) {
      throw new Error(
        `PRODUCTION_RUNTIME_DATABASE_TABLE_INVENTORY_INVALID_${domain.name.toUpperCase()}`,
      );
    }

    const [grants] = await pool.query("SHOW GRANTS FOR CURRENT_USER");
    const grantText = grants
      .flatMap((row) => Object.values(row))
      .map(String)
      .join("\n");
    if (FORBIDDEN_GRANT.test(grantText)) {
      throw new Error(
        `PRODUCTION_RUNTIME_DATABASE_PRIVILEGE_EXCESS_${domain.name.toUpperCase()}`,
      );
    }
    for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
      if (!grantText.includes(privilege)) {
        throw new Error(
          `PRODUCTION_RUNTIME_DATABASE_PRIVILEGE_MISSING_${domain.name.toUpperCase()}_${privilege}`,
        );
      }
    }

    if (domain.name === "destinations") {
      const [[seed]] = await pool.execute(
        "SELECT COUNT(*) AS count FROM destinations WHERE destination_id = ?",
        ["morro-de-sao-paulo"],
      );
      if (Number(seed?.count ?? 0) !== 1) {
        throw new Error("PRODUCTION_RUNTIME_DESTINATION_SEED_INVALID");
      }
    }

    return {
      domain: domain.name,
      schema: domain.schema,
      runtimeUser: `${domain.schema}_runtime`,
      tableCount: observed.length,
    };
  } finally {
    await pool.end();
  }
}

export async function runProductionRuntimeDatabasePredeploy({
  environment = process.env,
  poolFactory = (uri) =>
    mysql.createPool({
      uri,
      connectionLimit: 2,
      waitForConnections: true,
      timezone: "Z",
    }),
} = {}) {
  const identity = validateIdentity(environment);
  const validatedDomains = canonicalProductionDomains.map((domain) => ({
    domain,
    databaseUrl: validateUrl(environment, domain),
  }));
  const domains = [];
  for (const { domain, databaseUrl } of validatedDomains) {
    domains.push(await validateDomain(domain, databaseUrl, poolFactory));
  }
  return {
    contract: "MORRO-PRODUCTION-RUNTIME-DATABASE-PREDEPLOY",
    contractVersion: 1,
    status: "pass",
    ...identity,
    schemaMode: "external",
    domainCount: domains.length,
    totalTables: domains.reduce((sum, item) => sum + item.tableCount, 0),
    domains,
  };
}

function safeFailureCode(error) {
  const message = error instanceof Error ? String(error.message) : "";
  return /^[A-Z][A-Z0-9_:-]{2,180}$/u.test(message)
    ? message
    : "PRODUCTION_RUNTIME_DATABASE_PREDEPLOY_FAILED";
}

if (
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href
) {
  runProductionRuntimeDatabasePredeploy()
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => {
      process.stderr.write(
        `${JSON.stringify({
          contract: "MORRO-PRODUCTION-RUNTIME-DATABASE-PREDEPLOY",
          status: "fail",
          reason: safeFailureCode(error),
        })}\n`,
      );
      process.exitCode = 1;
    });
}
