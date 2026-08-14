export const financialM137SchemaSql = `
CREATE TABLE IF NOT EXISTS financial_payment_idempotency (
  idempotency_key VARCHAR(180) COLLATE utf8mb4_bin PRIMARY KEY,
  payment_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL UNIQUE,
  created_at DATETIME(3) NOT NULL,
  INDEX idx_financial_payment_idempotency_payment (payment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS financial_payments (
  payment_id VARCHAR(120) COLLATE utf8mb4_bin PRIMARY KEY,
  idempotency_key VARCHAR(180) COLLATE utf8mb4_bin NOT NULL UNIQUE,
  subject_kind ENUM('order') NOT NULL,
  subject_reference VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  amount_minor BIGINT UNSIGNED NOT NULL,
  currency CHAR(3) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  status ENUM('pending','confirmed','failed','cancelled','expired','refunded') NOT NULL,
  provider_reference VARCHAR(180) COLLATE utf8mb4_bin NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  confirmed_at DATETIME(3) NULL,
  refunded_at DATETIME(3) NULL,
  CONSTRAINT chk_financial_payment_amount_safe CHECK (amount_minor <= 9007199254740991),
  INDEX idx_financial_payments_subject (subject_kind, subject_reference),
  INDEX idx_financial_payments_status (status),
  INDEX idx_financial_payments_provider (provider_reference)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS financial_ledger_transactions (
  transaction_id VARCHAR(120) COLLATE utf8mb4_bin PRIMARY KEY,
  external_key VARCHAR(160) COLLATE utf8mb4_bin NOT NULL UNIQUE,
  occurred_at DATETIME(3) NOT NULL,
  currency CHAR(3) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at DATETIME(3) NOT NULL,
  INDEX idx_financial_ledger_occurred (occurred_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS financial_ledger_postings (
  posting_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  transaction_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  posting_sequence INT UNSIGNED NOT NULL,
  account_reference VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  direction ENUM('debit','credit') NOT NULL,
  amount_minor BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL,
  CONSTRAINT chk_financial_ledger_amount_safe CHECK (amount_minor > 0 AND amount_minor <= 9007199254740991),
  CONSTRAINT chk_financial_ledger_sequence CHECK (posting_sequence < 256),
  CONSTRAINT fk_financial_ledger_postings_transaction
    FOREIGN KEY (transaction_id)
    REFERENCES financial_ledger_transactions(transaction_id)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT,
  UNIQUE KEY uq_financial_ledger_posting_sequence (transaction_id, posting_sequence),
  INDEX idx_financial_ledger_postings_account (account_reference)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

export const financialM141SchemaSql = `
CREATE TABLE IF NOT EXISTS financial_provider_events (
  provider_event_id VARCHAR(120) COLLATE utf8mb4_bin PRIMARY KEY,
  external_reference VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  provider_payment_reference VARCHAR(180) COLLATE utf8mb4_bin NULL,
  payment_status ENUM('paid','failed','cancelled','expired','refunded') NOT NULL,
  occurred_at DATETIME(3) NOT NULL,
  received_at DATETIME(3) NOT NULL,
  payload_sha256 BINARY(32) NOT NULL,
  matched_payment_id VARCHAR(120) COLLATE utf8mb4_bin NULL,
  CONSTRAINT fk_financial_provider_event_payment
    FOREIGN KEY (matched_payment_id)
    REFERENCES financial_payments(payment_id)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT,
  INDEX idx_financial_provider_events_external (external_reference),
  INDEX idx_financial_provider_events_payment (matched_payment_id),
  INDEX idx_financial_provider_events_occurred (occurred_at),
  INDEX idx_financial_provider_events_status (payment_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;


export const financialM142SchemaSql = `
CREATE TABLE IF NOT EXISTS financial_payment_results (
  result_id VARCHAR(120) COLLATE utf8mb4_bin PRIMARY KEY,
  provider_event_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL UNIQUE,
  payment_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  order_reference VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  result_kind ENUM('approved','failed','cancelled','expired','refunded') NOT NULL,
  payment_status ENUM('confirmed','failed','cancelled','expired','refunded') NOT NULL,
  payment_reference VARCHAR(180) COLLATE utf8mb4_bin NULL,
  occurred_at DATETIME(3) NOT NULL,
  recorded_at DATETIME(3) NOT NULL,
  CONSTRAINT fk_financial_payment_result_event
    FOREIGN KEY (provider_event_id)
    REFERENCES financial_provider_events(provider_event_id)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT,
  CONSTRAINT fk_financial_payment_result_payment
    FOREIGN KEY (payment_id)
    REFERENCES financial_payments(payment_id)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT,
  UNIQUE KEY uq_financial_payment_result_status (payment_id, payment_status),
  INDEX idx_financial_payment_results_order (order_reference),
  INDEX idx_financial_payment_results_recorded (recorded_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;
