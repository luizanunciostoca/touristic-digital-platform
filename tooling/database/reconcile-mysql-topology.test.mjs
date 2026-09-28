import assert from "node:assert/strict";
import test from "node:test";

import { canonicalDatabaseDomains } from "./canonical-database-topology.mjs";
import {
  reconcileMysqlTopology,
  resolveCanonicalDatabaseTargets,
} from "./reconcile-mysql-topology.mjs";

function environment(overrides = {}) {
  const value = {
    MYSQL_ADMIN_DATABASE_URL:
      "mysql://root:root-secret@mysql.example:3306/mysql",
    MORRO_DB_HOST: "mysql.example",
    MORRO_DB_PORT: "3306",
    MORRO_DB_USER: "morro_app",
    MORRO_DB_PASSWORD: "app-secret",
    ...overrides,
  };
  return value;
}

test("resolves all 13 canonical schemas from the shared production identity", () => {
  const targets = resolveCanonicalDatabaseTargets(environment());
  assert.equal(targets.length, canonicalDatabaseDomains.length);
  assert.deepEqual(
    targets.map(({ database }) => database),
    canonicalDatabaseDomains.map(({ schema }) => schema),
  );
  assert.equal(new Set(targets.map(({ user }) => user)).size, 1);
});

test("explicit domain URL overrides shared MORRO_DB credentials", () => {
  const targets = resolveCanonicalDatabaseTargets(
    environment({
      BUSINESS_DATABASE_URL:
        "mysql://morro_business:business-secret@mysql.example:3306/morro_business",
    }),
  );
  const business = targets.find(({ domain }) => domain === "BUSINESS");
  assert.equal(business.user, "morro_business");
  assert.equal(business.password, "business-secret");
});

test("rejects canonical schema drift", () => {
  assert.throws(
    () =>
      resolveCanonicalDatabaseTargets(
        environment({
          BUSINESS_DATABASE_URL:
            "mysql://morro_business:secret@mysql.example:3306/wrong_business",
        }),
      ),
    /BUSINESS_DATABASE_SCHEMA_DRIFT/u,
  );
});

test("rejects database domains split across different hosts", () => {
  assert.throws(
    () =>
      resolveCanonicalDatabaseTargets(
        environment({
          BUSINESS_DATABASE_URL:
            "mysql://morro_business:secret@other.example:3306/morro_business",
        }),
      ),
    /MYSQL_CANONICAL_DOMAINS_HOST_DRIFT/u,
  );
});

test("reconciles schemas and grants without exposing credentials", async () => {
  const calls = [];
  let ended = false;
  const mysqlClient = {
    async createConnection(options) {
      assert.equal(options.host, "mysql.example");
      assert.equal(options.port, 3306);
      assert.equal(options.user, "root");
      assert.equal(options.password, "root-secret");
      return {
        async query(sql, params = []) {
          calls.push([sql, params]);
        },
        async end() {
          ended = true;
        },
      };
    },
  };

  const result = await reconcileMysqlTopology({
    environment: environment(),
    mysqlClient,
  });

  assert.equal(result.status, "pass");
  assert.equal(result.schemaCount, canonicalDatabaseDomains.length);
  assert.deepEqual(
    result.domains,
    canonicalDatabaseDomains.map(({ id }) => id),
  );
  assert.equal(
    calls.filter(([sql]) => sql.startsWith("CREATE DATABASE")).length,
    canonicalDatabaseDomains.length,
  );
  assert.equal(
    calls.filter(([sql]) => sql.startsWith("GRANT ALL PRIVILEGES")).length,
    canonicalDatabaseDomains.length,
  );
  assert.equal(
    calls.filter(([sql]) => sql.startsWith("CREATE USER")).length,
    1,
  );
  assert.equal(calls.filter(([sql]) => sql.startsWith("ALTER USER")).length, 1);
  assert.equal(calls.at(-1)?.[0], "FLUSH PRIVILEGES");
  assert.equal(ended, true);
  assert.equal(JSON.stringify(result).includes("secret"), false);
});

test("supports separate least-privilege users per domain", async () => {
  const explicit = {};
  for (const domain of canonicalDatabaseDomains) {
    explicit[domain.environmentKey] =
      `mysql://${domain.ownerUser}:${domain.id}-secret@mysql.example:3306/${domain.schema}`;
  }
  const calls = [];
  await reconcileMysqlTopology({
    environment: {
      MYSQL_ADMIN_DATABASE_URL:
        "mysql://root:root-secret@mysql.example:3306/mysql",
      ...explicit,
    },
    mysqlClient: {
      async createConnection() {
        return {
          async query(sql, params = []) {
            calls.push([sql, params]);
          },
          async end() {},
        };
      },
    },
  });
  assert.equal(
    calls.filter(([sql]) => sql.startsWith("CREATE USER")).length,
    canonicalDatabaseDomains.length,
  );
});

test("rejects admin credentials pointing at a different MySQL endpoint", async () => {
  await assert.rejects(
    reconcileMysqlTopology({
      environment: environment({
        MYSQL_ADMIN_DATABASE_URL:
          "mysql://root:root-secret@admin-other.example:3306/mysql",
      }),
      mysqlClient: {
        async createConnection() {
          throw new Error("must not connect");
        },
      },
    }),
    /MYSQL_ADMIN_TARGET_HOST_DRIFT/u,
  );
});
