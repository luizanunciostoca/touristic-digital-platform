import type { Pool, RowDataPacket } from "mysql2/promise";

interface ColumnRow extends RowDataPacket {
  column_name: string;
}

async function ensureColumn(
  pool: Pool,
  tableName: "affiliate_accounts" | "affiliate_memberships",
  columnName: string,
  definition: string,
): Promise<void> {
  const [rows] = await pool.execute<ColumnRow[]>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [tableName, columnName],
  );
  if (rows.length === 0) {
    await pool.query(`ALTER TABLE ${tableName} ADD COLUMN ${definition}`);
  }
}

/**
 * Additive migration that reconciles the legacy M154 identity tables with the
 * AFFILIATE-POLICY-V1 domain model. It deliberately does not add any monetary
 * authority or financial state transitions.
 */
export async function applyAffiliatesIdentityEligibilityM155(
  pool: Pool,
): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS affiliate_programs (
      program_id VARCHAR(120) COLLATE utf8mb4_bin PRIMARY KEY,
      destination_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
      status ENUM('active','inactive') NOT NULL DEFAULT 'active',
      terms_version VARCHAR(80) COLLATE utf8mb4_bin NOT NULL,
      created_at DATETIME(3) NOT NULL,
      updated_at DATETIME(3) NOT NULL,
      INDEX idx_affiliate_program_destination (destination_id, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await ensureColumn(
    pool,
    "affiliate_accounts",
    "account_type",
    "account_type ENUM('person','organization') NOT NULL DEFAULT 'person' AFTER pseudonymous_reference",
  );
  await ensureColumn(
    pool,
    "affiliate_accounts",
    "role_category",
    "role_category VARCHAR(64) COLLATE utf8mb4_bin NOT NULL DEFAULT 'other' AFTER account_type",
  );
  await ensureColumn(
    pool,
    "affiliate_accounts",
    "identity_verified",
    "identity_verified TINYINT(1) NOT NULL DEFAULT 0 AFTER status",
  );
  await ensureColumn(
    pool,
    "affiliate_accounts",
    "contact_verified",
    "contact_verified TINYINT(1) NOT NULL DEFAULT 0 AFTER identity_verified",
  );
  await ensureColumn(
    pool,
    "affiliate_accounts",
    "fraud_blocked",
    "fraud_blocked TINYINT(1) NOT NULL DEFAULT 0 AFTER contact_verified",
  );
  await ensureColumn(
    pool,
    "affiliate_memberships",
    "accepted_terms_version",
    "accepted_terms_version VARCHAR(80) COLLATE utf8mb4_bin NULL AFTER status",
  );
  await ensureColumn(
    pool,
    "affiliate_memberships",
    "financial_onboarding_status",
    "financial_onboarding_status ENUM('not_started','pending','eligible','blocked') NOT NULL DEFAULT 'not_started' AFTER accepted_terms_version",
  );

  // Expand first so legacy values can be translated without lossy ENUM casts.
  await pool.query(`
    ALTER TABLE affiliate_memberships
    MODIFY COLUMN status ENUM('active','inactive','pending','approved','suspended','closed') NOT NULL
  `);
  await pool.query(`
    UPDATE affiliate_memberships
    SET status = CASE status
      WHEN 'active' THEN 'approved'
      WHEN 'inactive' THEN 'closed'
      ELSE status
    END
    WHERE status IN ('active', 'inactive')
  `);
  await pool.query(`
    ALTER TABLE affiliate_memberships
    MODIFY COLUMN status ENUM('pending','approved','suspended','closed') NOT NULL DEFAULT 'pending'
  `);
}
