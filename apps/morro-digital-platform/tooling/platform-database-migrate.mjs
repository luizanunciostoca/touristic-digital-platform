import { fileURLToPath } from "node:url";

import { canonicalDatabaseDomains } from "../../../tooling/database/canonical-database-topology.mjs";
import { createDatabaseEnvironmentResolver } from "./database-environment.mjs";

async function loadDefaultMigrations() {
  const [
    auth,
    analytics,
    affiliates,
    commerce,
    content,
    crm,
    destinations,
    financial,
    financialSubscriptions,
    financialSettlement,
    notifications,
    ordering,
    ticketing,
    place,
    catalog,
    media,
  ] = await Promise.all([
    import("@touristic/auth-server"),
    import("@touristic/analytics-server"),
    import("@touristic/affiliates-server"),
    import("@touristic/commerce-server"),
    import("@touristic/content-server"),
    import("@touristic/crm-server"),
    import("@touristic/destinations-server"),
    import("@touristic/financial-server"),
    import("@touristic/financial-server/provider-subscription-schema"),
    import("@touristic/financial-server/settlement"),
    import("@touristic/notifications-server"),
    import("@touristic/ordering-server"),
    import("@touristic/ticketing-server"),
    import("./place-platform-runtime.mjs"),
    import("./catalog-platform-runtime.mjs"),
    import("./media-publication-snapshot.mjs"),
  ]);

  return Object.freeze({
    auth: async (pool) => {
      for (const statement of auth.authSecuritySchemaStatements) {
        await pool.query(statement);
      }
    },
    audit: async (pool) => {
      await analytics.applyControlCenterAuditSchema(pool);
    },
    destinations: async (pool) => {
      await destinations.applyDestinationsSchema(pool);
    },
    content: async (pool) => {
      await content.applyContentM156Schema(pool);
    },
    business: async (pool) => {
      await place.applyPlacePlatformSchema(pool);
      await catalog.applyCatalogSchema(pool);
      await media.applyMediaPublicationSnapshotSchema(pool);
    },
    crm: async (pool) => {
      await crm.applyCrmM155Schema(pool);
      await crm.applyCrmCommerceSchema(pool);
    },
    affiliates: async (pool) => {
      await affiliates.applyAffiliatesM154Schema(pool);
      await affiliates.applyAffiliatesIdentityEligibilityM155(pool);
    },
    commerce: async (pool) => {
      await commerce.applyCommerceRestaurantReservationSchema(pool);
    },
    ordering: async (pool) => {
      await ordering.applyOrderingM151Schema(pool);
      await ordering.applyOrderingTicketingReservationSchema(pool);
      await ordering.applyOrderingRestaurantReservationSchema(pool);
    },
    financial: async (pool) => {
      await financial.applyFinancialM145Schema(pool);
      await financialSubscriptions.applyFinancialM146Schema(pool);
      await financialSettlement.applyFinancialM146SettlementSchema(pool);
    },
    ticketing: async (pool) => {
      await ticketing.applyTicketingPublicApiSchema(pool);
    },
    notifications: async (pool) => {
      await notifications.applyNotificationsSchema(pool);
    },
    analytics: async (pool) => {
      await analytics.applyAnalyticsSchema(pool);
    },
  });
}

async function defaultPoolFactory(databaseUrl) {
  const mysql = (await import("mysql2/promise")).default;
  return mysql.createPool({
    uri: databaseUrl,
    connectionLimit: 2,
    waitForConnections: true,
    timezone: "Z",
  });
}

export async function runPlatformDatabaseMigration({
  environment = process.env,
  createPool = defaultPoolFactory,
  migrations,
} = {}) {
  const resolveEnvironment = createDatabaseEnvironmentResolver({
    processEnvironment: environment,
  });
  const migrationMap = migrations ?? (await loadDefaultMigrations());
  const completed = [];

  for (const domain of canonicalDatabaseDomains) {
    const databaseUrl = resolveEnvironment(domain.environmentKey);
    if (!databaseUrl) {
      throw new Error(`${domain.environmentKey}_REQUIRED`);
    }
    const migration = migrationMap[domain.id];
    if (typeof migration !== "function") {
      throw new Error(`DATABASE_MIGRATION_MISSING_${domain.domain}`);
    }

    const pool = await createPool(databaseUrl, domain);
    try {
      await migration(pool, domain);
      await pool.query("SELECT 1 AS database_ready");
      completed.push(domain.id);
    } finally {
      await pool.end();
    }
  }

  return Object.freeze({
    contract: "MORRO-PLATFORM-DATABASE-MIGRATION",
    contractVersion: 1,
    status: "pass",
    domains: Object.freeze(completed),
    schemaCount: completed.length,
  });
}

function safeCode(error) {
  const value = error instanceof Error ? error.message : "";
  return /^[A-Z][A-Z0-9_:-]{2,160}$/u.test(value)
    ? value
    : "PLATFORM_DATABASE_MIGRATION_FAILED";
}

const invokedDirectly =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (invokedDirectly) {
  try {
    process.stdout.write(
      `${JSON.stringify(await runPlatformDatabaseMigration())}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({
        contract: "MORRO-PLATFORM-DATABASE-MIGRATION",
        status: "fail",
        reason: safeCode(error),
      })}\n`,
    );
    process.exitCode = 1;
  }
}
