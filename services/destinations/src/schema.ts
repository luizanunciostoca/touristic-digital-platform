export const destinationsSchemaSql = `
CREATE TABLE IF NOT EXISTS destinations (
  destination_id VARCHAR(120) COLLATE utf8mb4_bin PRIMARY KEY,
  status VARCHAR(24) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  locale VARCHAR(20) COLLATE utf8mb4_bin NOT NULL,
  timezone VARCHAR(80) COLLATE utf8mb4_bin NOT NULL,
  currency CHAR(3) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  branding_json JSON NOT NULL,
  center_json JSON NOT NULL,
  modules_json JSON NOT NULL,
  feature_flags_json JSON NOT NULL,
  version BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  INDEX idx_destinations_status (status),
  INDEX idx_destinations_updated_at (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;
