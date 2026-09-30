-- ASSISTANT VNEXT FUTURE SCHEMA
-- DESIGN ARTIFACT ONLY. DO NOT APPLY TO THE CURRENT DATABASE IN THIS MISSION.
CREATE TABLE assistant_vnext_memory (
  id VARCHAR(200) PRIMARY KEY,
  user_id VARCHAR(200) NULL,
  session_id VARCHAR(200) NULL,
  layer ENUM('L0','L1','L2','L3','L4','L5') NOT NULL,
  scope VARCHAR(240) NOT NULL,
  owner_type VARCHAR(80) NOT NULL,
  source VARCHAR(160) NOT NULL,
  sensitivity VARCHAR(40) NOT NULL,
  retention_policy VARCHAR(120) NOT NULL,
  payload_json JSON NOT NULL,
  created_at TIMESTAMP(3) NOT NULL,
  expires_at TIMESTAMP(3) NULL,
  INDEX idx_assistant_vnext_memory_scope_layer (scope, layer),
  INDEX idx_assistant_vnext_memory_expires (expires_at)
);
CREATE TABLE assistant_vnext_prepared_action (
  id VARCHAR(200) PRIMARY KEY,
  session_id VARCHAR(200) NOT NULL,
  requested_by VARCHAR(200) NOT NULL,
  tool_name VARCHAR(160) NOT NULL,
  tool_version VARCHAR(40) NOT NULL,
  normalized_input_json JSON NOT NULL,
  canonical_summary VARCHAR(1000) NOT NULL,
  context_fingerprint CHAR(64) NOT NULL,
  idempotency_key CHAR(64) NOT NULL UNIQUE,
  confirmation_required BOOLEAN NOT NULL,
  created_at TIMESTAMP(3) NOT NULL,
  expires_at TIMESTAMP(3) NOT NULL,
  executed_at TIMESTAMP(3) NULL
);
CREATE TABLE assistant_vnext_action_audit (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  prepared_action_id VARCHAR(200) NOT NULL,
  event_type VARCHAR(80) NOT NULL,
  correlation_id VARCHAR(200) NOT NULL,
  occurred_at TIMESTAMP(3) NOT NULL,
  metadata_json JSON NULL,
  INDEX idx_assistant_vnext_action_audit_action (prepared_action_id)
);
