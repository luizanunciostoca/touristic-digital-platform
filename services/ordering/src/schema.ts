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
