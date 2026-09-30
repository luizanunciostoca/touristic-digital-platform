export const growthEventFabricSchemaSql = `
CREATE TABLE IF NOT EXISTS growth_outbox_events (
  event_id VARCHAR(120) COLLATE utf8mb4_bin PRIMARY KEY,
  event_type VARCHAR(160) COLLATE utf8mb4_bin NOT NULL,
  aggregate_type VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  aggregate_id VARCHAR(180) COLLATE utf8mb4_bin NOT NULL,
  contract_version INT UNSIGNED NOT NULL,
  payload_json JSON NOT NULL,
  correlation_id VARCHAR(180) COLLATE utf8mb4_bin NOT NULL,
  causation_id VARCHAR(180) COLLATE utf8mb4_bin NULL,
  status ENUM('pending','dispatching','delivered','dead_letter') NOT NULL,
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  available_at DATETIME(3) NOT NULL,
  leased_by VARCHAR(160) COLLATE utf8mb4_bin NULL,
  lease_expires_at DATETIME(3) NULL,
  delivered_at DATETIME(3) NULL,
  last_error_code VARCHAR(160) COLLATE utf8mb4_bin NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  INDEX idx_growth_outbox_dispatch (status, available_at),
  INDEX idx_growth_outbox_lease (status, lease_expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS growth_consumer_claims (
  consumer_name VARCHAR(160) COLLATE utf8mb4_bin NOT NULL,
  event_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  semantic_digest BINARY(32) NOT NULL,
  claimed_at DATETIME(3) NOT NULL,
  PRIMARY KEY (consumer_name, event_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS growth_dead_letters (
  dead_letter_id VARCHAR(120) COLLATE utf8mb4_bin PRIMARY KEY,
  event_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  consumer_name VARCHAR(160) COLLATE utf8mb4_bin NULL,
  error_code VARCHAR(160) COLLATE utf8mb4_bin NOT NULL,
  payload_digest BINARY(32) NOT NULL,
  attempts INT UNSIGNED NOT NULL,
  failed_at DATETIME(3) NOT NULL,
  replayed_at DATETIME(3) NULL,
  UNIQUE KEY uq_growth_dead_letter_event_consumer (event_id, consumer_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;
