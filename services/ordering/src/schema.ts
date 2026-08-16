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

export const orderingM151SchemaSql = `
CREATE TABLE IF NOT EXISTS ordering_subscriptions (
  subscription_id VARCHAR(120) COLLATE utf8mb4_bin PRIMARY KEY,
  status ENUM('active','cancel_at_period_end','past_due','cancelled') NOT NULL,
  current_period_number INT UNSIGNED NOT NULL,
  current_period_start_at DATETIME(3) NOT NULL,
  current_period_end_at DATETIME(3) NOT NULL,
  current_order_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  current_payment_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  current_verified_result_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  plan_id VARCHAR(80) COLLATE utf8mb4_bin NOT NULL,
  plan_name VARCHAR(160) NOT NULL,
  amount_minor BIGINT UNSIGNED NOT NULL,
  currency CHAR(3) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  pricing_version VARCHAR(80) COLLATE utf8mb4_bin NOT NULL,
  pricing_captured_at DATETIME(3) NOT NULL,
  cancellation_requested_at DATETIME(3) NULL,
  cancelled_at DATETIME(3) NULL,
  past_due_period_number INT UNSIGNED NULL,
  past_due_order_id VARCHAR(120) COLLATE utf8mb4_bin NULL,
  past_due_payment_id VARCHAR(120) COLLATE utf8mb4_bin NULL,
  past_due_verified_result_id VARCHAR(120) COLLATE utf8mb4_bin NULL,
  past_due_kind ENUM('failed','cancelled','expired') NULL,
  past_due_occurred_at DATETIME(3) NULL,
  past_due_recorded_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  CONSTRAINT chk_ordering_subscription_period_number CHECK (current_period_number >= 1),
  CONSTRAINT chk_ordering_subscription_period_range CHECK (current_period_end_at > current_period_start_at),
  CONSTRAINT chk_ordering_subscription_amount_safe CHECK (amount_minor <= 9007199254740991),
  CONSTRAINT chk_ordering_subscription_cancellation_state CHECK (
    (status IN ('cancel_at_period_end','cancelled') AND cancellation_requested_at IS NOT NULL)
    OR (status IN ('active','past_due') AND cancellation_requested_at IS NULL)
  ),
  CONSTRAINT chk_ordering_subscription_cancelled_state CHECK (
    (status = 'cancelled' AND cancelled_at = current_period_end_at)
    OR (status <> 'cancelled' AND cancelled_at IS NULL)
  ),
  CONSTRAINT chk_ordering_subscription_past_due_state CHECK (
    (
      status = 'past_due'
      AND past_due_period_number IS NOT NULL
      AND past_due_order_id IS NOT NULL
      AND past_due_payment_id IS NOT NULL
      AND past_due_verified_result_id IS NOT NULL
      AND past_due_kind IS NOT NULL
      AND past_due_occurred_at IS NOT NULL
      AND past_due_recorded_at IS NOT NULL
    )
    OR (
      status <> 'past_due'
      AND past_due_period_number IS NULL
      AND past_due_order_id IS NULL
      AND past_due_payment_id IS NULL
      AND past_due_verified_result_id IS NULL
      AND past_due_kind IS NULL
      AND past_due_occurred_at IS NULL
      AND past_due_recorded_at IS NULL
    )
  ),
  CONSTRAINT fk_ordering_subscription_current_order
    FOREIGN KEY (current_order_id)
    REFERENCES ordering_orders(order_id)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT,
  CONSTRAINT fk_ordering_subscription_past_due_order
    FOREIGN KEY (past_due_order_id)
    REFERENCES ordering_orders(order_id)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT,
  INDEX idx_ordering_subscriptions_status_end (status, current_period_end_at),
  INDEX idx_ordering_subscriptions_current_order (current_order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ordering_subscription_renewal_intents (
  request_key VARCHAR(180) COLLATE utf8mb4_bin PRIMARY KEY,
  subscription_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  period_number INT UNSIGNED NOT NULL,
  order_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL UNIQUE,
  due_at DATETIME(3) NOT NULL,
  period_start_at DATETIME(3) NOT NULL,
  period_end_at DATETIME(3) NOT NULL,
  plan_id VARCHAR(80) COLLATE utf8mb4_bin NOT NULL,
  plan_name VARCHAR(160) NOT NULL,
  amount_minor BIGINT UNSIGNED NOT NULL,
  currency CHAR(3) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  pricing_version VARCHAR(80) COLLATE utf8mb4_bin NOT NULL,
  pricing_captured_at DATETIME(3) NOT NULL,
  prepared_at DATETIME(3) NOT NULL,
  CONSTRAINT uq_ordering_subscription_period UNIQUE (subscription_id, period_number),
  CONSTRAINT chk_ordering_subscription_renewal_period CHECK (period_number >= 2),
  CONSTRAINT chk_ordering_subscription_renewal_due CHECK (due_at = period_start_at),
  CONSTRAINT chk_ordering_subscription_renewal_range CHECK (period_end_at > period_start_at),
  CONSTRAINT chk_ordering_subscription_renewal_prepared CHECK (prepared_at >= due_at),
  CONSTRAINT chk_ordering_subscription_renewal_amount_safe CHECK (amount_minor <= 9007199254740991),
  CONSTRAINT fk_ordering_subscription_renewal_subscription
    FOREIGN KEY (subscription_id)
    REFERENCES ordering_subscriptions(subscription_id)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT,
  CONSTRAINT fk_ordering_subscription_renewal_order
    FOREIGN KEY (order_id)
    REFERENCES ordering_orders(order_id)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT,
  INDEX idx_ordering_subscription_renewal_due (due_at),
  INDEX idx_ordering_subscription_renewal_subscription (subscription_id, period_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;
