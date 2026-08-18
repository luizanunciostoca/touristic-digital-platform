export const affiliatesM154SchemaSql = `
CREATE TABLE IF NOT EXISTS affiliate_accounts (
  affiliate_id VARCHAR(120) COLLATE utf8mb4_bin PRIMARY KEY,
  identity_reference VARCHAR(180) COLLATE utf8mb4_bin NOT NULL UNIQUE,
  pseudonymous_reference VARCHAR(180) COLLATE utf8mb4_bin NOT NULL UNIQUE,
  status ENUM('active','suspended','inactive') NOT NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  INDEX idx_affiliate_accounts_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS affiliate_memberships (
  membership_id VARCHAR(120) COLLATE utf8mb4_bin PRIMARY KEY,
  affiliate_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  program_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  status ENUM('active','suspended','inactive') NOT NULL,
  joined_at DATETIME(3) NOT NULL,
  ended_at DATETIME(3) NULL,
  updated_at DATETIME(3) NOT NULL,
  CONSTRAINT fk_affiliate_membership_account FOREIGN KEY (affiliate_id)
    REFERENCES affiliate_accounts(affiliate_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  UNIQUE KEY uq_affiliate_membership_program (affiliate_id, program_id),
  INDEX idx_affiliate_membership_program (program_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS affiliate_referral_evidence (
  evidence_id VARCHAR(120) COLLATE utf8mb4_bin PRIMARY KEY,
  affiliate_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  program_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  subject_id VARCHAR(180) COLLATE utf8mb4_bin NOT NULL,
  source ENUM('platform_link','platform_qr','checkout_code','server_referral') NOT NULL,
  evidence_fingerprint BINARY(32) NOT NULL,
  server_observed_at DATETIME(3) NOT NULL,
  received_at DATETIME(3) NOT NULL,
  policy_version VARCHAR(80) COLLATE utf8mb4_bin NOT NULL,
  created_at DATETIME(3) NOT NULL,
  CONSTRAINT uq_affiliate_referral_fingerprint UNIQUE (affiliate_id, program_id, subject_id, evidence_fingerprint),
  INDEX idx_affiliate_referral_subject (subject_id, server_observed_at),
  INDEX idx_affiliate_referral_retention (received_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS affiliate_attributions (
  attribution_id VARCHAR(120) COLLATE utf8mb4_bin PRIMARY KEY,
  affiliate_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  program_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  subject_id VARCHAR(180) COLLATE utf8mb4_bin NOT NULL,
  evidence_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  evidence_fingerprint BINARY(32) NOT NULL,
  source ENUM('platform_link','platform_qr','checkout_code','server_referral') NOT NULL,
  established_at DATETIME(3) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  policy_version VARCHAR(80) COLLATE utf8mb4_bin NOT NULL,
  order_id VARCHAR(120) COLLATE utf8mb4_bin NULL,
  order_locked_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL,
  CONSTRAINT fk_affiliate_attribution_evidence FOREIGN KEY (evidence_id)
    REFERENCES affiliate_referral_evidence(evidence_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  UNIQUE KEY uq_affiliate_attribution_subject (subject_id),
  UNIQUE KEY uq_affiliate_attribution_order (order_id),
  INDEX idx_affiliate_attribution_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS affiliate_conversions (
  conversion_id VARCHAR(120) COLLATE utf8mb4_bin PRIMARY KEY,
  attribution_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  affiliate_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  program_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  order_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL UNIQUE,
  payment_reference VARCHAR(180) COLLATE utf8mb4_bin NOT NULL,
  financial_evidence_digest BINARY(32) NOT NULL,
  eligible_revenue_minor BIGINT UNSIGNED NOT NULL,
  currency CHAR(3) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  payment_confirmed_at DATETIME(3) NOT NULL,
  service_occurred_at DATETIME(3) NULL,
  conversion_kind ENUM('initial_purchase') NOT NULL,
  policy_version VARCHAR(80) COLLATE utf8mb4_bin NOT NULL,
  created_at DATETIME(3) NOT NULL,
  CONSTRAINT fk_affiliate_conversion_attribution FOREIGN KEY (attribution_id)
    REFERENCES affiliate_attributions(attribution_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_affiliate_conversion_amount CHECK (eligible_revenue_minor <= 9007199254740991),
  INDEX idx_affiliate_conversion_affiliate (affiliate_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS affiliate_entitlements (
  entitlement_id VARCHAR(120) COLLATE utf8mb4_bin PRIMARY KEY,
  conversion_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL UNIQUE,
  affiliate_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  program_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  attribution_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  revision INT UNSIGNED NOT NULL,
  status ENUM('pending','earned','cancelled','reversed','disputed') NOT NULL,
  disputed_from ENUM('pending','earned') NULL,
  eligible_revenue_minor BIGINT UNSIGNED NOT NULL,
  commission_minor BIGINT UNSIGNED NOT NULL,
  currency CHAR(3) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  rate_basis_points SMALLINT UNSIGNED NOT NULL,
  policy_version VARCHAR(80) COLLATE utf8mb4_bin NOT NULL,
  maturity_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  CONSTRAINT fk_affiliate_entitlement_conversion FOREIGN KEY (conversion_id)
    REFERENCES affiliate_conversions(conversion_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_affiliate_entitlement_rate CHECK (rate_basis_points <= 10000),
  CONSTRAINT chk_affiliate_entitlement_amounts CHECK (eligible_revenue_minor <= 9007199254740991 AND commission_minor <= 9007199254740991),
  INDEX idx_affiliate_entitlement_status (status, maturity_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS affiliate_entitlement_revisions (
  entitlement_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  revision INT UNSIGNED NOT NULL,
  status ENUM('pending','earned','cancelled','reversed','disputed') NOT NULL,
  disputed_from ENUM('pending','earned') NULL,
  eligible_revenue_minor BIGINT UNSIGNED NOT NULL,
  commission_minor BIGINT UNSIGNED NOT NULL,
  currency CHAR(3) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  reason VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  occurred_at DATETIME(3) NOT NULL,
  PRIMARY KEY (entitlement_id, revision),
  CONSTRAINT fk_affiliate_revision_entitlement FOREIGN KEY (entitlement_id)
    REFERENCES affiliate_entitlements(entitlement_id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS affiliate_idempotency_claims (
  idempotency_key VARCHAR(220) COLLATE utf8mb4_bin PRIMARY KEY,
  semantic_digest BINARY(32) NOT NULL,
  outcome_json JSON NULL,
  created_at DATETIME(3) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS affiliate_audit_events (
  audit_id VARCHAR(120) COLLATE utf8mb4_bin PRIMARY KEY,
  operation VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  contract_version INT UNSIGNED NOT NULL,
  actor_kind VARCHAR(40) COLLATE utf8mb4_bin NOT NULL,
  actor_reference VARCHAR(180) COLLATE utf8mb4_bin NOT NULL,
  authorization_decision_reference VARCHAR(180) COLLATE utf8mb4_bin NOT NULL,
  affiliate_id VARCHAR(120) COLLATE utf8mb4_bin NULL,
  subject_reference VARCHAR(180) COLLATE utf8mb4_bin NULL,
  policy_version VARCHAR(80) COLLATE utf8mb4_bin NOT NULL,
  before_digest BINARY(32) NULL,
  after_digest BINARY(32) NULL,
  idempotency_digest BINARY(32) NOT NULL,
  correlation_id VARCHAR(180) COLLATE utf8mb4_bin NOT NULL,
  causation_id VARCHAR(180) COLLATE utf8mb4_bin NULL,
  occurred_at DATETIME(3) NOT NULL,
  outcome ENUM('accepted','rejected','replayed') NOT NULL,
  reason VARCHAR(180) COLLATE utf8mb4_bin NOT NULL,
  INDEX idx_affiliate_audit_operation (operation, occurred_at),
  INDEX idx_affiliate_audit_subject (subject_reference, occurred_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS affiliate_materialization_requests (
  request_id VARCHAR(120) COLLATE utf8mb4_bin PRIMARY KEY,
  entitlement_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  entitlement_revision INT UNSIGNED NOT NULL,
  affiliate_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  conversion_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  policy_version VARCHAR(80) COLLATE utf8mb4_bin NOT NULL,
  entitlement_digest BINARY(32) NOT NULL,
  correlation_id VARCHAR(180) COLLATE utf8mb4_bin NOT NULL,
  state ENUM('pending','accepted','rejected') NOT NULL,
  financial_reference VARCHAR(180) COLLATE utf8mb4_bin NULL,
  rejection_code VARCHAR(120) COLLATE utf8mb4_bin NULL,
  retryable TINYINT(1) NOT NULL DEFAULT 0,
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  UNIQUE KEY uq_affiliate_materialization_entitlement_revision (entitlement_id, entitlement_revision),
  INDEX idx_affiliate_materialization_state (state, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS affiliate_outbox_events (
  event_id VARCHAR(120) COLLATE utf8mb4_bin PRIMARY KEY,
  event_type VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  aggregate_type VARCHAR(80) COLLATE utf8mb4_bin NOT NULL,
  aggregate_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  contract_version INT UNSIGNED NOT NULL,
  payload_json JSON NOT NULL,
  status ENUM('pending','dispatched','failed') NOT NULL,
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  available_at DATETIME(3) NOT NULL,
  dispatched_at DATETIME(3) NULL,
  last_error VARCHAR(255) COLLATE utf8mb4_bin NULL,
  created_at DATETIME(3) NOT NULL,
  UNIQUE KEY uq_affiliate_outbox_aggregate_event (event_type, aggregate_id),
  INDEX idx_affiliate_outbox_delivery (status, available_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS affiliate_privacy_requests (
  request_id VARCHAR(120) COLLATE utf8mb4_bin PRIMARY KEY,
  affiliate_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  request_kind ENUM('dsr','anonymization','retention_purge') NOT NULL,
  status ENUM('requested','completed','blocked_legal_hold','rejected') NOT NULL,
  requested_by VARCHAR(180) COLLATE utf8mb4_bin NOT NULL,
  reason VARCHAR(255) COLLATE utf8mb4_bin NOT NULL,
  requested_at DATETIME(3) NOT NULL,
  completed_at DATETIME(3) NULL,
  INDEX idx_affiliate_privacy_status (affiliate_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS affiliate_legal_holds (
  hold_id VARCHAR(120) COLLATE utf8mb4_bin PRIMARY KEY,
  affiliate_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  reason VARCHAR(255) COLLATE utf8mb4_bin NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_by VARCHAR(180) COLLATE utf8mb4_bin NOT NULL,
  created_at DATETIME(3) NOT NULL,
  released_at DATETIME(3) NULL,
  released_by VARCHAR(180) COLLATE utf8mb4_bin NULL,
  INDEX idx_affiliate_legal_hold_active (affiliate_id, active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;
