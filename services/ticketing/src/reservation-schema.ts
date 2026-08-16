export const ticketingM150ReservationSchemaSql = `
CREATE TABLE IF NOT EXISTS ticketing_inventory (
  inventory_id VARCHAR(120) COLLATE utf8mb4_bin PRIMARY KEY,
  destination_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  product_kind ENUM('tour','business_experience') NOT NULL,
  product_reference VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  label VARCHAR(160) NOT NULL,
  unit_amount_minor BIGINT UNSIGNED NOT NULL,
  currency CHAR(3) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  pricing_version VARCHAR(80) COLLATE utf8mb4_bin NOT NULL,
  capacity INT UNSIGNED NOT NULL,
  max_per_reservation INT UNSIGNED NOT NULL,
  sales_start_at DATETIME(3) NOT NULL,
  sales_end_at DATETIME(3) NOT NULL,
  starts_at DATETIME(3) NOT NULL,
  ends_at DATETIME(3) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  CONSTRAINT chk_ticketing_inventory_capacity CHECK (capacity > 0 AND capacity <= 100000),
  CONSTRAINT chk_ticketing_inventory_max_per_reservation CHECK (
    max_per_reservation > 0 AND max_per_reservation <= 20 AND max_per_reservation <= capacity
  ),
  CONSTRAINT chk_ticketing_inventory_amount_safe CHECK (
    unit_amount_minor > 0 AND unit_amount_minor <= 9007199254740991
  ),
  CONSTRAINT chk_ticketing_inventory_windows CHECK (
    sales_start_at < sales_end_at AND sales_end_at <= starts_at AND starts_at < ends_at
  ),
  INDEX idx_ticketing_inventory_product (
    destination_id, product_kind, product_reference, starts_at
  ),
  INDEX idx_ticketing_inventory_sellable (enabled, sales_start_at, sales_end_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ticketing_reservations (
  reservation_id VARCHAR(120) COLLATE utf8mb4_bin PRIMARY KEY,
  request_key VARCHAR(260) COLLATE utf8mb4_bin NOT NULL UNIQUE,
  inventory_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  destination_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  product_kind ENUM('tour','business_experience') NOT NULL,
  product_reference VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  holder_reference VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  status ENUM('held','confirmed','expired','cancelled') NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  order_id VARCHAR(120) COLLATE utf8mb4_bin NULL,
  payment_id VARCHAR(120) COLLATE utf8mb4_bin NULL,
  created_at DATETIME(3) NOT NULL,
  confirmed_at DATETIME(3) NULL,
  expired_at DATETIME(3) NULL,
  cancelled_at DATETIME(3) NULL,
  updated_at DATETIME(3) NOT NULL,
  CONSTRAINT fk_ticketing_reservations_inventory
    FOREIGN KEY (inventory_id)
    REFERENCES ticketing_inventory(inventory_id)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT,
  CONSTRAINT chk_ticketing_reservation_quantity CHECK (quantity > 0 AND quantity <= 20),
  CONSTRAINT chk_ticketing_reservation_terminal_state CHECK (
    (status = 'held' AND order_id IS NULL AND payment_id IS NULL AND confirmed_at IS NULL AND expired_at IS NULL AND cancelled_at IS NULL)
    OR
    (status = 'confirmed' AND order_id IS NOT NULL AND payment_id IS NOT NULL AND confirmed_at IS NOT NULL AND expired_at IS NULL AND cancelled_at IS NULL)
    OR
    (status = 'expired' AND order_id IS NULL AND payment_id IS NULL AND confirmed_at IS NULL AND expired_at IS NOT NULL AND cancelled_at IS NULL)
    OR
    (status = 'cancelled' AND order_id IS NULL AND payment_id IS NULL AND confirmed_at IS NULL AND expired_at IS NULL AND cancelled_at IS NOT NULL)
  ),
  INDEX idx_ticketing_reservations_inventory_status (
    inventory_id, status, expires_at
  ),
  INDEX idx_ticketing_reservations_order (order_id),
  INDEX idx_ticketing_reservations_payment (payment_id),
  INDEX idx_ticketing_reservations_holder (holder_reference, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ticketing_reservation_events (
  event_id VARCHAR(120) COLLATE utf8mb4_bin PRIMARY KEY,
  reservation_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  inventory_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  event_type ENUM('held','confirmed','expired','cancelled') NOT NULL,
  request_key VARCHAR(260) COLLATE utf8mb4_bin NOT NULL,
  actor_reference VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  occurred_at DATETIME(3) NOT NULL,
  recorded_at DATETIME(3) NOT NULL,
  CONSTRAINT fk_ticketing_reservation_events_reservation
    FOREIGN KEY (reservation_id)
    REFERENCES ticketing_reservations(reservation_id)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT,
  CONSTRAINT fk_ticketing_reservation_events_inventory
    FOREIGN KEY (inventory_id)
    REFERENCES ticketing_inventory(inventory_id)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT,
  INDEX idx_ticketing_reservation_events_reservation (
    reservation_id, occurred_at
  ),
  INDEX idx_ticketing_reservation_events_inventory (
    inventory_id, occurred_at
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;
