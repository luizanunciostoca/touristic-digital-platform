import type { Pool } from "mysql2/promise";

export const financialM146SchemaSql = `
CREATE TABLE IF NOT EXISTS financial_provider_subscriptions (
  subscription_id VARCHAR(120) COLLATE utf8mb4_bin PRIMARY KEY,
  tenant_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  provider_reference VARCHAR(180) COLLATE utf8mb4_bin NOT NULL UNIQUE,
  status ENUM('pending','authorized','paused','cancelled') NOT NULL,
  amount_minor BIGINT UNSIGNED NOT NULL,
  currency CHAR(3) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  frequency TINYINT UNSIGNED NOT NULL,
  frequency_type ENUM('months') NOT NULL,
  payer_email VARCHAR(200) COLLATE utf8mb4_bin NOT NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  CONSTRAINT chk_financial_provider_subscription_amount_safe
    CHECK (amount_minor > 0 AND amount_minor <= 9007199254740991),
  CONSTRAINT chk_financial_provider_subscription_frequency
    CHECK (frequency = 1),
  INDEX idx_financial_provider_subscription_tenant (tenant_id, subscription_id),
  INDEX idx_financial_provider_subscription_status (status, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

export async function applyFinancialM146Schema(pool: Pool): Promise<void> {
  for (const statement of financialM146SchemaSql
    .split(";\n")
    .map((value) => value.trim())
    .filter(Boolean)) {
    await pool.query(statement);
  }
}
