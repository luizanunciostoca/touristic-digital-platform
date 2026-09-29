import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalProductionDomains,
  canonicalProductionScopePolicy,
  runProductionDatabasePredeploy,
} from "./production-database-predeploy.mjs";

function environment(overrides = {}) {
  const value = {
    RENDER_SERVICE_NAME: "morro-digital-v2-production-db-bootstrap",
    RENDER_GIT_COMMIT: "a".repeat(40),
    EXPECTED_SHA: "a".repeat(40),
    ...overrides,
  };
  for (const domain of canonicalProductionDomains) {
    const url = new URL("mysql://placeholder.invalid/");
    url.hostname = "morro-digital-v2-production-mysql";
    url.port = "3306";
    url.username = `${domain.schema}_runtime`;
    url.password = `${domain.name}-password`;
    url.pathname = `/${domain.schema}`;
    value[domain.envKey] = url.toString();
  }
  return value;
}

function dependencies(events) {
  const mark = (name) => async () => {
    events.push(name);
  };
  return {
    auth: {
      authSecuritySchemaStatements: Object.freeze([
        "CREATE TABLE IF NOT EXISTS auth_session_revocations (id INT PRIMARY KEY)",
      ]),
    },
    audit: { applyControlCenterAuditSchema: mark("audit") },
    destinations: {
      applyDestinationsSchema: mark("destinations"),
      createDestinationAdminService() {
        events.push("destinations-service");
        return {};
      },
      async bootstrapMorroDeSaoPauloDestination() {
        events.push("destinations-seed");
        return { status: "created" };
      },
    },
    content: { applyContentM156Schema: mark("content") },
    businessPlaces: { applyPlacePlatformSchema: mark("business-place") },
    businessCatalog: { applyCatalogSchema: mark("business-catalog") },
    businessMedia: {
      applyMediaPublicationSnapshotSchema: mark("business-media"),
    },
    ordering: {
      applyOrderingM151Schema: mark("ordering-m151"),
      applyOrderingTicketingReservationSchema: mark("ordering-ticketing"),
      applyOrderingRestaurantReservationSchema: mark("ordering-restaurant"),
    },
    financial: { applyFinancialM145Schema: mark("financial-m145") },
    providerSubscriptions: {
      applyFinancialM146Schema: mark("financial-provider-m146"),
    },
    settlement: {
      applyFinancialM146SettlementSchema: mark("financial-settlement-m146"),
    },
    ticketing: { applyTicketingPublicApiSchema: mark("ticketing-public") },
    notifications: { applyNotificationsSchema: mark("notifications") },
    affiliates: {
      applyAffiliatesM154Schema: mark("affiliates-m154"),
      applyAffiliatesIdentityEligibilityM155: mark("affiliates-m155"),
    },
    analytics: { applyAnalyticsSchema: mark("analytics") },
    crm: {
      applyCrmM155Schema: mark("crm-m155"),
      applyCrmCommerceSchema: mark("crm-commerce"),
    },
    commerce: {
      applyCommerceRestaurantReservationSchema: mark("commerce-restaurant"),
    },
  };
}

