import { spawn } from "node:child_process";
import { randomBytes, scryptSync } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const databaseDomains = Object.freeze([
  ["AUTH", "AUTH_DATABASE_URL"],
  ["ORDERING", "ORDERING_DATABASE_URL"],
  ["FINANCIAL", "FINANCIAL_DATABASE_URL"],
  ["AFFILIATES", "AFFILIATES_DATABASE_URL"],
]);
const providerAcceptanceRunner = fileURLToPath(
  new URL("./payments-provider-acceptance-runner.mjs", import.meta.url),
);

export const stagingPaymentsAcceptanceIdentity = Object.freeze({
  serviceName: "morro-digital-v2-staging",
  businessId: "biz_payments_acceptance",
  owner: Object.freeze({
    id: "staging-payments-acceptance-owner",
    role: "owner",
  }),
  admin: Object.freeze({
    id: "staging-payments-acceptance-admin",
    email: "payments-acceptance-admin@morro.invalid",
    role: "admin",
  }),
});

function required(environment, name) {
  const value = String(environment[name] ?? "").trim();
  if (!value) throw new Error(`${name}_REQUIRED`);
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

function databaseUrl(environment, domain, hostPort) {
  const database = required(environment, `STAGING_${domain}_DATABASE_NAME`);
  const user = required(environment, `STAGING_${domain}_DATABASE_USER`);
  const password = required(environment, `STAGING_${domain}_DATABASE_PASSWORD`);
  for (const [name, value] of [
    ["database", database],
    ["user", user],
  ]) {
    if (!/^[A-Za-z0-9_]+$/u.test(value)) {
      throw new Error(`STAGING_${domain}_${name.toUpperCase()}_INVALID`);
    }
  }

  const url = new URL("mysql://placeholder.invalid/");
  url.hostname = hostPort.host;
  url.port = String(hostPort.port);
  url.username = user;
  url.password = password;
  url.pathname = `/${database}`;
  return url.toString();
}

function normalizeAcceptancePassword(value) {
  if (typeof value !== "string") return "";
  return Array.from(value, (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127 ? " " : character;
  })
    .join("")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 200);
}

function normalizeAcceptancePayerEmail(value) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!normalized || normalized.length > 200) return "";
  return /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@testuser\.com$/u.test(normalized)
    ? normalized
    : "";
}

