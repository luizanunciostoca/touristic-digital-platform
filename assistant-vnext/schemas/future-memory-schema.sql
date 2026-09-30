-- FUTURE SCHEMA ONLY. DO NOT APPLY DURING ISOLATED BUILD.
CREATE TABLE assistant_vnext_memory (
  id VARCHAR(191) PRIMARY KEY,
  subject_id VARCHAR(191) NOT NULL,
  layer ENUM('L3','L4','L5') NOT NULL,
  scope_key VARCHAR(191) NOT NULL,
  owner_type VARCHAR(64) NOT NULL,
  source_name VARCHAR(191) NOT NULL,
  sensitivity VARCHAR(32) NOT NULL,
  retention_policy VARCHAR(191) NOT NULL,
  payload_json JSON NOT NULL,
  created_at TIMESTAMP(3) NOT NULL,
  expires_at TIMESTAMP(3) NULL,
  consent_ref VARCHAR(191) NULL,
  INDEX idx_assistant_vnext_memory_subject_scope (subject_id, scope_key),
  INDEX idx_assistant_vnext_memory_expiry (expires_at)
);
