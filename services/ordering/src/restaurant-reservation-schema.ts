export const orderingRestaurantReservationSchemaSql = `
ALTER TABLE ordering_orders
  MODIFY source_kind ENUM('business_onboarding','ticketing_reservation','restaurant_reservation') NOT NULL;

CREATE TABLE IF NOT EXISTS ordering_restaurant_reservation_bindings (
  reservation_reference VARCHAR(120) COLLATE utf8mb4_bin PRIMARY KEY,
  order_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL UNIQUE,
  business_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  amount_minor BIGINT UNSIGNED NOT NULL,
  currency CHAR(3) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  pricing_version VARCHAR(80) COLLATE utf8mb4_bin NOT NULL,
  bound_at DATETIME(3) NOT NULL,
  CONSTRAINT chk_ordering_restaurant_amount_safe
    CHECK (amount_minor BETWEEN 1 AND 9007199254740991),
  CONSTRAINT fk_ordering_restaurant_order
    FOREIGN KEY (order_id)
    REFERENCES ordering_orders(order_id)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT,
  INDEX idx_ordering_restaurant_business (business_id, bound_at),
  INDEX idx_ordering_restaurant_bound_at (bound_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

export const orderingRestaurantReservationRollbackSql = `
DROP TABLE IF EXISTS ordering_restaurant_reservation_bindings;
`;
