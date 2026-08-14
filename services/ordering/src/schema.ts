export const orderingM137SchemaSql = `
CREATE TABLE IF NOT EXISTS ordering_orders (
  order_id VARCHAR(120) COLLATE utf8mb4_bin PRIMARY KEY,
  request_key VARCHAR(220) COLLATE utf8mb4_bin NOT NULL UNIQUE,
  source_kind ENUM('business_onboarding') NOT NULL,
  source_reference VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  status ENUM('draft','pending_payment','payment_confirmed','cancelled') NOT NULL,
  plan_id VARCHAR(80) COLLATE utf8mb4_bin NOT NULL,
  plan_name VARCHAR(160) NOT NULL,
  amount_minor BIGINT UNSIGNED NOT NULL,
  currency CHAR(3) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  pricing_version VARCHAR(80) COLLATE utf8mb4_bin NOT NULL,
  pricing_captured_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  CONSTRAINT chk_ordering_amount_safe CHECK (amount_minor <= 9007199254740991),
  INDEX idx_ordering_orders_status (status),
  INDEX idx_ordering_orders_source (source_kind, source_reference)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

export const orderingM139SchemaSql = `
CREATE TABLE IF NOT EXISTS ordering_checkout_access (
  order_id VARCHAR(120) COLLATE utf8mb4_bin PRIMARY KEY,
  payment_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL UNIQUE,
  request_fingerprint BINARY(32) NOT NULL,
  token_hash BINARY(32) NOT NULL UNIQUE,
  requester_kind ENUM('authenticated','guest_capability') NOT NULL,
  actor_subject VARCHAR(160) COLLATE utf8mb4_bin NOT NULL,
  destination_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  tenant_id VARCHAR(120) COLLATE utf8mb4_bin NULL,
  correlation_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  created_at DATETIME(3) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  CONSTRAINT chk_ordering_checkout_access_expiry CHECK (expires_at > created_at),
  CONSTRAINT fk_ordering_checkout_access_order
    FOREIGN KEY (order_id)
    REFERENCES ordering_orders(order_id)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT,
  INDEX idx_ordering_checkout_access_expiry (expires_at),
  INDEX idx_ordering_checkout_access_context (destination_id, tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;
