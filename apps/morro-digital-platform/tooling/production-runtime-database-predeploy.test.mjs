import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalProductionDomains,
} from "./production-database-predeploy.mjs";
import {
  runProductionRuntimeDatabasePredeploy,
} from "./production-runtime-database-predeploy.mjs";

function environment(overrides = {}) {
  const value = {
    RENDER_SERVICE_NAME: "morro-digital-v2",
    EXPECTED_SHA: "a".repeat(40),
    MORRO_RELEASE_SHA: "a".repeat(40),
    MORRO_DATABASE_SCHEMA_MODE: "external",
    ...overrides,
  };
  for (const domain of canonicalProductionDomains) {
    const url = new URL("mysql://placeholder.invalid/");
    url.hostname = "morro-digital-v2-production-mysql";
    url.port = "3306";
    url.username = `${domain.schema}_runtime`;
    url.password = `${domain.name}-runtime-secret`;
    url.pathname = `/${domain.schema}`;
    value[domain.envKey] = url.toString();
  }
  return value;
}

function poolFactory(closed) {
  return (databaseUrl) => {
    const url = new URL(databaseUrl);
    const schema = url.pathname.slice(1);
    const domain = canonicalProductionDomains.find(
      (candidate) => candidate.schema === schema,
    );
    assert.ok(domain);
    return {
      async query(sql) {
        const source = String(sql);
        if (source.startsWith("SELECT DATABASE()")) {
          return [[{
            database_name: schema,
            current_user_name: `${schema}_runtime`,
          }], []];
        }
        if (source.includes("information_schema.TABLES")) {
          return [
            domain.expectedTables.map((table_name) => ({ table_name })),
            [],
          ];
        }
        if (source === "SHOW GRANTS FOR CURRENT_USER") {
          return [[{
            grant: `GRANT SELECT, INSERT, UPDATE, DELETE ON \`${schema}\`.* TO \`${schema}_runtime\`@\`%\``,
          }], []];
        }
        throw new Error("unexpected query");
      },
      async execute(sql) {
        assert.equal(
          String(sql),
          "SELECT COUNT(*) AS count FROM destinations WHERE destination_id = ?",
        );
        return [[{ count: 1 }], []];
      },
      async end() {
        closed.push(schema);
      },
    };
  };
}

test("validates all thirteen runtime identities without DDL", async () => {
  const closed = [];
  const result = await runProductionRuntimeDatabasePredeploy({
    environment: environment(),
    poolFactory: poolFactory(closed),
  });
  assert.equal(result.status, "pass");
  assert.equal(result.domainCount, 13);
  assert.equal(result.totalTables, 91);
  assert.equal(closed.length, 13);
  assert.ok(
    result.domains.every((item) =>
      item.runtimeUser.endsWith("_runtime"),
    ),
  );
});

test("rejects migration-owner credentials in the public runtime", async () => {
  const value = environment();
  const url = new URL(value.BUSINESS_DATABASE_URL);
  url.username = "morro_business";
  value.BUSINESS_DATABASE_URL = url.toString();

  await assert.rejects(
    runProductionRuntimeDatabasePredeploy({
      environment: value,
      poolFactory() {
        throw new Error("pool must not be created");
      },
    }),
    /PRODUCTION_RUNTIME_DATABASE_IDENTITY_INVALID_BUSINESS/u,
  );
});

test("requires exact immutable release identity and external schema mode", async () => {
  await assert.rejects(
    runProductionRuntimeDatabasePredeploy({
      environment: environment({ MORRO_RELEASE_SHA: "b".repeat(40) }),
      poolFactory() {
        throw new Error("pool must not be created");
      },
    }),
    /PRODUCTION_RUNTIME_PREDEPLOY_SHA_MISMATCH/u,
  );

  await assert.rejects(
    runProductionRuntimeDatabasePredeploy({
      environment: environment({ MORRO_DATABASE_SCHEMA_MODE: "apply" }),
      poolFactory() {
        throw new Error("pool must not be created");
      },
    }),
    /PRODUCTION_RUNTIME_SCHEMA_MODE_EXTERNAL_REQUIRED/u,
  );
});
