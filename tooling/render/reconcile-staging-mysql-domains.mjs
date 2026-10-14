import { createHmac } from "node:crypto";

export const stagingCrmIdentity = Object.freeze({
  service: "morro-digital-v2-staging",
  domain: "CRM",
  database: "morro_crm_staging",
  user: "morro_crm",
});

export function deriveStagingCrmDatabaseIdentity(environment = process.env) {
  if (
    String(environment.RENDER_SERVICE_NAME ?? "").trim() !==
    stagingCrmIdentity.service
  ) {
    throw new Error("STAGING_CRM_SERVICE_DENIED");
  }
  const rootSecret = String(
    environment.STAGING_MYSQL_ROOT_PASSWORD ?? "",
  ).trim();
  if (rootSecret.length < 16) {
    throw new Error("STAGING_CRM_ROOT_SECRET_INVALID");
  }
  // Keep the generated provider root secret outside code and logs; derive a
  // stable, independent schema user for CRM without creating new Render env
  // mutations. Only the staging web service has access to this root secret.
  const password = createHmac("sha256", rootSecret)
    .update("morro-digital-v2-staging/crm-user/v1")
    .digest("hex");
  return Object.freeze({
    domain: stagingCrmIdentity.domain,
    database: stagingCrmIdentity.database,
    user: stagingCrmIdentity.user,
    password,
  });
}

const STAGING_SERVICE = "morro-digital-v2-staging";

export const stagingDatabaseDomains = Object.freeze([
  "AUTH",
  "ORDERING",
  "FINANCIAL",
  "AFFILIATES",
  "BUSINESS",
  "CONTENT",
  "COMMERCE",
  "DESTINATIONS",
  "NOTIFICATIONS",
  "TICKETING",
  "CRM",
]);

function required(environment, name) {
  const value = String(environment[name] ?? "").trim();
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function identifier(environment, name) {
  const value = required(environment, name);
  if (!/^[A-Za-z0-9_]+$/u.test(value)) {
    throw new Error(`${name}_INVALID`);
  }
  return value;
}

function parseHostPort(environment) {
  const value = required(environment, "STAGING_MYSQL_HOSTPORT");
  const match =
    /^(?<host>[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?):(?<port>\d{1,5})$/u.exec(value);
  if (!match) throw new Error("STAGING_MYSQL_HOSTPORT_INVALID");
  const port = Number(match.groups.port);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error("STAGING_MYSQL_HOSTPORT_INVALID");
  }
  return Object.freeze({ host: match.groups.host, port });
}

export async function reconcileStagingMysqlDomains(
  environment = process.env,
  mysqlClient,
) {
  if (
    String(environment.RENDER_SERVICE_NAME ?? "").trim() !== STAGING_SERVICE
  ) {
    throw new Error("STAGING_MYSQL_RECONCILE_SERVICE_DENIED");
  }

  const hostPort = parseHostPort(environment);
  const rootPassword = required(environment, "STAGING_MYSQL_ROOT_PASSWORD");
  const domains = stagingDatabaseDomains.map((domain) =>
    domain === "CRM"
      ? deriveStagingCrmDatabaseIdentity(environment)
      : Object.freeze({
          domain,
          database: identifier(environment, `STAGING_${domain}_DATABASE_NAME`),
          user: identifier(environment, `STAGING_${domain}_DATABASE_USER`),
          password: required(
            environment,
            `STAGING_${domain}_DATABASE_PASSWORD`,
          ),
        }),
  );

  const databaseNames = new Set(domains.map(({ database }) => database));
  if (databaseNames.size !== domains.length) {
    throw new Error("STAGING_DATABASE_OWNERSHIP_COLLISION");
  }

  const users = new Set(domains.map(({ user }) => user));
  if (users.size !== domains.length) {
    throw new Error("STAGING_DATABASE_USER_OWNERSHIP_COLLISION");
  }

  const client = mysqlClient ?? (await import("mysql2/promise")).default;
  const admin = await client.createConnection({
    host: hostPort.host,
    port: hostPort.port,
    user: "root",
    password: rootPassword,
    multipleStatements: false,
  });

  try {
    for (const domain of domains) {
      await admin.query(
        "CREATE DATABASE IF NOT EXISTS ?? CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci",
        [domain.database],
      );
      await admin.query("CREATE USER IF NOT EXISTS ?@'%' IDENTIFIED BY ?", [
        domain.user,
        domain.password,
      ]);
      await admin.query("ALTER USER ?@'%' IDENTIFIED BY ?", [
        domain.user,
        domain.password,
      ]);
      await admin.query("GRANT ALL PRIVILEGES ON ??.* TO ?@'%'", [
        domain.database,
        domain.user,
      ]);
    }
    await admin.query("FLUSH PRIVILEGES");
  } finally {
    await admin.end();
  }

  return Object.freeze({
    status: "pass",
    domains: Object.freeze(domains.map(({ domain }) => domain.toLowerCase())),
  });
}
