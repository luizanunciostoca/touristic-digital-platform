import mysql from "mysql2/promise";

const CONTRACT = "MORRO-PRODUCTION-MYSQL-CANONICAL-BOOTSTRAP";
const SHA_PATTERN = /^[0-9a-f]{40}$/u;

export const canonicalProductionDomains = Object.freeze([
  Object.freeze({
    name: "auth",
    envKey: "AUTH_DATABASE_URL",
    schema: "morro_auth",
    expectedTables: Object.freeze([
      "auth_session_revocations",
      "auth_login_rate_limits",
      "auth_session_registry",
      "auth_principal_admin_state",
      "auth_admin_mutation_replay_guard",
    ]),
  }),
  Object.freeze({
    name: "audit",
    envKey: "CONTROL_CENTER_AUDIT_DATABASE_URL",
    schema: "morro_audit",
    expectedTables: Object.freeze(["control_center_audit_entries"]),
  }),
  Object.freeze({
    name: "destinations",
    envKey: "DESTINATIONS_DATABASE_URL",
    schema: "morro_destinations",
    expectedTables: Object.freeze(["destinations"]),
  }),
  Object.freeze({
    name: "content",
    envKey: "CONTENT_DATABASE_URL",
    schema: "morro_content",
    expectedTables: Object.freeze([
      "content_documents",
      "media_assets",
      "place_media",
    ]),
  }),
  Object.freeze({
    name: "business",
    envKey: "BUSINESS_DATABASE_URL",
    schema: "morro_business",
    expectedTables: Object.freeze([
      "business_entities",
      "business_destinations",
      "business_places",
      "business_place_legacy_mappings",
      "business_place_revision_history",
      "catalog_products",
      "catalog_offers",
      "catalog_menus",
      "catalog_menu_categories",
      "catalog_menu_items",
      "catalog_public_snapshots",
      "place_media_public_snapshots",
    ]),
  }),
  Object.freeze({
    name: "ordering",
    envKey: "ORDERING_DATABASE_URL",
    schema: "morro_ordering",
    expectedTables: Object.freeze([
      "ordering_orders",
      "ordering_checkout_access",
      "ordering_subscriptions",
      "ordering_subscription_renewal_intents",
      "ordering_ticketing_reservation_bindings",
      "ordering_restaurant_reservation_bindings",
    ]),
  }),
  Object.freeze({
    name: "financial",
    envKey: "FINANCIAL_DATABASE_URL",
    schema: "morro_financial",
    expectedTables: Object.freeze([
      "financial_payment_idempotency",
      "financial_payments",
      "financial_ledger_transactions",
      "financial_ledger_postings",
      "financial_provider_events",
      "financial_payment_results",
      "financial_refund_requests",
      "financial_reconciliation_runs",
      "financial_reconciliation_findings",
      "financial_reconciliation_run_findings",
      "financial_provider_subscriptions",
      "financial_allocations",
      "financial_payables",
      "financial_settlements",
    ]),
  }),
  Object.freeze({
    name: "ticketing",
    envKey: "TICKETING_DATABASE_URL",
    schema: "morro_ticketing",
    expectedTables: Object.freeze([
      "ticketing_tickets",
      "ticketing_checkins",
      "ticketing_offline_envelopes",
      "ticketing_inventory",
      "ticketing_reservations",
      "ticketing_reservation_events",
      "ticketing_financial_result_cursor",
      "ticketing_holder_profiles",
      "ticketing_offline_devices",
      "ticketing_inventory_ownership",
      "ticketing_admission_profiles",
      "ticketing_inventory_catalog_bindings",
      "ticketing_commerce_crm_outbox",
    ]),
  }),
  Object.freeze({
    name: "notifications",
    envKey: "NOTIFICATIONS_DATABASE_URL",
    schema: "morro_notifications",
    expectedTables: Object.freeze([
      "notification_outbox",
      "notification_preferences",
      "notification_dispatch_claims",
    ]),
  }),
  Object.freeze({
    name: "affiliates",
    envKey: "AFFILIATES_DATABASE_URL",
    schema: "morro_affiliates",
    expectedTables: Object.freeze([
      "affiliate_accounts",
      "affiliate_memberships",
      "affiliate_referral_evidence",
      "affiliate_attributions",
      "affiliate_conversions",
      "affiliate_entitlements",
      "affiliate_entitlement_revisions",
      "affiliate_idempotency_claims",
      "affiliate_audit_events",
      "affiliate_materialization_requests",
      "affiliate_outbox_events",
      "affiliate_privacy_requests",
      "affiliate_legal_holds",
      "affiliate_programs",
    ]),
  }),
  Object.freeze({
    name: "analytics",
    envKey: "ANALYTICS_DATABASE_URL",
    schema: "morro_analytics",
    expectedTables: Object.freeze(["analytics_events"]),
  }),
  Object.freeze({
    name: "crm",
    envKey: "CRM_DATABASE_URL",
    schema: "morro_crm",
    expectedTables: Object.freeze([
      "crm_leads",
      "crm_checklist_items",
      "crm_meetings",
      "crm_proposals",
      "crm_contracts",
      "crm_follow_up_settings",
      "crm_follow_ups",
      "crm_interactions",
      "crm_audit_events",
      "crm_trials",
      "crm_referrals",
      "crm_settings",
      "crm_storage_objects",
      "crm_commerce_customers",
      "crm_commerce_purchases",
    ]),
  }),
  Object.freeze({
    name: "commerce",
    envKey: "COMMERCE_DATABASE_URL",
    schema: "morro_commerce",
    expectedTables: Object.freeze([
      "commerce_restaurant_slots",
      "commerce_restaurant_reservations",
      "commerce_restaurant_reservation_events",
    ]),
  }),
]);

