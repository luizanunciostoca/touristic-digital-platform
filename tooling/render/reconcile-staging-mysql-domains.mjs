import mysql from "mysql2/promise";

const STAGING_SERVICE = "morro-digital-v2-staging";

export const stagingDatabaseDomains = Object.freeze([
  "AUTH",
  "ORDERING",
  "FINANCIAL",
  "AFFILIATES",
  "BUSINESS",
  "CONTENT",
  "DESTINATIONS",
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
  mysqlClient = mysql,
) {
  if (
    String(environment.RENDER_SERVICE_NAME ?? "").trim() !== STAGING_SERVICE
  ) {
    throw new Error("STAGING_MYSQL_RECONCILE_SERVICE_DENIED");
  }

  const hostPort = parseHostPort(environment);
  const rootPassword = required(environment, "STAGING_MYSQL_ROOT_PASSWORD");
  const domains = stagingDatabaseDomains.map((domain) =>
    Object.freeze({
      domain,
      database: identifier(environment, `STAGING_${domain}_DATABASE_NAME`),
      user: identifier(environment, `STAGING_${domain}_DATABASE_USER`),
      password: required(environment, `STAGING_${domain}_DATABASE_PASSWORD`),
    }),
  );

  const databaseNames = new Set(domains.map(({ database }) => database));
  if (databaseNames.size !== domains.length) {
    throw new Error("STAGING_DATABASE_OWNERSHIP_COLLISION");
  }

  const admin = await mysqlClient.createConnection({
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
