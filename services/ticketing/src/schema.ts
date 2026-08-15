export const ticketingM147SchemaSql = `
CREATE TABLE IF NOT EXISTS ticketing_tickets (
  ticket_id VARCHAR(120) COLLATE utf8mb4_bin PRIMARY KEY,
  order_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  payment_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  destination_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  product_kind ENUM('tour','business_experience') NOT NULL,
  product_reference VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  holder_name VARCHAR(160) NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  amount_minor BIGINT UNSIGNED NOT NULL,
  currency CHAR(3) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  code VARCHAR(24) COLLATE utf8mb4_bin NOT NULL UNIQUE,
  status ENUM('issued','validated','used','cancelled') NOT NULL,
  issued_at DATETIME(3) NOT NULL,
  validated_at DATETIME(3) NULL,
  used_at DATETIME(3) NULL,
  cancelled_at DATETIME(3) NULL,
  updated_at DATETIME(3) NOT NULL,
  CONSTRAINT chk_ticketing_quantity CHECK (quantity > 0 AND quantity <= 20),
  CONSTRAINT chk_ticketing_amount_safe CHECK (amount_minor > 0 AND amount_minor <= 9007199254740991),
  INDEX idx_ticketing_tickets_order (order_id),
  INDEX idx_ticketing_tickets_payment (payment_id),
  INDEX idx_ticketing_tickets_destination (destination_id, product_kind, product_reference),
  INDEX idx_ticketing_tickets_status (status, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ticketing_checkins (
  checkin_id VARCHAR(120) COLLATE utf8mb4_bin PRIMARY KEY,
  ticket_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  result ENUM('validated','used','cancelled') NOT NULL,
  channel ENUM('online','offline_sync') NOT NULL,
  operator_reference VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  occurred_at DATETIME(3) NOT NULL,
  recorded_at DATETIME(3) NOT NULL,
  CONSTRAINT fk_ticketing_checkins_ticket
    FOREIGN KEY (ticket_id)
    REFERENCES ticketing_tickets(ticket_id)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT,
  INDEX idx_ticketing_checkins_ticket (ticket_id, occurred_at),
  INDEX idx_ticketing_checkins_recorded (recorded_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ticketing_offline_envelopes (
  envelope_id VARCHAR(120) COLLATE utf8mb4_bin PRIMARY KEY,
  ticket_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  operation ENUM('validate','use','cancel') NOT NULL,
  payload VARCHAR(400) COLLATE utf8mb4_bin NOT NULL,
  signature CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  queued_at DATETIME(3) NOT NULL,
  synced_at DATETIME(3) NULL,
  checkin_id VARCHAR(120) COLLATE utf8mb4_bin NULL,
  CONSTRAINT fk_ticketing_offline_ticket
    FOREIGN KEY (ticket_id)
    REFERENCES ticketing_tickets(ticket_id)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT,
  CONSTRAINT fk_ticketing_offline_checkin
    FOREIGN KEY (checkin_id)
    REFERENCES ticketing_checkins(checkin_id)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT,
  UNIQUE KEY uq_ticketing_offline_signature (signature),
  INDEX idx_ticketing_offline_ticket (ticket_id, queued_at),
  INDEX idx_ticketing_offline_synced (synced_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;