function poolFactory(closed, { missingTableDomain = null } = {}) {
  return (_databaseUrl, domain) => ({
    async query(sql) {
      const source = String(sql);
      if (source.includes("SELECT DATABASE() AS database_name")) {
        return [
          [
            {
              database_name: domain.schema,
              current_user_name: `${domain.schema}_runtime`,
            },
          ],
          [],
        ];
      }
      if (
        source.includes("information_schema.TABLES") &&
        source.includes("ENGINE AS engine")
      ) {
        const tables =
          domain.name === missingTableDomain
            ? domain.expectedTables.slice(1)
            : domain.expectedTables;
        return [
          tables.map((table_name) => ({ table_name, engine: "InnoDB" })),
          [],
        ];
      }
      if (
        source.includes("information_schema.TABLES") &&
        source.includes("TABLE_CONSTRAINTS") &&
        source.includes("PRIMARY KEY")
      ) {
        return [[], []];
      }
      if (source.includes("information_schema.COLUMNS")) {
        const rows = [];
        for (const [table, scope] of Object.entries(
          canonicalProductionScopePolicy[domain.name],
        )) {
          if (scope.includes("destination")) {
            rows.push({ table_name: table, column_name: "destination_id" });
          }
          if (scope.includes("business")) {
            rows.push({ table_name: table, column_name: "business_id" });
          }
          if (scope.includes("tenant")) {
            rows.push({ table_name: table, column_name: "tenant_id" });
          }
        }
        return [rows, []];
      }
      if (source.includes("information_schema.STATISTICS")) {
        return [[{ count: domain.expectedTables.length }], []];
      }
      if (
        source.includes("information_schema.TABLE_CONSTRAINTS") &&
        source.includes("FOREIGN KEY")
      ) {
        return [[{ count: 0 }], []];
      }
      return [[], []];
    },
    async execute(sql) {
      if (
        domain.name === "destinations" &&
        String(sql).includes("FROM destinations")
      ) {
        return [[{ count: 1 }], []];
      }
      return [[], []];
    },
    async end() {
      closed.push(domain.name);
    },
  });
}

test("canonical map covers thirteen bounded domains with materialized tables", () => {
  assert.equal(canonicalProductionDomains.length, 13);
  assert.deepEqual(
    canonicalProductionDomains.map((domain) => domain.name),
    [
      "auth",
      "audit",
      "destinations",
      "content",
      "business",
      "ordering",
      "financial",
      "ticketing",
      "notifications",
      "affiliates",
      "analytics",
      "crm",
      "commerce",
    ],
  );
  assert.equal(
    canonicalProductionDomains.find((domain) => domain.name === "business")
      .expectedTables.length,
    12,
  );
  assert.ok(
    canonicalProductionDomains
      .find((domain) => domain.name === "financial")
      .expectedTables.includes("financial_settlements"),
  );
});

test("runs every canonical applier, validates structure, seeds once, and closes every pool", async () => {
  const events = [];
  const closed = [];
  const result = await runProductionDatabasePredeploy({
    environment: environment(),
    dependencies: dependencies(events),
    poolFactory: poolFactory(closed),
  });

  assert.equal(result.status, "pass");
  assert.equal(result.expectedSha, "a".repeat(40));
  assert.equal(result.renderGitCommit, "a".repeat(40));
  assert.equal(result.domains.length, 13);
  assert.equal(result.canonicalDestination, "morro-de-sao-paulo");
  assert.equal(
    result.domains.find((domain) => domain.domain === "destinations")
      .canonicalDestinationCount,
    1,
  );
  assert.deepEqual(
    closed,
    canonicalProductionDomains.map((domain) => domain.name),
  );
  for (const expected of [
    "business-place",
    "business-catalog",
    "business-media",
    "ordering-m151",
    "ordering-ticketing",
    "ordering-restaurant",
    "financial-m145",
    "financial-provider-m146",
    "financial-settlement-m146",
    "ticketing-public",
    "affiliates-m154",
    "affiliates-m155",
    "crm-m155",
    "crm-commerce",
  ]) {
    assert.ok(events.includes(expected), expected);
  }
});

test("accepts the exact immutable application release identity", async () => {
  const events = [];
  const closed = [];
  const result = await runProductionDatabasePredeploy({
    environment: environment({
      RENDER_SERVICE_NAME: "morro-digital-v2",
      RENDER_GIT_COMMIT: "",
      MORRO_RELEASE_SHA: "a".repeat(40),
    }),
    dependencies: dependencies(events),
    poolFactory: poolFactory(closed),
  });

  assert.equal(result.status, "pass");
  assert.equal(result.serviceName, "morro-digital-v2");
  assert.equal(result.runtimeSourceSha, "a".repeat(40));
  assert.equal(result.domains.length, 13);
  assert.deepEqual(
    closed,
    canonicalProductionDomains.map((domain) => domain.name),
  );
});

