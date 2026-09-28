import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import {
  buildProductionMysqlEnvironment,
  parseProductionMysqlHostPort,
  productionBootstrapServiceName,
  productionDatabaseDomains,
  runWithProductionMysqlEnv,
} from "./with-production-mysql-env.mjs";

function fixture(overrides = {}) {
  const environment = {
    RENDER_SERVICE_NAME: productionBootstrapServiceName,
    PRODUCTION_MYSQL_HOSTPORT: "morro-digital-v2-production-mysql:3306",
    ...overrides,
  };
  for (const [domain] of productionDatabaseDomains) {
    environment[`PRODUCTION_${domain}_DATABASE_NAME`] =
      `morro_${domain.toLowerCase()}`;
    environment[`PRODUCTION_${domain}_DATABASE_USER`] =
      `morro_${domain.toLowerCase()}`;
    environment[`PRODUCTION_${domain}_DATABASE_PASSWORD`] =
      `${domain.toLowerCase()}+/= safe password`;
  }
  environment.PRODUCTION_DESTINATIONS_DATABASE_NAME = "morro_destinations";
  environment.PRODUCTION_DESTINATIONS_DATABASE_USER = "morro_destinations";
  return environment;
}

test("builds all thirteen least-privilege database URLs in memory", () => {
  const environment = buildProductionMysqlEnvironment(fixture());

  assert.equal(productionDatabaseDomains.length, 13);
  for (const [domain, canonicalKey] of productionDatabaseDomains) {
    const url = new URL(environment[canonicalKey]);
    assert.equal(url.protocol, "mysql:");
    assert.equal(url.hostname, "morro-digital-v2-production-mysql");
    assert.equal(url.port, "3306");
    assert.equal(url.username, `morro_${domain.toLowerCase()}`);
    assert.equal(url.pathname, `/morro_${domain.toLowerCase()}`);
    assert.equal(
      url.password,
      `${domain.toLowerCase()}+/= safe password`,
    );
  }
});

test("accepts only the exact private MySQL host and port", () => {
  assert.deepEqual(parseProductionMysqlHostPort(fixture()), {
    host: "morro-digital-v2-production-mysql",
    port: 3306,
  });
  assert.throws(
    () =>
      parseProductionMysqlHostPort(
        fixture({ PRODUCTION_MYSQL_HOSTPORT: "https://mysql.invalid:3306" }),
      ),
    /PRODUCTION_MYSQL_HOSTPORT_INVALID/u,
  );
  assert.throws(
    () =>
      parseProductionMysqlHostPort(
        fixture({ PRODUCTION_MYSQL_HOSTPORT: "attacker.example:3306" }),
      ),
    /PRODUCTION_MYSQL_HOSTPORT_UNTRUSTED/u,
  );
  assert.throws(
    () =>
      parseProductionMysqlHostPort(
        fixture({
          PRODUCTION_MYSQL_HOSTPORT:
            "morro-digital-v2-production-mysql:3307",
        }),
      ),
    /PRODUCTION_MYSQL_HOSTPORT_UNTRUSTED/u,
  );
});

test("fails closed outside the dedicated production bootstrap worker", () => {
  assert.throws(
    () =>
      buildProductionMysqlEnvironment(
        fixture({ RENDER_SERVICE_NAME: "morro-digital-v2-staging" }),
      ),
    /PRODUCTION_MYSQL_WRAPPER_SERVICE_DENIED/u,
  );
});

test("fails closed when any owner credential is absent", () => {
  const environment = fixture();
  delete environment.PRODUCTION_BUSINESS_DATABASE_PASSWORD;
  assert.throws(
    () => buildProductionMysqlEnvironment(environment),
    /PRODUCTION_BUSINESS_DATABASE_PASSWORD_REQUIRED/u,
  );
});

test("spawns the child with canonical URLs without mutating the source environment", async () => {
  const environment = fixture();
  let received;
  const spawnImpl = (command, args, options) => {
    received = { command, args, options };
    const child = new EventEmitter();
    queueMicrotask(() => child.emit("exit", 0, null));
    return child;
  };

  const code = await runWithProductionMysqlEnv({
    environment,
    argv: ["node", "bootstrap.mjs", "--verify-idempotent"],
    spawnImpl,
  });

  assert.equal(code, 0);
  assert.equal(received.command, "node");
  assert.deepEqual(received.args, ["bootstrap.mjs", "--verify-idempotent"]);
  assert.equal(received.options.stdio, "inherit");
  assert.ok(received.options.env.AUTH_DATABASE_URL.startsWith("mysql://"));
  assert.equal(environment.AUTH_DATABASE_URL, undefined);
});

test("requires an explicit child command", async () => {
  await assert.rejects(
    runWithProductionMysqlEnv({ environment: fixture(), argv: [] }),
    /PRODUCTION_MYSQL_WRAPPER_COMMAND_REQUIRED/u,
  );
});
