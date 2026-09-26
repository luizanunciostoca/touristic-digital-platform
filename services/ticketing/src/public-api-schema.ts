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

CREATE TABLE IF NOT EXISTS ticketing_inventory_ownership (
  inventory_id VARCHAR(120) COLLATE utf8mb4_bin PRIMARY KEY,
  business_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  created_by VARCHAR(160) COLLATE utf8mb4_bin NOT NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  CONSTRAINT fk_ticketing_inventory_ownership_inventory
    FOREIGN KEY (inventory_id)
    REFERENCES ticketing_inventory(inventory_id)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT,
  INDEX idx_ticketing_inventory_ownership_business (business_id, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ticketing_inventory_catalog_bindings (
  inventory_id VARCHAR(120) COLLATE utf8mb4_bin PRIMARY KEY,
  business_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  offer_id VARCHAR(160) COLLATE utf8mb4_bin NOT NULL,
  created_by VARCHAR(160) COLLATE utf8mb4_bin NOT NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  CONSTRAINT fk_ticketing_catalog_binding_inventory
    FOREIGN KEY (inventory_id)
    REFERENCES ticketing_inventory(inventory_id)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT,
  UNIQUE KEY uq_ticketing_catalog_binding_offer (business_id, offer_id),
  INDEX idx_ticketing_catalog_binding_business (business_id, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ticketing_commerce_crm_outbox (
  event_id VARCHAR(120) COLLATE utf8mb4_bin PRIMARY KEY,
  event_type VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  reservation_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  holder_reference VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  inventory_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  order_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  payment_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  destination_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  product_kind VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  product_reference VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  amount_minor BIGINT UNSIGNED NOT NULL,
  currency CHAR(3) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  occurred_at DATETIME(3) NOT NULL,
  published_at DATETIME(3) NULL,
  attempt_count INT UNSIGNED NOT NULL DEFAULT 0,
  last_error_code VARCHAR(160) CHARACTER SET ascii COLLATE ascii_bin NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  UNIQUE KEY uq_ticketing_commerce_crm_reservation (reservation_id, event_type),
  INDEX idx_ticketing_commerce_crm_pending (published_at, occurred_at, event_id),
  INDEX idx_ticketing_commerce_crm_holder (holder_reference, occurred_at),
  CHECK (quantity > 0 AND quantity <= 20),
  CHECK (amount_minor > 0 AND amount_minor <= 9007199254740991)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

export const ticketingPublicApiRollbackSql = `DROP TABLE IF EXISTS ticketing_commerce_crm_outbox;
DROP TABLE IF EXISTS ticketing_inventory_catalog_bindings;
DROP TABLE IF EXISTS ticketing_inventory_ownership;
DROP TABLE IF EXISTS ticketing_offline_devices;
DROP TABLE IF EXISTS ticketing_holder_profiles;
`;
