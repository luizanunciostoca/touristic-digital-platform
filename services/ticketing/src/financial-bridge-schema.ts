export const ticketingFinancialBridgeSchemaSql = `
ALTER TABLE ticketing_reservations
  DROP CHECK chk_ticketing_reservation_terminal_state;

ALTER TABLE ticketing_reservations
  ADD CONSTRAINT chk_ticketing_reservation_terminal_state CHECK (
    (status = 'held' AND order_id IS NULL AND payment_id IS NULL AND confirmed_at IS NULL AND expired_at IS NULL AND cancelled_at IS NULL)
    OR
    (status = 'confirmed' AND order_id IS NOT NULL AND payment_id IS NOT NULL AND confirmed_at IS NOT NULL AND expired_at IS NULL AND cancelled_at IS NULL)
    OR
    (status = 'expired' AND order_id IS NULL AND payment_id IS NULL AND confirmed_at IS NULL AND expired_at IS NOT NULL AND cancelled_at IS NULL)
    OR
    (status = 'cancelled' AND expired_at IS NULL AND cancelled_at IS NOT NULL AND (
      (order_id IS NULL AND payment_id IS NULL AND confirmed_at IS NULL)
      OR
      (order_id IS NOT NULL AND payment_id IS NOT NULL AND confirmed_at IS NOT NULL AND cancelled_at >= confirmed_at)
    ))
  );

CREATE TABLE IF NOT EXISTS ticketing_financial_result_cursor (
  consumer_name VARCHAR(100) COLLATE utf8mb4_bin PRIMARY KEY,
  recorded_at DATETIME(3) NOT NULL,
  result_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  updated_at DATETIME(3) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

export const ticketingFinancialBridgeRollbackSql = `
DELETE FROM ticketing_financial_result_cursor;
DROP TABLE IF EXISTS ticketing_financial_result_cursor;
ALTER TABLE ticketing_reservations
  DROP CHECK chk_ticketing_reservation_terminal_state;
ALTER TABLE ticketing_reservations
  ADD CONSTRAINT chk_ticketing_reservation_terminal_state CHECK (
    (status = 'held' AND order_id IS NULL AND payment_id IS NULL AND confirmed_at IS NULL AND expired_at IS NULL AND cancelled_at IS NULL)
    OR
    (status = 'confirmed' AND order_id IS NOT NULL AND payment_id IS NOT NULL AND confirmed_at IS NOT NULL AND expired_at IS NULL AND cancelled_at IS NULL)
    OR
    (status = 'expired' AND order_id IS NULL AND payment_id IS NULL AND confirmed_at IS NULL AND expired_at IS NOT NULL AND cancelled_at IS NULL)
    OR
    (status = 'cancelled' AND order_id IS NULL AND payment_id IS NULL AND confirmed_at IS NULL AND expired_at IS NULL AND cancelled_at IS NOT NULL)
  );
`;
