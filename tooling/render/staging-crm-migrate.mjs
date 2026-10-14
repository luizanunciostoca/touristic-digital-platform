import {
  deriveStagingCrmDatabaseIdentity,
  stagingCrmIdentity,
} from "./staging-crm-credentials.mjs";

const requiredTables = Object.freeze([
  "crm_leads",
  "crm_follow_ups",
  "crm_trials",
  "crm_referrals",
  "crm_settings",
  "crm_storage_objects",
  "crm_commerce_customers",
  "crm_commerce_purchases",
]);

function required(environment, name) {
  const value = String(environment[name] ?? "").trim();
  if (!value) throw new Error(name + "_REQUIRED");
  return value;
}

export function isStagingCrmMigrationCommand(environment, command, args = []) {
  const binary = String(command ?? "")
    .replaceAll("\\", "/")
    .split("/")
    .pop();
  return (
    String(environment?.RENDER_SERVICE_NAME ?? "").trim() ===
      stagingCrmIdentity.service &&
    binary === "node" &&
    args.length === 1 &&
    String(args[0]).replaceAll("\\", "/") ===
      "apps/morro-digital-platform/tooling/staging-predeploy.mjs"
  );
}

export function validateStagingCrmConnectionIdentity(environment) {
  const expected = deriveStagingCrmDatabaseIdentity(environment);
  const hostPort = required(environment, "STAGING_MYSQL_HOSTPORT");
  const value = required(environment, "CRM_DATABASE_URL");
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("STAGING_CRM_URL_INVALID");
  }
  if (
    url.protocol !== "mysql:" ||
    url.host !== hostPort ||
    decodeURIComponent(url.username) !== expected.user ||
    decodeURIComponent(url.password) !== expected.password ||
    url.pathname !== "/" + expected.database ||
    url.search ||
    url.hash
  ) {
    throw new Error("STAGING_CRM_URL_IDENTITY_MISMATCH");
  }
  return expected;
}

export async function runStagingCrmMigration(
  environment = process.env,
  dependencies = {},
) {
  const expected = validateStagingCrmConnectionIdentity(environment);
  const implementation =
    dependencies.crm ?? (await import("../../services/crm/dist/index.js"));
  const pool = implementation.createCrmMySqlPoolFromEnvironment({
    CRM_DATABASE_URL: environment.CRM_DATABASE_URL,
  });
  if (
    !pool ||
    typeof pool.query !== "function" ||
    typeof pool.end !== "function"
  ) {
    throw new Error("STAGING_CRM_POOL_INVALID");
  }
  try {
    // Verify the persistent database AND restricted user before writing schema.
    const [identities] = await pool.query(
      "SELECT DATABASE() AS database_name, SUBSTRING_INDEX(CURRENT_USER(), '@', 1) AS current_user_name",
    );
    const identity = identities?.[0];
    if (
      identity?.database_name !== expected.database ||
      identity?.current_user_name !== expected.user
    ) {
      throw new Error("STAGING_CRM_DB_OWNER_MISMATCH");
    }
    await implementation.applyCrmM155Schema(pool);
    await implementation.applyCrmCommerceSchema(pool);

    const [rows] = await pool.query(
      "SELECT TABLE_NAME AS name FROM information_schema.tables WHERE table_schema = DATABASE()",
    );
    const tables = new Set(
      (rows ?? []).map((row) => String(row.name ?? "").toLowerCase()),
    );
    const missing = requiredTables.filter((name) => !tables.has(name));
    if (missing.length > 0) {
      throw new Error("STAGING_CRM_SCHEMA_READBACK_FAILED");
    }
    // Application-facing SQL readback; no fixture writes or destructive DDL.
    await pool.query("SELECT id FROM crm_leads LIMIT 1");
    return Object.freeze({
      contract: "STAGING-CRM-MYSQL-MIGRATION",
      status: "pass",
      database: expected.database,
      user: expected.user,
      tableCount: tables.size,
      verifiedTables: Object.freeze([...requiredTables]),
    });
  } finally {
    await pool.end();
  }
}
