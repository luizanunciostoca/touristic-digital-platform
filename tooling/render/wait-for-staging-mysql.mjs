import net from "node:net";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const stagingServiceName = "morro-digital-v2-staging";

function required(environment, name) {
  const value = String(environment[name] ?? "").trim();
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

export function parseStagingMysqlHostPort(environment = process.env) {
  const value = required(environment, "STAGING_MYSQL_HOSTPORT");
  const match = /^(?<host>[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?):(?<port>\d{1,5})$/u.exec(value);
  if (!match) throw new Error("STAGING_MYSQL_HOSTPORT_INVALID");

  const port = Number(match.groups.port);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error("STAGING_MYSQL_HOSTPORT_INVALID");
  }

  return Object.freeze({ host: match.groups.host, port });
}

function boundedInteger(environment, name, fallback, minimum, maximum) {
  const raw = String(environment[name] ?? "").trim();
  if (!raw) return fallback;
  if (!/^\d+$/u.test(raw)) throw new Error(`${name}_INVALID`);

  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name}_INVALID`);
  }
  return value;
}

export function stagingMysqlWaitConfiguration(environment = process.env) {
  if (String(environment.RENDER_SERVICE_NAME ?? "").trim() !== stagingServiceName) {
    throw new Error("STAGING_MYSQL_WAIT_SERVICE_DENIED");
  }

  return Object.freeze({
    ...parseStagingMysqlHostPort(environment),
    timeoutMs: boundedInteger(
      environment,
      "STAGING_MYSQL_WAIT_TIMEOUT_MS",
      300_000,
      1_000,
      900_000,
    ),
    intervalMs: boundedInteger(
      environment,
      "STAGING_MYSQL_WAIT_INTERVAL_MS",
      2_000,
      100,
      30_000,
    ),
    connectTimeoutMs: boundedInteger(
      environment,
      "STAGING_MYSQL_CONNECT_TIMEOUT_MS",
      2_000,
      100,
      30_000,
    ),
  });
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

export function probeTcp(host, port, timeoutMs) {
  return new Promise((resolveProbe, rejectProbe) => {
    const socket = net.createConnection({ host, port });
    let settled = false;

    const finish = (error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) rejectProbe(error);
      else resolveProbe();
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish());
    socket.once("timeout", () => {
      const error = new Error("STAGING_MYSQL_CONNECT_TIMEOUT");
      error.code = "ETIMEDOUT";
      finish(error);
    });
    socket.once("error", finish);
  });
}

function safeErrorCode(error) {
  const code = String(error?.code ?? "").trim();
  if (/^[A-Z][A-Z0-9_]{1,40}$/u.test(code)) return code;
  const message = error instanceof Error ? error.message : "";
  return /^[A-Z][A-Z0-9_]{2,80}$/u.test(message)
    ? message
    : "STAGING_MYSQL_UNAVAILABLE";
}

export async function waitForStagingMysql(
  environment = process.env,
  dependencies = {},
) {
  const configuration = stagingMysqlWaitConfiguration(environment);
  const connect = dependencies.connect ?? probeTcp;
  const sleep = dependencies.sleep ?? delay;
  const now = dependencies.now ?? Date.now;
  const startedAt = now();
  let attempts = 0;
  let lastErrorCode = "STAGING_MYSQL_UNAVAILABLE";

  while (now() - startedAt < configuration.timeoutMs) {
    attempts += 1;
    try {
      await connect(
        configuration.host,
        configuration.port,
        configuration.connectTimeoutMs,
      );
      return Object.freeze({
        status: "pass",
        attempts,
        elapsedMs: Math.max(0, now() - startedAt),
      });
    } catch (error) {
      lastErrorCode = safeErrorCode(error);
    }

    const elapsedMs = now() - startedAt;
    if (elapsedMs >= configuration.timeoutMs) break;
    await sleep(
      Math.min(configuration.intervalMs, configuration.timeoutMs - elapsedMs),
    );
  }

  const timeout = new Error("STAGING_MYSQL_WAIT_TIMEOUT");
  timeout.code = "STAGING_MYSQL_WAIT_TIMEOUT";
  timeout.attempts = attempts;
  timeout.lastErrorCode = lastErrorCode;
  throw timeout;
}

function isDirectInvocation() {
  if (!process.argv[1]) return false;
  return resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
}

if (isDirectInvocation()) {
  try {
    const result = await waitForStagingMysql(process.env);
    process.stdout.write(
      `${JSON.stringify({
        contract: "MORRO-STAGING-MYSQL-WAIT",
        contractVersion: 1,
        status: result.status,
        attempts: result.attempts,
        elapsedMs: result.elapsedMs,
      })}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({
        contract: "MORRO-STAGING-MYSQL-WAIT",
        contractVersion: 1,
        status: "fail",
        reason: safeErrorCode(error),
        lastErrorCode: safeErrorCode({
          code: error?.lastErrorCode ?? "STAGING_MYSQL_UNAVAILABLE",
        }),
      })}\n`,
    );
    process.exitCode = 1;
  }
}