test("rejects application release identity drift before connecting", async () => {
  await assert.rejects(
    runProductionDatabasePredeploy({
      environment: environment({
        RENDER_SERVICE_NAME: "morro-digital-v2",
        RENDER_GIT_COMMIT: "",
        MORRO_RELEASE_SHA: "b".repeat(40),
      }),
      dependencies: dependencies([]),
      poolFactory() {
        throw new Error("pool must not be created");
      },
    }),
    /PRODUCTION_DATABASE_BOOTSTRAP_SHA_MISMATCH/u,
  );
});

test("fails closed when an expected canonical table is absent", async () => {
  const closed = [];
  await assert.rejects(
    runProductionDatabasePredeploy({
      environment: environment(),
      dependencies: dependencies([]),
      poolFactory: poolFactory(closed, { missingTableDomain: "business" }),
    }),
    /PRODUCTION_DATABASE_EXPECTED_TABLE_MISSING_BUSINESS/u,
  );
  assert.ok(closed.includes("business"));
});

test("rejects a broad or wrong domain owner before connecting", async () => {
  const value = environment();
  const url = new URL(value.BUSINESS_DATABASE_URL);
  url.username = "morro_app";
  value.BUSINESS_DATABASE_URL = url.toString();

  await assert.rejects(
    runProductionDatabasePredeploy({
      environment: value,
      dependencies: dependencies([]),
      poolFactory() {
        throw new Error("pool must not be created");
      },
    }),
    /PRODUCTION_DATABASE_OWNER_INVALID_BUSINESS/u,
  );
});

test("rejects stale exact-head execution", async () => {
  await assert.rejects(
    runProductionDatabasePredeploy({
      environment: environment({ EXPECTED_SHA: "b".repeat(40) }),
      dependencies: dependencies([]),
      poolFactory() {
        throw new Error("pool must not be created");
      },
    }),
    /PRODUCTION_DATABASE_BOOTSTRAP_SHA_MISMATCH/u,
  );
});

test("requires explicit expected SHA and exact Render source identity", async () => {
  const missingExpected = environment();
  delete missingExpected.EXPECTED_SHA;
  await assert.rejects(
    runProductionDatabasePredeploy({
      environment: missingExpected,
      dependencies: dependencies([]),
      poolFactory() {
        throw new Error("pool must not be created");
      },
    }),
    /EXPECTED_SHA_REQUIRED/u,
  );

  await assert.rejects(
    runProductionDatabasePredeploy({
      environment: environment({ RENDER_GIT_COMMIT: "b".repeat(40) }),
      dependencies: dependencies([]),
      poolFactory() {
        throw new Error("pool must not be created");
      },
    }),
    /PRODUCTION_DATABASE_BOOTSTRAP_SHA_MISMATCH/u,
  );
});

test("fails closed when a scoped table loses its canonical tenant column", async () => {
  const closed = [];
  const baseFactory = poolFactory(closed);
  await assert.rejects(
    runProductionDatabasePredeploy({
      environment: environment(),
      dependencies: dependencies([]),
      poolFactory(databaseUrl, domain) {
        const pool = baseFactory(databaseUrl, domain);
        if (domain.name !== "business") return pool;
        const originalQuery = pool.query.bind(pool);
        pool.query = async (sql) => {
          const [rows, metadata] = await originalQuery(sql);
          if (String(sql).includes("information_schema.COLUMNS")) {
            return [
              rows.filter(
                (row) =>
                  !(
                    row.table_name === "business_places" &&
                    row.column_name === "destination_id"
                  ),
              ),
              metadata,
            ];
          }
          return [rows, metadata];
        };
        return pool;
      },
    }),
    /PRODUCTION_DATABASE_SCOPE_POLICY_MISMATCH_BUSINESS_BUSINESS_PLACES/u,
  );
});
