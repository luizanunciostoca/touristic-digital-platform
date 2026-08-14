export const financialM137SchemaSql = `
CREATE TABLE IF NOT EXISTS financial_payment_idempotency (
  idempotency_key VARCHAR(180) PRIMARY KEY,
  payment_id VARCHAR(120) NOT NULL UNIQUE,
  created_at DATETIME(3) NOT NULL,
  INDEX idx_financial_payment_idempotency_payment (payment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS financial_payments (
  payment_id VARCHAR(120) PRIMARY KEY,
  idempotency_key VARCHAR(180) NOT NULL UNIQUE,
  subject_kind VARCHAR(40) NOT NULL,
  subject_reference VARCHAR(120) NOT NULL,
  amount_minor BIGINT UNSIGNED NOT NULL,
  currency CHAR(3) NOT NULL,
  status VARCHAR(40) NOT NULL,
  provider_reference VARCHAR(180) NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  confirmed_at DATETIME(3) NULL,
  refunded_at DATETIME(3) NULL,
  INDEX idx_financial_payments_subject (subject_kind, subject_reference),
  INDEX idx_financial_payments_status (status),
  INDEX idx_financial_payments_provider (provider_reference)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS financial_ledger_transactions (
  transaction_id VARCHAR(120) PRIMARY KEY,
  external_key VARCHAR(160) NOT NULL UNIQUE,
  occurred_at DATETIME(3) NOT NULL,
  currency CHAR(3) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  INDEX idx_financial_ledger_occurred (occurred_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS financial_ledger_postings (
  posting_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  transaction_id VARCHAR(120) NOT NULL,
  posting_sequence INT UNSIGNED NOT NULL,
  account_reference VARCHAR(120) NOT NULL,
  direction VARCHAR(8) NOT NULL,
  amount_minor BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL,
  CONSTRAINT fk_financial_ledger_postings_transaction
    FOREIGN KEY (transaction_id)
    REFERENCES financial_ledger_transactions(transaction_id)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT,
  UNIQUE KEY uq_financial_ledger_posting_sequence (transaction_id, posting_sequence),
  INDEX idx_financial_ledger_postings_account (account_reference)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;
