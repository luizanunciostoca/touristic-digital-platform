export const orderingTicketingReservationSchemaSql = `
CREATE TABLE IF NOT EXISTS ordering_ticketing_reservation_bindings (
  reservation_reference VARCHAR(120) COLLATE utf8mb4_bin PRIMARY KEY,
  order_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL UNIQUE,
  product_reference VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  quantity SMALLINT UNSIGNED NOT NULL,
  amount_minor BIGINT UNSIGNED NOT NULL,
  currency CHAR(3) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  pricing_version VARCHAR(80) COLLATE utf8mb4_bin NOT NULL,
  bound_at DATETIME(3) NOT NULL,
  CONSTRAINT chk_ordering_ticketing_quantity CHECK (quantity BETWEEN 1 AND 20),
  CONSTRAINT chk_ordering_ticketing_amount_safe CHECK (amount_minor BETWEEN 1 AND 9007199254740991),
  CONSTRAINT fk_ordering_ticketing_order
    FOREIGN KEY (order_id)
    REFERENCES ordering_orders(order_id)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT,
  INDEX idx_ordering_ticketing_product (product_reference),
  INDEX idx_ordering_ticketing_bound_at (bound_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;