export const canonicalProductionScopePolicy = Object.freeze({
  auth: Object.freeze({
    auth_session_revocations: "global",
    auth_login_rate_limits: "global",
    auth_session_registry: "global",
    auth_principal_admin_state: "global",
    auth_admin_mutation_replay_guard: "global",
  }),
  audit: Object.freeze({
    control_center_audit_entries: "destination+tenant",
  }),
  destinations: Object.freeze({ destinations: "destination" }),
  content: Object.freeze({
    content_documents: "destination",
    media_assets: "business",
    place_media: "global",
  }),
  business: Object.freeze({
    business_entities: "global",
    business_destinations: "destination+business",
    business_places: "destination+business",
    business_place_legacy_mappings: "destination+business",
    business_place_revision_history: "global",
    catalog_products: "destination+business",
    catalog_offers: "destination+business",
    catalog_menus: "business",
    catalog_menu_categories: "business",
    catalog_menu_items: "business",
    catalog_public_snapshots: "business",
    place_media_public_snapshots: "business",
  }),
  ordering: Object.freeze({
    ordering_orders: "global",
    ordering_checkout_access: "destination+tenant",
    ordering_subscriptions: "global",
    ordering_subscription_renewal_intents: "global",
    ordering_ticketing_reservation_bindings: "global",
    ordering_restaurant_reservation_bindings: "business",
  }),
  financial: Object.freeze({
    financial_payment_idempotency: "global",
    financial_payments: "global",
    financial_ledger_transactions: "global",
    financial_ledger_postings: "global",
    financial_provider_events: "global",
    financial_payment_results: "global",
    financial_refund_requests: "global",
    financial_reconciliation_runs: "global",
    financial_reconciliation_findings: "global",
    financial_reconciliation_run_findings: "global",
    financial_provider_subscriptions: "tenant",
    financial_allocations: "global",
    financial_payables: "global",
    financial_settlements: "global",
  }),
  ticketing: Object.freeze({
    ticketing_tickets: "destination",
    ticketing_checkins: "global",
    ticketing_offline_envelopes: "global",
    ticketing_inventory: "destination",
    ticketing_reservations: "destination",
    ticketing_reservation_events: "global",
    ticketing_financial_result_cursor: "global",
    ticketing_holder_profiles: "global",
    ticketing_offline_devices: "destination",
    ticketing_inventory_ownership: "business",
    ticketing_admission_profiles: "global",
    ticketing_inventory_catalog_bindings: "business",
    ticketing_commerce_crm_outbox: "destination",
  }),
  notifications: Object.freeze({
    notification_outbox: "destination+tenant",
    notification_preferences: "destination",
    notification_dispatch_claims: "global",
  }),
  affiliates: Object.freeze({
    affiliate_accounts: "global",
    affiliate_memberships: "global",
    affiliate_referral_evidence: "global",
    affiliate_attributions: "global",
    affiliate_conversions: "global",
    affiliate_entitlements: "global",
    affiliate_entitlement_revisions: "global",
    affiliate_idempotency_claims: "global",
    affiliate_audit_events: "global",
    affiliate_materialization_requests: "global",
    affiliate_outbox_events: "global",
    affiliate_privacy_requests: "global",
    affiliate_legal_holds: "global",
    affiliate_programs: "destination",
  }),
  analytics: Object.freeze({ analytics_events: "destination+tenant" }),
  crm: Object.freeze({
    crm_leads: "global",
    crm_checklist_items: "global",
    crm_meetings: "global",
    crm_proposals: "global",
    crm_contracts: "global",
    crm_follow_up_settings: "global",
    crm_follow_ups: "global",
    crm_interactions: "global",
    crm_audit_events: "global",
    crm_trials: "global",
    crm_referrals: "global",
    crm_settings: "global",
    crm_storage_objects: "global",
    crm_commerce_customers: "global",
    crm_commerce_purchases: "destination",
  }),
  commerce: Object.freeze({
    commerce_restaurant_slots: "destination+business",
    commerce_restaurant_reservations: "destination+business",
    commerce_restaurant_reservation_events: "business",
  }),
});

