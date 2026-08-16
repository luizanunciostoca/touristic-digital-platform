export const ticketingPublicApiSchemaSql = `
CREATE TABLE IF NOT EXISTS ticketing_holder_profiles (
  holder_reference VARCHAR(120) COLLATE utf8mb4_bin PRIMARY KEY,
  holder_name VARCHAR(160) NOT NULL,
  email VARCHAR(200) COLLATE utf8mb4_bin NOT NULL,
  phone VARCHAR(40) NULL,
  document VARCHAR(40) NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  INDEX idx_ticketing_holder_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ticketing_offline_devices (
  device_id VARCHAR(120) COLLATE utf8mb4_bin PRIMARY KEY,
  destination_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  credential_fingerprint CHAR(64) COLLATE ascii_bin NOT NULL,
  issued_at DATETIME(3) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  provisioned_by VARCHAR(160) COLLATE utf8mb4_bin NOT NULL,
  revoked_at DATETIME(3) NULL,
  revoked_by VARCHAR(160) COLLATE utf8mb4_bin NULL,
  last_sync_at DATETIME(3) NULL,
  UNIQUE KEY uq_ticketing_offline_credential_fingerprint (credential_fingerprint),
  INDEX idx_ticketing_offline_destination (destination_id, expires_at),
  INDEX idx_ticketing_offline_revocation (revoked_at, expires_at),
  CHECK (expires_at > issued_at),
  CHECK ((revoked_at IS NULL AND revoked_by IS NULL) OR (revoked_at IS NOT NULL AND revoked_by IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

export const ticketingPublicApiRollbackSql = `
DROP TABLE IF EXISTS ticketing_offline_devices;
DROP TABLE IF EXISTS ticketing_holder_profiles;
`;
