export const notificationsSchemaSql = `
CREATE TABLE IF NOT EXISTS notification_outbox (
  tenant_id VARCHAR(160) COLLATE utf8mb4_bin NOT NULL,
  outbox_id VARCHAR(160) COLLATE utf8mb4_bin NOT NULL,
  idempotency_key VARCHAR(200) COLLATE utf8mb4_bin NOT NULL,
  destination_id VARCHAR(160) COLLATE utf8mb4_bin NOT NULL,
  source_event_id VARCHAR(160) COLLATE utf8mb4_bin NOT NULL,
  deliver_at DATETIME(3) NOT NULL,
  available_at DATETIME(3) NOT NULL,
  status VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  lease_token CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  lease_until DATETIME(3) NULL,
  request_json JSON NOT NULL,
  terminal_result_json JSON NULL,
  last_error VARCHAR(200) NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  completed_at DATETIME(3) NULL,
  PRIMARY KEY (tenant_id, outbox_id),
  UNIQUE KEY uq_notification_outbox_tenant_idempotency (
    tenant_id,
    idempotency_key
  ),
  INDEX idx_notification_outbox_due (
    status,
    available_at,
    lease_until
  ),
  INDEX idx_notification_outbox_tenant_status (
    tenant_id,
    status,
    updated_at
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notification_preferences (
  destination_id VARCHAR(160) COLLATE utf8mb4_bin NOT NULL,
  recipient_reference VARCHAR(160) COLLATE utf8mb4_bin NOT NULL,
  topic VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  channel VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  allowed TINYINT(1) NOT NULL DEFAULT 0,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (destination_id, recipient_reference, topic, channel),
  INDEX idx_notification_preferences_recipient (
    destination_id,
    recipient_reference,
    updated_at
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notification_dispatch_claims (
  idempotency_key VARCHAR(200) COLLATE utf8mb4_bin NOT NULL,
  claimed_at DATETIME(3) NOT NULL,
  PRIMARY KEY (idempotency_key),
  INDEX idx_notification_dispatch_claims_claimed_at (claimed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;
