export const analyticsSchemaSql = `
CREATE TABLE IF NOT EXISTS analytics_events (
  event_id VARCHAR(160) COLLATE utf8mb4_bin PRIMARY KEY,
  schema_version CHAR(1) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  event_name VARCHAR(80) COLLATE utf8mb4_bin NOT NULL,
  occurred_at DATETIME(3) NOT NULL,
  session_id VARCHAR(160) COLLATE utf8mb4_bin NOT NULL,
  destination_id VARCHAR(160) COLLATE utf8mb4_bin NULL,
  locale VARCHAR(40) COLLATE utf8mb4_bin NULL,
  source VARCHAR(160) COLLATE utf8mb4_bin NULL,
  attributes_json JSON NOT NULL,
  received_at DATETIME(3) NOT NULL,
  retention_until DATETIME(3) NOT NULL,
  INDEX idx_analytics_event_name_time (event_name, occurred_at),
  INDEX idx_analytics_destination_time (destination_id, occurred_at),
  INDEX idx_analytics_session_time (session_id, occurred_at),
  INDEX idx_analytics_retention (retention_until)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;