function safeFailureCode(error) {
  const message = error instanceof Error ? String(error.message).trim() : "";
  return /^[A-Z][A-Z0-9_:-]{2,160}$/u.test(message)
    ? message
    : "PRODUCTION_DATABASE_BOOTSTRAP_FAILED";
}

function required(environment, key) {
  const value = String(environment[key] ?? "").trim();
  if (!value) throw new Error(`${key}_REQUIRED`);
  return value;
}

function sourceIdentity(environment) {
  if (
    String(environment.RENDER_SERVICE_NAME ?? "").trim() !==
    "morro-digital-v2-production-db-bootstrap"
  ) {
    throw new Error("PRODUCTION_DATABASE_BOOTSTRAP_SERVICE_DENIED");
  }
  const expectedSha = required(environment, "EXPECTED_SHA");
  const renderGitCommit = required(environment, "RENDER_GIT_COMMIT");
  if (!SHA_PATTERN.test(renderGitCommit) || !SHA_PATTERN.test(expectedSha)) {
    throw new Error("PRODUCTION_DATABASE_BOOTSTRAP_SHA_INVALID");
  }
  if (renderGitCommit !== expectedSha) {
    throw new Error("PRODUCTION_DATABASE_BOOTSTRAP_SHA_MISMATCH");
  }
  return Object.freeze({ expectedSha, renderGitCommit });
}

