export const commerceRestaurantReservationSchemaSql = `
CREATE TABLE IF NOT EXISTS commerce_restaurant_slots (
  slot_id VARCHAR(120) COLLATE utf8mb4_bin PRIMARY KEY,
  business_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  place_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  destination_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  service_date DATE NOT NULL,
  starts_at DATETIME(3) NOT NULL,
  ends_at DATETIME(3) NOT NULL,
  seating_area VARCHAR(80) NULL,
  capacity INT UNSIGNED NOT NULL,
  min_party_size SMALLINT UNSIGNED NOT NULL,
  max_party_size SMALLINT UNSIGNED NOT NULL,
  minimum_lead_minutes INT UNSIGNED NOT NULL,
  maximum_advance_days SMALLINT UNSIGNED NOT NULL,
  hold_duration_seconds SMALLINT UNSIGNED NOT NULL,
  deposit_kind ENUM('none','required') NOT NULL,
  deposit_amount_minor BIGINT UNSIGNED NULL,
  deposit_currency CHAR(3) CHARACTER SET ascii COLLATE ascii_bin NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  CONSTRAINT chk_commerce_restaurant_slot_capacity
    CHECK (capacity BETWEEN 1 AND 500),
  CONSTRAINT chk_commerce_restaurant_slot_party
    CHECK (
      min_party_size BETWEEN 1 AND 30
      AND max_party_size BETWEEN min_party_size AND 30
      AND max_party_size <= capacity
    ),
  CONSTRAINT chk_commerce_restaurant_slot_hold
    CHECK (hold_duration_seconds BETWEEN 60 AND 3600),
  CONSTRAINT chk_commerce_restaurant_slot_window
    CHECK (starts_at < ends_at),
  CONSTRAINT chk_commerce_restaurant_slot_deposit
    CHECK (
      (deposit_kind = 'none'
        AND deposit_amount_minor IS NULL
        AND deposit_currency IS NULL)
      OR
      (deposit_kind = 'required'
        AND deposit_amount_minor BETWEEN 1 AND 9007199254740991
        AND deposit_currency IS NOT NULL)
    ),
  INDEX idx_commerce_restaurant_slot_lookup (
    business_id, place_id, service_date, starts_at, enabled
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS commerce_restaurant_reservations (
  reservation_id VARCHAR(120) COLLATE utf8mb4_bin PRIMARY KEY,
  request_key VARCHAR(160) COLLATE utf8mb4_bin NOT NULL UNIQUE,
  slot_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  business_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  place_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  destination_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  service_date DATE NOT NULL,
  starts_at DATETIME(3) NOT NULL,
  ends_at DATETIME(3) NOT NULL,
  party_size SMALLINT UNSIGNED NOT NULL,
  seating_area VARCHAR(80) NULL,
  notes VARCHAR(500) NULL,
  holder_reference VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  status ENUM(
    'held',
    'pending_confirmation',
    'confirmed',
    'cancelled',
    'completed',
    'no_show',
    'expired'
  ) NOT NULL,
  deposit_kind ENUM('none','required') NOT NULL,
  deposit_amount_minor BIGINT UNSIGNED NULL,
  deposit_currency CHAR(3) CHARACTER SET ascii COLLATE ascii_bin NULL,
  hold_expires_at DATETIME(3) NULL,
  order_id VARCHAR(120) COLLATE utf8mb4_bin NULL,
  payment_id VARCHAR(120) COLLATE utf8mb4_bin NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  CONSTRAINT fk_commerce_restaurant_reservation_slot
    FOREIGN KEY (slot_id)
    REFERENCES commerce_restaurant_slots(slot_id)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT,
  CONSTRAINT chk_commerce_restaurant_reservation_party
    CHECK (party_size BETWEEN 1 AND 30),
  CONSTRAINT chk_commerce_restaurant_reservation_deposit
    CHECK (
      (deposit_kind = 'none'
        AND deposit_amount_minor IS NULL
        AND deposit_currency IS NULL
        AND order_id IS NULL
        AND payment_id IS NULL)
      OR
      (deposit_kind = 'required'
        AND deposit_amount_minor BETWEEN 1 AND 9007199254740991
        AND deposit_currency IS NOT NULL
        AND (
          (status IN ('held','expired')
            AND order_id IS NULL
            AND payment_id IS NULL)
          OR
          (status IN ('confirmed','completed','no_show')
            AND order_id IS NOT NULL
            AND payment_id IS NOT NULL)
          OR
          (status = 'cancelled'
            AND (
              (order_id IS NULL AND payment_id IS NULL)
              OR
              (order_id IS NOT NULL AND payment_id IS NOT NULL)
            ))
        ))
    ),
  CONSTRAINT chk_commerce_restaurant_reservation_hold
    CHECK (
      status NOT IN ('held','pending_confirmation')
      OR hold_expires_at IS NOT NULL
    ),
  INDEX idx_commerce_restaurant_reservation_capacity (
    slot_id, status, hold_expires_at
  ),
  INDEX idx_commerce_restaurant_reservation_holder (
    holder_reference, created_at
  ),
  INDEX idx_commerce_restaurant_reservation_business (
    business_id, service_date, starts_at
  ),
  INDEX idx_commerce_restaurant_reservation_payment (payment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS commerce_restaurant_reservation_events (
  event_id VARCHAR(120) COLLATE utf8mb4_bin PRIMARY KEY,
  reservation_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  slot_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  business_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  event_type ENUM(
    'held',
    'pending_confirmation',
    'confirmed',
    'cancelled',
    'completed',
    'no_show',
    'expired'
  ) NOT NULL,
  actor_reference VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  occurred_at DATETIME(3) NOT NULL,
  recorded_at DATETIME(3) NOT NULL,
  CONSTRAINT fk_commerce_restaurant_event_reservation
    FOREIGN KEY (reservation_id)
    REFERENCES commerce_restaurant_reservations(reservation_id)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT,
  CONSTRAINT fk_commerce_restaurant_event_slot
    FOREIGN KEY (slot_id)
    REFERENCES commerce_restaurant_slots(slot_id)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT,
  INDEX idx_commerce_restaurant_event_reservation (
    reservation_id, occurred_at
  ),
  INDEX idx_commerce_restaurant_event_business (
    business_id, occurred_at
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

export const commerceRestaurantReservationRollbackSql = `
DROP TABLE IF EXISTS commerce_restaurant_reservation_events;
DROP TABLE IF EXISTS commerce_restaurant_reservations;
DROP TABLE IF EXISTS commerce_restaurant_slots;
`;
