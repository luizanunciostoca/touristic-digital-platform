export const orderingM137SchemaSql = `
CREATE TABLE IF NOT EXISTS ordering_orders (
  order_id VARCHAR(120) PRIMARY KEY,
  request_key VARCHAR(220) NOT NULL UNIQUE,
  source_kind VARCHAR(40) NOT NULL,
  source_reference VARCHAR(120) NOT NULL,
  status VARCHAR(40) NOT NULL,
  plan_id VARCHAR(80) NOT NULL,
  plan_name VARCHAR(160) NOT NULL,
  amount_minor BIGINT UNSIGNED NOT NULL,
  currency CHAR(3) NOT NULL,
  pricing_version VARCHAR(80) NOT NULL,
  pricing_captured_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  INDEX idx_ordering_orders_status (status),
  INDEX idx_ordering_orders_source (source_kind, source_reference)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;