function hashAcceptancePassword(password) {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

function parseDashboardUsers(environment) {
  const raw = String(environment.DASHBOARD_USERS_JSON ?? "").trim();
  if (!raw) return [];
  let users;
  try {
    users = JSON.parse(raw);
  } catch {
    throw new Error("STAGING_DASHBOARD_USERS_JSON_INVALID");
  }
  if (!Array.isArray(users)) {
    throw new Error("STAGING_DASHBOARD_USERS_JSON_INVALID");
  }
  return users;
}

export function buildStagingPaymentsAcceptanceAuthEnvironment(
  environment = process.env,
) {
  const enabled =
    String(environment.STAGING_PAYMENTS_ACCEPTANCE_ENABLED ?? "")
      .trim()
      .toLowerCase() === "true";
  if (!enabled) return Object.freeze({});

  if (
    String(environment.RENDER_SERVICE_NAME ?? "").trim() !==
    stagingPaymentsAcceptanceIdentity.serviceName
  ) {
    throw new Error("STAGING_PAYMENTS_ACCEPTANCE_SERVICE_DENIED");
  }

  const password = normalizeAcceptancePassword(
    environment.STAGING_PAYMENTS_ACCEPTANCE_PASSWORD,
  );
  if (password.length < 20) {
    throw new Error("STAGING_PAYMENTS_ACCEPTANCE_PASSWORD_INVALID");
  }

  const payerEmail = normalizeAcceptancePayerEmail(
    environment.STAGING_PAYMENTS_PROVIDER_ACCEPTANCE_PAYER_EMAIL,
  );
  if (!payerEmail) {
    throw new Error("STAGING_PAYMENTS_ACCEPTANCE_PAYER_EMAIL_INVALID");
  }

  const users = parseDashboardUsers(environment);
  const acceptanceIds = new Set([
    stagingPaymentsAcceptanceIdentity.owner.id,
    stagingPaymentsAcceptanceIdentity.admin.id,
  ]);
  const acceptanceEmails = new Set([
    payerEmail,
    stagingPaymentsAcceptanceIdentity.admin.email,
  ]);
  const collision = users.some(
    (user) =>
      user &&
      typeof user === "object" &&
      (acceptanceIds.has(String(user.id ?? "")) ||
        acceptanceEmails.has(
          String(user.email ?? "")
            .trim()
            .toLowerCase(),
        )),
  );
  if (collision) {
    throw new Error("STAGING_PAYMENTS_ACCEPTANCE_USER_COLLISION");
  }

  const ownerPasswordHash = hashAcceptancePassword(password);
  const adminPasswordHash = hashAcceptancePassword(password);
  const acceptanceUsers = [
    {
      ...stagingPaymentsAcceptanceIdentity.owner,
      email: payerEmail,
      passwordHash: ownerPasswordHash,
      businessIds: [stagingPaymentsAcceptanceIdentity.businessId],
    },
    {
      ...stagingPaymentsAcceptanceIdentity.admin,
      passwordHash: adminPasswordHash,
      businessIds: [],
    },
  ];

  return Object.freeze({
    DASHBOARD_USERS_JSON: JSON.stringify([...users, ...acceptanceUsers]),
    DASHBOARD_ADMIN_GLOBAL_BYPASS_CONFIRMED: "true",
  });
}

export function buildStagingDatabaseEnvironment(environment = process.env) {
  const hostPort = parseHostPort(environment);
  const derived = {};
  const seenDatabaseNames = new Set();

  for (const [domain, target] of databaseDomains) {
    const url = databaseUrl(environment, domain, hostPort);
    const parsed = new URL(url);
    const databaseName = parsed.pathname.slice(1);
    if (seenDatabaseNames.has(databaseName)) {
      throw new Error("STAGING_DATABASE_OWNERSHIP_COLLISION");
    }
    seenDatabaseNames.add(databaseName);
    derived[target] = url;
  }

  return Object.freeze(derived);
}

export function shouldStartStagingPaymentsProviderAcceptance(
  environment,
  command,
  args,
) {
  const enabled =
    String(environment.STAGING_PAYMENTS_PROVIDER_ACCEPTANCE_AUTORUN ?? "")
      .trim()
      .toLowerCase() === "true";
  if (!enabled) return false;
  if (
    String(environment.RENDER_SERVICE_NAME ?? "").trim() !==
    stagingPaymentsAcceptanceIdentity.serviceName
  ) {
    return false;
  }
  const executable = String(command ?? "")
    .replaceAll("\\", "/")
    .split("/")
    .pop();
  if (executable !== "node") return false;
  return args.some((argument) =>
    String(argument)
      .replaceAll("\\", "/")
      .endsWith("apps/morro-digital-platform/tooling/dev-server.mjs"),
  );
}

function isDirectInvocation() {
  if (!process.argv[1]) return false;
  return resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
}

if (isDirectInvocation()) {
  const [command, ...args] = process.argv.slice(2);
  if (!command) {
    process.stderr.write(
      "Usage: node tooling/render/with-staging-mysql-env.mjs <command> [args...]\n",
    );
    process.exitCode = 64;
  } else {
    let derived;
    let acceptanceAuth;
    try {
      derived = buildStagingDatabaseEnvironment(process.env);
      acceptanceAuth = buildStagingPaymentsAcceptanceAuthEnvironment(
        process.env,
      );
    } catch (error) {
      process.stderr.write(
        `${JSON.stringify({
          contract: "MORRO-STAGING-MYSQL-ENV",
          status: "fail",
          reason: error instanceof Error ? error.message : "UNKNOWN_ERROR",
        })}\n`,
      );
      process.exitCode = 1;
    }

    if (derived && acceptanceAuth) {
      const childEnvironment = {
        ...process.env,
        ...derived,
        ...acceptanceAuth,
      };
      process.stdout.write(
        `${JSON.stringify({
          contract: "MORRO-STAGING-MYSQL-ENV",
          status: "pass",
          databases: databaseDomains.map(([domain]) => domain.toLowerCase()),
          paymentsAcceptanceAuth:
            Object.keys(acceptanceAuth).length > 0 ? "enabled" : "disabled",
        })}\n`,
      );
      const child = spawn(command, args, {
        env: childEnvironment,
        stdio: "inherit",
      });
      let acceptanceChild = null;

      if (
        shouldStartStagingPaymentsProviderAcceptance(
          childEnvironment,
          command,
          args,
        )
      ) {
        acceptanceChild = spawn(process.execPath, [providerAcceptanceRunner], {
          env: childEnvironment,
          stdio: "inherit",
        });
        acceptanceChild.on("error", (error) => {
          process.stderr.write(
            `${JSON.stringify({
              contract: "PAYMENTS-PROVIDER-ACCEPTANCE-RUNNER",
              status: "fail",
              reason: `start_failed:${error.message}`.slice(0, 200),
            })}\n`,
          );
        });
        acceptanceChild.on("exit", (code, signal) => {
          process.stdout.write(
            `${JSON.stringify({
              contract: "PAYMENTS-PROVIDER-ACCEPTANCE-RUNNER",
              status: signal || (code !== null && code !== 0) ? "fail" : "pass",
              ...(signal ? { signal } : { exitCode: code ?? 1 }),
            })}\n`,
          );
        });
      }

      for (const signal of ["SIGINT", "SIGTERM"]) {
        process.on(signal, () => {
          if (acceptanceChild && !acceptanceChild.killed) {
            acceptanceChild.kill(signal);
          }
          if (!child.killed) child.kill(signal);
        });
      }

      child.on("error", (error) => {
        process.stderr.write(
          `staging command failed to start: ${error.message}\n`,
        );
        process.exitCode = 1;
      });
      child.on("exit", (code, signal) => {
        if (acceptanceChild && !acceptanceChild.killed) {
          acceptanceChild.kill("SIGTERM");
        }
        if (signal) {
          process.kill(process.pid, signal);
          return;
        }
        process.exitCode = code ?? 1;
      });
    }
  }
}
