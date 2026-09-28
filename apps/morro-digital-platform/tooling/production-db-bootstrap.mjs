const canonicalDomains = Object.freeze([
  ["AUTH_DATABASE_URL", "morro_auth"],
  ["CONTROL_CENTER_AUDIT_DATABASE_URL", "morro_audit"],
  ["DESTINATIONS_DATABASE_URL", "morro_destinations"],
  ["CONTENT_DATABASE_URL", "morro_content"],
  ["BUSINESS_DATABASE_URL", "morro_business"],
  ["ORDERING_DATABASE_URL", "morro_ordering"],
  ["FINANCIAL_DATABASE_URL", "morro_financial"],
  ["TICKETING_DATABASE_URL", "morro_ticketing"],
  ["NOTIFICATIONS_DATABASE_URL", "morro_notifications"],
  ["AFFILIATES_DATABASE_URL", "morro_affiliates"],
  ["ANALYTICS_DATABASE_URL", "morro_analytics"],
  ["CRM_DATABASE_URL", "morro_crm"],
  ["COMMERCE_DATABASE_URL", "morro_commerce"],
]);

function requiredEnvironment(key) {
  const value = String(process.env[key] ?? "").trim();
  if (!value) throw new Error(`PRODUCTION_DATABASE_URL_REQUIRED:${key}`);
  return value;
}

async function materializeFeatureDisabledSchemas() {
  const affiliates = await import("@touristic/affiliates-server");
  const notifications = await import("@touristic/notifications-server");
  const commerce = await import("@touristic/commerce-server");

  const affiliatePool = affiliates.createAffiliatePool(
    requiredEnvironment("AFFILIATES_DATABASE_URL"),
  );
  try {
    await affiliates.applyAffiliatesM154Schema(affiliatePool);
    await affiliates.applyAffiliatesIdentityEligibilityM155(affiliatePool);
  } finally {
    await affiliatePool.end();
  }

  const notificationPool = notifications.createNotificationsMySqlPool(
    requiredEnvironment("NOTIFICATIONS_DATABASE_URL"),
  );
  try {
    await notifications.applyNotificationsSchema(notificationPool);
  } finally {
    await notificationPool.end();
  }

  const commercePool = commerce.createCommerceMySqlPoolFromEnvironment({
    COMMERCE_DATABASE_URL: requiredEnvironment("COMMERCE_DATABASE_URL"),
  });
  try {
    await commerce.applyCommerceRestaurantReservationSchema(commercePool);
  } finally {
    await commercePool.end();
  }
}

async function verifyCanonicalTopology() {
  const notifications = await import("@touristic/notifications-server");
  const summaries = [];

  for (const [key, expectedSchema] of canonicalDomains) {
    const url = requiredEnvironment(key);
    const parsed = new URL(url);
    if (parsed.protocol !== "mysql:") {
      throw new Error(`PRODUCTION_DATABASE_PROTOCOL_INVALID:${key}`);
    }
    if (
      decodeURIComponent(parsed.pathname.replace(/^\//u, "")) !== expectedSchema
    ) {
      throw new Error(`PRODUCTION_DATABASE_SCHEMA_URL_MISMATCH:${key}`);
    }

    const pool = notifications.createNotificationsMySqlPool(url);
    try {
      const [[databaseRow]] = await pool.query(
        "SELECT DATABASE() AS database_name",
      );
      if (databaseRow?.database_name !== expectedSchema) {
        throw new Error(`PRODUCTION_DATABASE_CONNECTED_SCHEMA_MISMATCH:${key}`);
      }

      const [[tableRow]] = await pool.query(
        "SELECT COUNT(*) AS table_count FROM information_schema.TABLES " +
          "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'",
      );
      const tableCount = Number(tableRow?.table_count ?? 0);
      if (!Number.isSafeInteger(tableCount) || tableCount < 1) {
        throw new Error(`PRODUCTION_DATABASE_SCHEMA_EMPTY:${key}`);
      }

      const [[engineRow]] = await pool.query(
        "SELECT COUNT(*) AS invalid_count FROM information_schema.TABLES " +
          "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' " +
          "AND COALESCE(ENGINE, '') <> 'InnoDB'",
      );
      if (Number(engineRow?.invalid_count ?? 0) !== 0) {
        throw new Error(`PRODUCTION_DATABASE_NON_INNODB_TABLE:${key}`);
      }

      summaries.push(
        Object.freeze({ key, schema: expectedSchema, tableCount }),
      );
    } finally {
      await pool.end();
    }
  }

  const destinationPool = notifications.createNotificationsMySqlPool(
    requiredEnvironment("DESTINATIONS_DATABASE_URL"),
  );
  try {
    const [[destinationRow]] = await destinationPool.execute(
      "SELECT COUNT(*) AS destination_count FROM destinations " +
        "WHERE destination_id = ? AND status = 'active'",
      ["morro-de-sao-paulo"],
    );
    if (Number(destinationRow?.destination_count ?? 0) !== 1) {
      throw new Error("PRODUCTION_CANONICAL_DESTINATION_MISSING");
    }
  } finally {
    await destinationPool.end();
  }

  const businessPool = notifications.createNotificationsMySqlPool(
    requiredEnvironment("BUSINESS_DATABASE_URL"),
  );
  try {
    const [columns] = await businessPool.query(
      "SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name " +
        "FROM information_schema.COLUMNS " +
        "WHERE TABLE_SCHEMA = DATABASE() " +
        "AND TABLE_NAME IN ('business_destinations','business_places') " +
        "AND COLUMN_NAME IN ('business_id','destination_id')",
    );
    const seen = new Set(
      columns.map((row) => `${row.table_name}.${row.column_name}`),
    );
    for (const required of [
      "business_destinations.business_id",
      "business_destinations.destination_id",
      "business_places.business_id",
      "business_places.destination_id",
    ]) {
      if (!seen.has(required)) {
        throw new Error(
          `PRODUCTION_BUSINESS_TENANCY_COLUMN_MISSING:${required}`,
        );
      }
    }
  } finally {
    await businessPool.end();
  }

  return Object.freeze(summaries);
}

async function main() {
  await materializeFeatureDisabledSchemas();
  const summaries = await verifyCanonicalTopology();
  console.log(
    JSON.stringify({
      contract: "MORRO-PRODUCTION-DATABASE-BOOTSTRAP",
      status: "pass",
      domains: summaries,
      canonicalDestination: "morro-de-sao-paulo",
      businessTenantScope: "business_id+destination_id",
    }),
  );
}

main().catch((error) => {
  const message =
    error instanceof Error
      ? error.message
      : "PRODUCTION_DATABASE_BOOTSTRAP_FAILED";
  console.error(`MORRO_PRODUCTION_DATABASE_BOOTSTRAP_FAILED:${message}`);
  process.exitCode = 1;
});
