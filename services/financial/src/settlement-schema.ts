import type { Pool } from "mysql2/promise";

export const financialM146SettlementSchemaSql = `
CREATE TABLE IF NOT EXISTS financial_allocations (
  allocation_id VARCHAR(120) COLLATE utf8mb4_bin PRIMARY KEY,
  payment_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL UNIQUE,
  reconciliation_run_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  gross_amount_minor BIGINT UNSIGNED NOT NULL,
  platform_amount_minor BIGINT UNSIGNED NOT NULL,
  currency CHAR(3) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  allocation_hash BINARY(32) NOT NULL,
  status ENUM('claimed','active','reversed') NOT NULL,
  ledger_external_key VARCHAR(160) COLLATE utf8mb4_bin NULL UNIQUE,
  reversal_ledger_external_key VARCHAR(160) COLLATE utf8mb4_bin NULL UNIQUE,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  reversed_at DATETIME(3) NULL,
  CONSTRAINT chk_financial_allocation_gross CHECK (gross_amount_minor > 0 AND gross_amount_minor <= 9007199254740991),
  CONSTRAINT chk_financial_allocation_platform CHECK (platform_amount_minor <= gross_amount_minor AND platform_amount_minor <= 9007199254740991),
  CONSTRAINT fk_financial_allocation_payment
    FOREIGN KEY (payment_id) REFERENCES financial_payments(payment_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_financial_allocation_reconciliation
    FOREIGN KEY (reconciliation_run_id) REFERENCES financial_reconciliation_runs(reconciliation_run_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  INDEX idx_financial_allocation_status (status, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS financial_payables (
  payable_id VARCHAR(120) COLLATE utf8mb4_bin PRIMARY KEY,
  allocation_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  payment_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  beneficiary_reference VARCHAR(80) COLLATE utf8mb4_bin NOT NULL,
  amount_minor BIGINT UNSIGNED NOT NULL,
  currency CHAR(3) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  status ENUM('blocked','ready','transfer_pending','settled','failed','reversed') NOT NULL,
  settlement_id VARCHAR(120) COLLATE utf8mb4_bin NULL UNIQUE,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  CONSTRAINT chk_financial_payable_amount CHECK (amount_minor > 0 AND amount_minor <= 9007199254740991),
  CONSTRAINT fk_financial_payable_allocation
    FOREIGN KEY (allocation_id) REFERENCES financial_allocations(allocation_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_financial_payable_payment
    FOREIGN KEY (payment_id) REFERENCES financial_payments(payment_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  UNIQUE KEY uq_financial_payable_beneficiary (allocation_id, beneficiary_reference),
  INDEX idx_financial_payable_status (status, updated_at),
  INDEX idx_financial_payable_payment (payment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS financial_settlements (
  settlement_id VARCHAR(120) COLLATE utf8mb4_bin PRIMARY KEY,
  payable_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL UNIQUE,
  payment_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  beneficiary_reference VARCHAR(80) COLLATE utf8mb4_bin NOT NULL,
  amount_minor BIGINT UNSIGNED NOT NULL,
  currency CHAR(3) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  idempotency_key VARCHAR(180) COLLATE utf8mb4_bin NOT NULL UNIQUE,
  status ENUM('claimed','provider_accepted','settled','failed','reversed') NOT NULL,
  provider_transfer_reference VARCHAR(180) COLLATE utf8mb4_bin NULL UNIQUE,
  ledger_external_key VARCHAR(160) COLLATE utf8mb4_bin NULL UNIQUE,
  reversal_ledger_external_key VARCHAR(160) COLLATE utf8mb4_bin NULL UNIQUE,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  settled_at DATETIME(3) NULL,
  reversed_at DATETIME(3) NULL,
  CONSTRAINT chk_financial_settlement_amount CHECK (amount_minor > 0 AND amount_minor <= 9007199254740991),
  CONSTRAINT fk_financial_settlement_payable
    FOREIGN KEY (payable_id) REFERENCES financial_payables(payable_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_financial_settlement_payment
    FOREIGN KEY (payment_id) REFERENCES financial_payments(payment_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  INDEX idx_financial_settlement_status (status, updated_at),
  INDEX idx_financial_settlement_payment (payment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

export async function applyFinancialM146SettlementSchema(
  pool: Pool,
): Promise<void> {
  for (const statement of financialM146SettlementSchemaSql
    .split(";\n")
    .map((value) => value.trim())
    .filter(Boolean)) {
    await pool.query(statement);
  }
}
