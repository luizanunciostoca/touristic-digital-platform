import assert from "node:assert/strict";
import test from "node:test";

import { canonicalDatabaseDomains } from "../../../tooling/database/canonical-database-topology.mjs";
import { runPlatformDatabaseMigration } from "./platform-database-migrate.mjs";

function environment(overrides = {}) {
  return {
    MORRO_DB_HOST: "mysql.example",
    MORRO_DB_PORT: "3306",
    MORRO_DB_USER: "morro_app",
    MORRO_DB_PASSWORD: "app-secret",
    ...overrides,
  };
}

test("migrates all 13 domain schemas sequentially and closes every pool", async () => {
  const lifecycle = [];
  const migrations = Object.fromEntries(
    canonicalDatabaseDomains.map((domain) => [
      domain.id,
      async (pool) => {
        lifecycle.push(`migrate:${domain.id}`);
        await pool.query(`SCHEMA ${domain.id}`);
      },
    ]),
  );

  const result = await runPlatformDatabaseMigration({
    environment: environment(),
    migrations,
    async createPool(databaseUrl, domain) {
      const url = new URL(databaseUrl);
      assert.equal(url.pathname, `/${domain.schema}`);
      lifecycle.push(`open:${domain.id}`);
      return {
        async query(sql) {
          lifecycle.push(`query:${domain.id}:${sql}`);
        },
        async end() {
          lifecycle.push(`close:${domain.id}`);
        },
      };
    },
  });

  assert.equal(result.status, "pass");
  assert.equal(result.schemaCount, canonicalDatabaseDomains.length);
  assert.deepEqual(
    result.domains,
    canonicalDatabaseDomains.map(({ id }) => id),
  );

  for (const domain of canonicalDatabaseDomains) {
    const open = lifecycle.indexOf(`open:${domain.id}`);
    const migrate = lifecycle.indexOf(`migrate:${domain.id}`);
    const close = lifecycle.indexOf(`close:${domain.id}`);
    assert.ok(open >= 0 && migrate > open && close > migrate);
  }
  for (let index = 1; index < canonicalDatabaseDomains.length; index += 1) {
    const previous = canonicalDatabaseDomains[index - 1];
    const current = canonicalDatabaseDomains[index];
    assert.ok(
      lifecycle.indexOf(`close:${previous.id}`) <
        lifecycle.indexOf(`open:${current.id}`),
    );
  }
});

test("fails closed when one canonical database URL cannot be resolved", async () => {
  const explicit = {};
  for (const domain of canonicalDatabaseDomains) {
    if (domain.domain === "ANALYTICS") continue;
    explicit[domain.environmentKey] =
      `mysql://${domain.ownerUser}:secret@mysql.example:3306/${domain.schema}`;
  }

  await assert.rejects(
    runPlatformDatabaseMigration({
      environment: explicit,
      migrations: Object.fromEntries(
        canonicalDatabaseDomains.map(({ id }) => [id, async () => {}]),
      ),
      async createPool() {
        throw new Error("must not reach unresolved final domain");
      },
    }),
    /ANALYTICS_DATABASE_URL_REQUIRED/u,
  );
});

test("closes a domain pool when its migration fails", async () => {
  let closed = false;
  const migrations = Object.fromEntries(
    canonicalDatabaseDomains.map(({ id }) => [
      id,
      id === "auth"
        ? async () => {
            throw new Error("AUTH_SCHEMA_FAILED");
          }
        : async () => {},
    ]),
  );

  await assert.rejects(
    runPlatformDatabaseMigration({
      environment: environment(),
      migrations,
      async createPool() {
        return {
          async query() {},
          async end() {
            closed = true;
          },
        };
      },
    }),
    /AUTH_SCHEMA_FAILED/u,
  );
  assert.equal(closed, true);
});

test("migration result never contains database credentials", async () => {
  const result = await runPlatformDatabaseMigration({
    environment: environment(),
    migrations: Object.fromEntries(
      canonicalDatabaseDomains.map(({ id }) => [id, async () => {}]),
    ),
    async createPool() {
      return {
        async query() {},
        async end() {},
      };
    },
  });
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("app-secret"), false);
  assert.equal(serialized.includes("mysql.example"), false);
});
