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

export const financialM144SchemaSql = `
CREATE TABLE IF NOT EXISTS financial_refund_requests (
  refund_request_id VARCHAR(120) COLLATE utf8mb4_bin PRIMARY KEY,
  idempotency_key VARCHAR(180) COLLATE utf8mb4_bin NOT NULL UNIQUE,
  payment_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL UNIQUE,
  approved_result_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL UNIQUE,
  amount_minor BIGINT UNSIGNED NOT NULL,
  currency CHAR(3) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  provider_payment_reference VARCHAR(180) COLLATE utf8mb4_bin NOT NULL,
  status ENUM('claimed','provider_accepted') NOT NULL,
  provider_refund_reference VARCHAR(180) COLLATE utf8mb4_bin NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  CONSTRAINT chk_financial_refund_amount_safe CHECK (amount_minor > 0 AND amount_minor <= 9007199254740991),
  CONSTRAINT fk_financial_refund_payment
    FOREIGN KEY (payment_id) REFERENCES financial_payments(payment_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_financial_refund_approved_result
    FOREIGN KEY (approved_result_id) REFERENCES financial_payment_results(result_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  UNIQUE KEY uq_financial_refund_provider_reference (provider_refund_reference),
  INDEX idx_financial_refund_status (status),
  INDEX idx_financial_refund_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

export const financialM145SchemaSql = `
CREATE TABLE IF NOT EXISTS financial_reconciliation_runs (
  reconciliation_run_id VARCHAR(120) COLLATE utf8mb4_bin PRIMARY KEY,
  payment_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  snapshot_hash BINARY(32) NOT NULL,
  observed_at DATETIME(3) NOT NULL,
  recorded_at DATETIME(3) NOT NULL,
  finding_count TINYINT UNSIGNED NOT NULL,
  CONSTRAINT chk_financial_reconciliation_finding_count CHECK (finding_count <= 7),
  CONSTRAINT fk_financial_reconciliation_run_payment
    FOREIGN KEY (payment_id) REFERENCES financial_payments(payment_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  INDEX idx_financial_reconciliation_run_payment (payment_id, recorded_at),
  INDEX idx_financial_reconciliation_run_observed (observed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS financial_reconciliation_findings (
  reconciliation_finding_id VARCHAR(120) COLLATE utf8mb4_bin PRIMARY KEY,
  payment_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  kind VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  severity ENUM('warning','critical') NOT NULL,
  evidence_hash BINARY(32) NOT NULL,
  expected_value VARCHAR(200) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  observed_value VARCHAR(200) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  state ENUM('open','acknowledged','resolved') NOT NULL,
  first_seen_at DATETIME(3) NOT NULL,
  last_seen_at DATETIME(3) NOT NULL,
  acknowledged_at DATETIME(3) NULL,
  acknowledged_by VARCHAR(200) COLLATE utf8mb4_bin NULL,
  resolved_at DATETIME(3) NULL,
  CONSTRAINT fk_financial_reconciliation_finding_payment
    FOREIGN KEY (payment_id) REFERENCES financial_payments(payment_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  UNIQUE KEY uq_financial_reconciliation_evidence (payment_id, kind, evidence_hash),
  INDEX idx_financial_reconciliation_finding_state (state, severity, last_seen_at),
  INDEX idx_financial_reconciliation_finding_payment (payment_id, state)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS financial_reconciliation_run_findings (
  reconciliation_run_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  reconciliation_finding_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  PRIMARY KEY (reconciliation_run_id, reconciliation_finding_id),
  CONSTRAINT fk_financial_reconciliation_link_run
    FOREIGN KEY (reconciliation_run_id)
    REFERENCES financial_reconciliation_runs(reconciliation_run_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_financial_reconciliation_link_finding
    FOREIGN KEY (reconciliation_finding_id)
    REFERENCES financial_reconciliation_findings(reconciliation_finding_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;
