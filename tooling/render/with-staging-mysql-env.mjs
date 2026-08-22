import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const databaseDomains = Object.freeze([
  ["AUTH", "AUTH_DATABASE_URL"],
  ["ORDERING", "ORDERING_DATABASE_URL"],
  ["FINANCIAL", "FINANCIAL_DATABASE_URL"],
  ["AFFILIATES", "AFFILIATES_DATABASE_URL"],
]);

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
    try {
      derived = buildStagingDatabaseEnvironment(process.env);
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

    if (derived) {
      process.stdout.write(
        `${JSON.stringify({
          contract: "MORRO-STAGING-MYSQL-ENV",
          status: "pass",
          databases: databaseDomains.map(([domain]) => domain.toLowerCase()),
        })}\n`,
      );
      const child = spawn(command, args, {
        env: { ...process.env, ...derived },
        stdio: "inherit",
      });

      for (const signal of ["SIGINT", "SIGTERM"]) {
        process.on(signal, () => {
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
        if (signal) {
          process.kill(process.pid, signal);
          return;
        }
        process.exitCode = code ?? 1;
      });
    }
  }
}
