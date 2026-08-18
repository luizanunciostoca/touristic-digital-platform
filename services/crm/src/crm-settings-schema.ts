export const crmM155SchemaSql = `
CREATE TABLE IF NOT EXISTS crm_settings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  setting_key VARCHAR(120) NOT NULL,
  setting_value JSON NOT NULL,
  setting_group VARCHAR(80) NOT NULL DEFAULT 'general',
  description VARCHAR(240) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by_subject VARCHAR(191) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY crm_settings_key_uq (setting_key),
  INDEX crm_settings_group_idx (setting_group, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crm_storage_objects (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  object_key VARCHAR(500) NOT NULL,
  bucket VARCHAR(120) NOT NULL,
  content_type VARCHAR(120) NOT NULL,
  size_bytes BIGINT UNSIGNED NOT NULL,
  checksum_sha256 VARCHAR(64) NOT NULL,
  metadata JSON NULL,
  lead_id BIGINT UNSIGNED NULL,
  uploaded_by_subject VARCHAR(191) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY crm_storage_object_key_uq (bucket, object_key),
  INDEX crm_storage_lead_idx (lead_id),
  INDEX crm_storage_content_type_idx (content_type),
  CONSTRAINT crm_storage_lead_fk FOREIGN KEY (lead_id) REFERENCES crm_leads(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;
