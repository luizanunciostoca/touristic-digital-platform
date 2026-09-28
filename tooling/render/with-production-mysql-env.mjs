import { spawn } from "node:child_process";

export const productionDatabaseDomains = Object.freeze([
  Object.freeze(["AUTH", "AUTH_DATABASE_URL"]),
  Object.freeze(["AUDIT", "CONTROL_CENTER_AUDIT_DATABASE_URL"]),
  Object.freeze(["DESTINATIONS", "DESTINATIONS_DATABASE_URL"]),
  Object.freeze(["CONTENT", "CONTENT_DATABASE_URL"]),
  Object.freeze(["BUSINESS", "BUSINESS_DATABASE_URL"]),
  Object.freeze(["ORDERING", "ORDERING_DATABASE_URL"]),
  Object.freeze(["FINANCIAL", "FINANCIAL_DATABASE_URL"]),
  Object.freeze(["TICKETING", "TICKETING_DATABASE_URL"]),
  Object.freeze(["NOTIFICATIONS", "NOTIFICATIONS_DATABASE_URL"]),
  Object.freeze(["AFFILIATES", "AFFILIATES_DATABASE_URL"]),
  Object.freeze(["ANALYTICS", "ANALYTICS_DATABASE_URL"]),
  Object.freeze(["CRM", "CRM_DATABASE_URL"]),
  Object.freeze(["COMMERCE", "COMMERCE_DATABASE_URL"]),
]);

function required(environment, name) {
  const value = String(environment[name] ?? "").trim();
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function validateIdentifier(value, name) {
  if (!/^[A-Za-z0-9_]+$/u.test(value)) {
    throw new Error(`${name}_INVALID`);
  }
  return value;
}

export function parseProductionMysqlHostPort(environment = process.env) {
  const value = required(environment, "PRODUCTION_MYSQL_HOSTPORT");
  const match =
    /^(?<host>[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?):(?<port>\d{1,5})$/u.exec(
      value,
    );
  if (!match) throw new Error("PRODUCTION_MYSQL_HOSTPORT_INVALID");
  const port = Number(match.groups.port);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error("PRODUCTION_MYSQL_HOSTPORT_INVALID");
  }
  return Object.freeze({ host: match.groups.host, port });
}

function databaseUrl(environment, domain, hostPort) {
  const database = validateIdentifier(
    required(environment, `PRODUCTION_${domain}_DATABASE_NAME`),
    `PRODUCTION_${domain}_DATABASE_NAME`,
  );
  const user = validateIdentifier(
    required(environment, `PRODUCTION_${domain}_DATABASE_USER`),
    `PRODUCTION_${domain}_DATABASE_USER`,
  );
  const password = required(
    environment,
    `PRODUCTION_${domain}_DATABASE_PASSWORD`,
  );

  const url = new URL("mysql://placeholder.invalid/");
  url.hostname = hostPort.host;
  url.port = String(hostPort.port);
  url.username = user;
  url.password = password;
  url.pathname = `/${database}`;
  return url.toString();
}

export function buildProductionMysqlEnvironment(environment = process.env) {
  if (
    String(environment.RENDER_SERVICE_NAME ?? "").trim() !== "morro-digital-v2"
  ) {
    throw new Error("PRODUCTION_MYSQL_WRAPPER_SERVICE_DENIED");
  }

  const hostPort = parseProductionMysqlHostPort(environment);
  const derived = { ...environment };
  for (const [domain, canonicalKey] of productionDatabaseDomains) {
    derived[canonicalKey] = databaseUrl(environment, domain, hostPort);
  }
  return Object.freeze(derived);
}

export function runWithProductionMysqlEnv({
  environment = process.env,
  argv = process.argv.slice(2),
  spawnImpl = spawn,
} = {}) {
  if (!Array.isArray(argv) || argv.length === 0) {
    return Promise.reject(new Error("PRODUCTION_MYSQL_WRAPPER_COMMAND_REQUIRED"));
  }
  const childEnvironment = buildProductionMysqlEnvironment(environment);
  const [command, ...args] = argv;

  return new Promise((resolve, reject) => {
    const child = spawnImpl(command, args, {
      env: childEnvironment,
      stdio: "inherit",
    });
    child.once("error", () => {
      reject(new Error("PRODUCTION_MYSQL_WRAPPER_COMMAND_START_FAILED"));
    });
    child.once("exit", (code, signal) => {
      if (signal == null && Number.isInteger(code)) {
        resolve(code);
        return;
      }
      reject(new Error("PRODUCTION_MYSQL_WRAPPER_COMMAND_TERMINATED"));
    });
  });
}

const invokedDirectly =
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (invokedDirectly) {
  runWithProductionMysqlEnv()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      const reason =
        error instanceof Error && /^[A-Z0-9_:-]+$/u.test(error.message)
          ? error.message
          : "PRODUCTION_MYSQL_WRAPPER_FAILED";
      process.stderr.write(`${reason}\n`);
      process.exitCode = 1;
    });
}