function validateDatabaseUrl(raw, domain) {
  let url;
  try {
    url = new URL(required({ value: raw }, "value"));
  } catch {
    throw new Error(
      `PRODUCTION_DATABASE_URL_INVALID_${domain.name.toUpperCase()}`,
    );
  }
  const database = url.pathname.replace(/^\//u, "");
  if (
    url.protocol !== "mysql:" ||
    url.hostname !== "morro-digital-v2-production-mysql" ||
    url.port !== "3306" ||
    !url.password ||
    url.username !== domain.schema ||
    database !== domain.schema
  ) {
    throw new Error(
      `PRODUCTION_DATABASE_OWNER_INVALID_${domain.name.toUpperCase()}`,
    );
  }
  return url.toString();
}

function createPool(databaseUrl) {
  return mysql.createPool({
    uri: databaseUrl,
    connectionLimit: 2,
    waitForConnections: true,
    timezone: "Z",
  });
}

async function loadDependencies() {
  const serviceUrl = (name, file = "index.js") =>
    new URL(`../../../services/${name}/dist/${file}`, import.meta.url).href;

  const [
    auth,
    audit,
    destinations,
    content,
    ordering,
    financial,
    providerSubscriptions,
    settlement,
    ticketing,
    notifications,
    affiliates,
    analytics,
    crm,
    commerce,
    businessPlaces,
    businessCatalog,
    businessMedia,
  ] = await Promise.all([
    import(serviceUrl("auth")),
    import(serviceUrl("analytics", "control-center-audit.js")),
    import(serviceUrl("destinations")),
    import(serviceUrl("content")),
    import(serviceUrl("ordering")),
    import(serviceUrl("financial")),
    import(serviceUrl("financial", "provider-subscription-schema.js")),
    import(serviceUrl("financial", "settlement.js")),
    import(serviceUrl("ticketing")),
    import(serviceUrl("notifications")),
    import(serviceUrl("affiliates")),
    import(serviceUrl("analytics")),
    import(serviceUrl("crm")),
    import(serviceUrl("commerce")),
    import("./place-platform-runtime.mjs"),
    import("./catalog-platform-runtime.mjs"),
    import("./media-publication-snapshot.mjs"),
  ]);

  return Object.freeze({
    auth,
    audit,
    destinations,
    content,
    ordering,
    financial,
    providerSubscriptions,
    settlement,
    ticketing,
    notifications,
    affiliates,
    analytics,
    crm,
    commerce,
    businessPlaces,
    businessCatalog,
    businessMedia,
  });
}

async function applyDomainSchema(domain, pool, dependencies) {
  switch (domain.name) {
    case "auth":
      for (const statement of dependencies.auth.authSecuritySchemaStatements) {
        await pool.query(statement);
      }
      break;
    case "audit":
      await dependencies.audit.applyControlCenterAuditSchema(pool);
      break;
    case "destinations": {
      await dependencies.destinations.applyDestinationsSchema(pool);
      const service =
        dependencies.destinations.createDestinationAdminService(pool);
      const seed =
        await dependencies.destinations.bootstrapMorroDeSaoPauloDestination(
          service,
        );
      if (!["created", "found"].includes(seed.status)) {
        throw new Error("PRODUCTION_DESTINATION_SEED_FAILED");
      }
      break;
    }
    case "content":
      await dependencies.content.applyContentM156Schema(pool);
      break;
    case "business":
      await dependencies.businessPlaces.applyPlacePlatformSchema(pool);
      await dependencies.businessCatalog.applyCatalogSchema(pool);
      await dependencies.businessMedia.applyMediaPublicationSnapshotSchema(
        pool,
      );
      break;
    case "ordering":
      await dependencies.ordering.applyOrderingM151Schema(pool);
      await dependencies.ordering.applyOrderingTicketingReservationSchema(pool);
      await dependencies.ordering.applyOrderingRestaurantReservationSchema(
        pool,
      );
      break;
    case "financial":
      await dependencies.financial.applyFinancialM145Schema(pool);
      await dependencies.providerSubscriptions.applyFinancialM146Schema(pool);
      await dependencies.settlement.applyFinancialM146SettlementSchema(pool);
      break;
    case "ticketing":
      await dependencies.ticketing.applyTicketingPublicApiSchema(pool);
      break;
    case "notifications":
      await dependencies.notifications.applyNotificationsSchema(pool);
      break;
    case "affiliates":
      await dependencies.affiliates.applyAffiliatesM154Schema(pool);
      await dependencies.affiliates.applyAffiliatesIdentityEligibilityM155(
        pool,
      );
      break;
    case "analytics":
      await dependencies.analytics.applyAnalyticsSchema(pool);
      break;
    case "crm":
      await dependencies.crm.applyCrmM155Schema(pool);
      await dependencies.crm.applyCrmCommerceSchema(pool);
      break;
    case "commerce":
      await dependencies.commerce.applyCommerceRestaurantReservationSchema(
        pool,
      );
      break;
    default:
      throw new Error("PRODUCTION_DATABASE_DOMAIN_UNKNOWN");
  }
}

function scopeForColumns(columns) {
  const names = new Set(columns);
  if (names.has("destination_id") && names.has("business_id")) {
    return "destination+business";
  }
  if (names.has("destination_id") && names.has("tenant_id")) {
    return "destination+tenant";
  }
  if (names.has("business_id") && names.has("tenant_id")) {
    return "business+tenant";
  }
  if (names.has("business_id")) return "business";
  if (names.has("destination_id")) return "destination";
  if (names.has("tenant_id")) return "tenant";
  return "global";
}

async function validateDomain(domain, pool) {
  const [[identity]] = await pool.query(
    "SELECT DATABASE() AS database_name, SUBSTRING_INDEX(CURRENT_USER(), '@', 1) AS current_user_name",
  );
  if (
    String(identity?.database_name ?? "") !== domain.schema ||
    String(identity?.current_user_name ?? "") !== domain.schema
  ) {
    throw new Error(
      `PRODUCTION_DATABASE_IDENTITY_INVALID_${domain.name.toUpperCase()}`,
    );
  }

  const [tables] = await pool.query(
    `SELECT TABLE_NAME AS table_name, ENGINE AS engine
       FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME`,
  );
  const tableNames = tables.map((row) => String(row.table_name));
  if (tableNames.length === 0) {
    throw new Error(
      `PRODUCTION_DATABASE_TABLES_EMPTY_${domain.name.toUpperCase()}`,
    );
  }
  const missing = domain.expectedTables.filter(
    (table) => !tableNames.includes(table),
  );
  if (missing.length > 0) {
    throw new Error(
      `PRODUCTION_DATABASE_EXPECTED_TABLE_MISSING_${domain.name.toUpperCase()}`,
    );
  }
  const unexpected = tableNames.filter(
    (table) => !domain.expectedTables.includes(table),
  );
  if (unexpected.length > 0) {
    throw new Error(
      `PRODUCTION_DATABASE_UNEXPECTED_TABLE_${domain.name.toUpperCase()}`,
    );
  }
  const nonInnoDb = tables
    .filter((row) => String(row.engine ?? "").toUpperCase() !== "INNODB")
    .map((row) => String(row.table_name));
  if (nonInnoDb.length > 0) {
    throw new Error(
      `PRODUCTION_DATABASE_ENGINE_INVALID_${domain.name.toUpperCase()}`,
    );
  }

  const [withoutPrimaryKey] = await pool.query(
    `SELECT table_record.TABLE_NAME AS table_name
       FROM information_schema.TABLES table_record
       LEFT JOIN information_schema.TABLE_CONSTRAINTS constraint_record
         ON constraint_record.TABLE_SCHEMA = table_record.TABLE_SCHEMA
        AND constraint_record.TABLE_NAME = table_record.TABLE_NAME
        AND constraint_record.CONSTRAINT_TYPE = 'PRIMARY KEY'
      WHERE table_record.TABLE_SCHEMA = DATABASE()
        AND table_record.TABLE_TYPE = 'BASE TABLE'
      GROUP BY table_record.TABLE_NAME
     HAVING COUNT(constraint_record.CONSTRAINT_NAME) = 0
      ORDER BY table_record.TABLE_NAME`,
  );
  if (withoutPrimaryKey.length > 0) {
    throw new Error(
      `PRODUCTION_DATABASE_PRIMARY_KEY_MISSING_${domain.name.toUpperCase()}`,
    );
  }

  const [scopeColumns] = await pool.query(
    `SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND COLUMN_NAME IN ('destination_id', 'business_id', 'tenant_id')
      ORDER BY TABLE_NAME, COLUMN_NAME`,
  );
  const columnsByTable = new Map(tableNames.map((table) => [table, []]));
  for (const row of scopeColumns) {
    const table = String(row.table_name);
    if (columnsByTable.has(table)) {
      columnsByTable.get(table).push(String(row.column_name));
    }
  }
  const scopes = Object.fromEntries(
    [...columnsByTable.entries()].map(([table, columns]) => [
      table,
      scopeForColumns(columns),
    ]),
  );

  const scopePolicy = canonicalProductionScopePolicy[domain.name];
  if (!scopePolicy) {
    throw new Error(
      `PRODUCTION_DATABASE_SCOPE_POLICY_MISSING_${domain.name.toUpperCase()}`,
    );
  }
  const policyTables = Object.keys(scopePolicy).sort();
  const expectedPolicyTables = [...domain.expectedTables].sort();
  if (JSON.stringify(policyTables) !== JSON.stringify(expectedPolicyTables)) {
    throw new Error(
      `PRODUCTION_DATABASE_SCOPE_POLICY_INCOMPLETE_${domain.name.toUpperCase()}`,
    );
  }
  for (const table of domain.expectedTables) {
    if (scopes[table] !== scopePolicy[table]) {
      throw new Error(
        `PRODUCTION_DATABASE_SCOPE_POLICY_MISMATCH_${domain.name.toUpperCase()}_${table.toUpperCase()}`,
      );
    }
  }

  const [[indexCountRow]] = await pool.query(
    "SELECT COUNT(*) AS count FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE()",
  );
  const [[foreignKeyCountRow]] = await pool.query(
    `SELECT COUNT(*) AS count
       FROM information_schema.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = DATABASE()
        AND CONSTRAINT_TYPE = 'FOREIGN KEY'`,
  );

  let canonicalDestinationCount = null;
  if (domain.name === "destinations") {
    const [[seedRow]] = await pool.execute(
      "SELECT COUNT(*) AS count FROM destinations WHERE destination_id = ?",
      ["morro-de-sao-paulo"],
    );
    canonicalDestinationCount = Number(seedRow.count);
    if (canonicalDestinationCount !== 1) {
      throw new Error("PRODUCTION_DESTINATION_SEED_CARDINALITY_INVALID");
    }
  }

  return Object.freeze({
    domain: domain.name,
    schema: domain.schema,
    tableCount: tableNames.length,
    tables: Object.freeze(tableNames),
    scopes: Object.freeze(scopes),
    scopePolicy: Object.freeze({ ...scopePolicy }),
    indexEntries: Number(indexCountRow.count),
    foreignKeys: Number(foreignKeyCountRow.count),
    canonicalDestinationCount,
  });
}

export async function runProductionDatabasePredeploy({
  environment = process.env,
  dependencies: injectedDependencies = null,
  poolFactory = createPool,
} = {}) {
  const identity = sourceIdentity(environment);
  const dependencies = injectedDependencies ?? (await loadDependencies());
  const evidence = [];

  for (const domain of canonicalProductionDomains) {
    const databaseUrl = validateDatabaseUrl(environment[domain.envKey], domain);
    const pool = poolFactory(databaseUrl, domain);
    try {
      await applyDomainSchema(domain, pool, dependencies);
      evidence.push(await validateDomain(domain, pool));
    } finally {
      await pool.end();
    }
  }

  return Object.freeze({
    contract: CONTRACT,
    contractVersion: 1,
    status: "pass",
    ...identity,
    canonicalDestination: "morro-de-sao-paulo",
    domains: Object.freeze(evidence),
    totalTables: evidence.reduce((sum, item) => sum + item.tableCount, 0),
  });
}

function structureFingerprint(result) {
  return JSON.stringify(
    result.domains.map((domain) => ({
      domain: domain.domain,
      schema: domain.schema,
      tables: domain.tables,
      scopes: domain.scopes,
      scopePolicy: domain.scopePolicy,
      canonicalDestinationCount: domain.canonicalDestinationCount,
    })),
  );
}

async function runCli() {
  const verifyIdempotent = process.argv.includes("--verify-idempotent");
  const first = await runProductionDatabasePredeploy();
  let second = null;
  if (verifyIdempotent) {
    second = await runProductionDatabasePredeploy();
    if (structureFingerprint(first) !== structureFingerprint(second)) {
      throw new Error("PRODUCTION_DATABASE_BOOTSTRAP_NOT_IDEMPOTENT");
    }
  }

  process.stdout.write(
    `${JSON.stringify({
      ...first,
      idempotent: verifyIdempotent,
      runs: verifyIdempotent ? 2 : 1,
    })}\n`,
  );
}

const invokedDirectly =
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (invokedDirectly) {
  runCli().catch((error) => {
    process.stderr.write(
      `${JSON.stringify({
        contract: CONTRACT,
        contractVersion: 1,
        status: "fail",
        reason: safeFailureCode(error),
      })}\n`,
    );
    process.exitCode = 1;
  });
}
