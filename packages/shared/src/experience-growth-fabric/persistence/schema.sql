CREATE TABLE IF NOT EXISTS affiliate_acquisition_cycles (
  cycle_id VARCHAR(120) COLLATE utf8mb4_bin PRIMARY KEY,
  subject_id VARCHAR(180) COLLATE utf8mb4_bin NOT NULL,
  destination_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  owner_affiliate_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  source_placement_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  policy_version VARCHAR(80) COLLATE utf8mb4_bin NOT NULL,
  opened_at DATETIME(3) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  INDEX idx_acquisition_subject_destination (subject_id, destination_id, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS affiliate_influence_touchpoints (
  touchpoint_id VARCHAR(120) COLLATE utf8mb4_bin PRIMARY KEY,
  cycle_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  subject_id VARCHAR(180) COLLATE utf8mb4_bin NOT NULL,
  destination_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  affiliate_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  placement_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  policy_version VARCHAR(80) COLLATE utf8mb4_bin NOT NULL,
  occurred_at DATETIME(3) NOT NULL,
  INDEX idx_influence_cycle_time (cycle_id, occurred_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS referral_campaigns (
  campaign_id VARCHAR(120) COLLATE utf8mb4_bin PRIMARY KEY,
  affiliate_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  program_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  destination_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  status VARCHAR(40) COLLATE utf8mb4_bin NOT NULL,
  created_at DATETIME(3) NOT NULL,
  INDEX idx_referral_campaign_owner (affiliate_id, destination_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS referral_placements (
  placement_id VARCHAR(120) COLLATE utf8mb4_bin PRIMARY KEY,
  campaign_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  affiliate_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  program_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  destination_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  channel VARCHAR(60) COLLATE utf8mb4_bin NOT NULL,
  status VARCHAR(40) COLLATE utf8mb4_bin NOT NULL,
  risk_policy_version VARCHAR(80) COLLATE utf8mb4_bin NOT NULL,
  valid_from DATETIME(3) NULL,
  valid_until DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL,
  revoked_at DATETIME(3) NULL,
  INDEX idx_referral_placement_campaign (campaign_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS referral_tokens (
  token_id VARCHAR(120) COLLATE utf8mb4_bin PRIMARY KEY,
  placement_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  public_code_hash BINARY(32) NOT NULL,
  status VARCHAR(40) COLLATE utf8mb4_bin NOT NULL,
  issued_at DATETIME(3) NOT NULL,
  expires_at DATETIME(3) NULL,
  revoked_at DATETIME(3) NULL,
  rotated_to_token_id VARCHAR(120) COLLATE utf8mb4_bin NULL,
  UNIQUE KEY uq_referral_public_code_hash (public_code_hash),
  INDEX idx_referral_token_placement (placement_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS destination_journeys (
  journey_id VARCHAR(120) COLLATE utf8mb4_bin PRIMARY KEY,
  subject_id VARCHAR(180) COLLATE utf8mb4_bin NOT NULL,
  user_id VARCHAR(180) COLLATE utf8mb4_bin NULL,
  destination_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  profile_type VARCHAR(40) COLLATE utf8mb4_bin NOT NULL,
  status VARCHAR(40) COLLATE utf8mb4_bin NOT NULL,
  acquisition_cycle_id VARCHAR(120) COLLATE utf8mb4_bin NULL,
  started_at DATETIME(3) NOT NULL,
  expected_end_at DATETIME(3) NULL,
  interests_json JSON NOT NULL,
  party_profile VARCHAR(120) COLLATE utf8mb4_bin NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  INDEX idx_journey_subject_destination (subject_id, destination_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS journey_experiences (
  reference_id VARCHAR(120) COLLATE utf8mb4_bin PRIMARY KEY,
  journey_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  kind VARCHAR(40) COLLATE utf8mb4_bin NOT NULL,
  place_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  verification_type VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  proof_digest BINARY(32) NULL,
  occurred_at DATETIME(3) NOT NULL,
  INDEX idx_journey_experience (journey_id, occurred_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS engagement_xp_ledger (
  entry_id VARCHAR(120) COLLATE utf8mb4_bin PRIMARY KEY,
  subject_id VARCHAR(180) COLLATE utf8mb4_bin NOT NULL,
  journey_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  destination_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  amount_signed BIGINT NOT NULL,
  reason_code VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  source_event_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  evidence_reference VARCHAR(255) COLLATE utf8mb4_bin NOT NULL,
  idempotency_key VARCHAR(255) COLLATE utf8mb4_bin NOT NULL,
  policy_version VARCHAR(80) COLLATE utf8mb4_bin NOT NULL,
  trust_class VARCHAR(60) COLLATE utf8mb4_bin NOT NULL,
  occurred_at DATETIME(3) NOT NULL,
  UNIQUE KEY uq_engagement_xp_idempotency (idempotency_key),
  INDEX idx_engagement_xp_subject (subject_id, destination_id, occurred_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS engagement_badge_grants (
  grant_id VARCHAR(120) COLLATE utf8mb4_bin PRIMARY KEY,
  subject_id VARCHAR(180) COLLATE utf8mb4_bin NOT NULL,
  destination_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  badge_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  badge_version INT UNSIGNED NOT NULL,
  evidence_json JSON NOT NULL,
  granted_at DATETIME(3) NOT NULL,
  UNIQUE KEY uq_badge_subject_version (subject_id, destination_id, badge_id, badge_version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS engagement_collection_progress (
  subject_id VARCHAR(180) COLLATE utf8mb4_bin NOT NULL,
  destination_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  collection_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  collection_version INT UNSIGNED NOT NULL,
  completed_component_ids JSON NOT NULL,
  completed TINYINT(1) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (subject_id, destination_id, collection_id, collection_version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mission_definitions (
  mission_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  version INT UNSIGNED NOT NULL,
  destination_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  status VARCHAR(40) COLLATE utf8mb4_bin NOT NULL,
  definition_json JSON NOT NULL,
  published_at DATETIME(3) NULL,
  PRIMARY KEY (mission_id, version),
  INDEX idx_mission_destination_status (destination_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mission_progress (
  subject_id VARCHAR(180) COLLATE utf8mb4_bin NOT NULL,
  journey_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  destination_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  mission_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  mission_version INT UNSIGNED NOT NULL,
  completed_step_ids JSON NOT NULL,
  accepted_evidence_ids JSON NOT NULL,
  accepted_references_json JSON NOT NULL,
  completed_at DATETIME(3) NULL,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (journey_id, mission_id, mission_version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reward_definitions (
  reward_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  version INT UNSIGNED NOT NULL,
  destination_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  campaign_id VARCHAR(120) COLLATE utf8mb4_bin NULL,
  status VARCHAR(40) COLLATE utf8mb4_bin NOT NULL,
  definition_json JSON NOT NULL,
  valid_from DATETIME(3) NOT NULL,
  valid_until DATETIME(3) NOT NULL,
  published_at DATETIME(3) NULL,
  PRIMARY KEY (reward_id, version),
  INDEX idx_reward_destination_status (destination_id, status, valid_until)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reward_inventory (
  reward_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  reward_version INT UNSIGNED NOT NULL,
  revision BIGINT UNSIGNED NOT NULL,
  total_units BIGINT UNSIGNED NOT NULL,
  reserved_units BIGINT UNSIGNED NOT NULL,
  redeemed_units BIGINT UNSIGNED NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (reward_id, reward_version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reward_entitlements (
  entitlement_id VARCHAR(120) COLLATE utf8mb4_bin PRIMARY KEY,
  subject_id VARCHAR(180) COLLATE utf8mb4_bin NOT NULL,
  journey_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  destination_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  reward_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  reward_version INT UNSIGNED NOT NULL,
  status VARCHAR(40) COLLATE utf8mb4_bin NOT NULL,
  policy_version VARCHAR(80) COLLATE utf8mb4_bin NOT NULL,
  eligibility_evidence_reference VARCHAR(255) COLLATE utf8mb4_bin NOT NULL,
  economic_approval_reference VARCHAR(255) COLLATE utf8mb4_bin NULL,
  idempotency_key VARCHAR(255) COLLATE utf8mb4_bin NOT NULL,
  unlocked_at DATETIME(3) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  redeemed_at DATETIME(3) NULL,
  expired_at DATETIME(3) NULL,
  UNIQUE KEY uq_reward_entitlement_idempotency (idempotency_key),
  INDEX idx_reward_entitlement_subject (subject_id, destination_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS affiliate_xp_ledger (
  entry_id VARCHAR(120) COLLATE utf8mb4_bin PRIMARY KEY,
  affiliate_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  destination_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  amount_signed BIGINT NOT NULL,
  reason_code VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  source_reference VARCHAR(255) COLLATE utf8mb4_bin NOT NULL,
  idempotency_key VARCHAR(255) COLLATE utf8mb4_bin NOT NULL,
  policy_version VARCHAR(80) COLLATE utf8mb4_bin NOT NULL,
  occurred_at DATETIME(3) NOT NULL,
  UNIQUE KEY uq_affiliate_xp_idempotency (idempotency_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS affiliate_growth_profiles (
  affiliate_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  destination_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  lifetime_xp BIGINT NOT NULL,
  level_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  aqs_value INT UNSIGNED NULL,
  ais_value INT UNSIGNED NULL,
  policy_version VARCHAR(80) COLLATE utf8mb4_bin NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (affiliate_id, destination_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS affiliate_challenge_progress (
  affiliate_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  challenge_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  season_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  qualified_referral_count BIGINT UNSIGNED NOT NULL,
  completed TINYINT(1) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (affiliate_id, challenge_id, season_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS risk_signals (
  signal_id VARCHAR(120) COLLATE utf8mb4_bin PRIMARY KEY,
  subject_id VARCHAR(180) COLLATE utf8mb4_bin NOT NULL,
  destination_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  code VARCHAR(80) COLLATE utf8mb4_bin NOT NULL,
  severity VARCHAR(40) COLLATE utf8mb4_bin NOT NULL,
  evidence_digest BINARY(32) NOT NULL,
  policy_version VARCHAR(80) COLLATE utf8mb4_bin NOT NULL,
  occurred_at DATETIME(3) NOT NULL,
  INDEX idx_risk_subject_time (subject_id, destination_id, occurred_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS risk_decisions (
  decision_id VARCHAR(120) COLLATE utf8mb4_bin PRIMARY KEY,
  assessment_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  subject_id VARCHAR(180) COLLATE utf8mb4_bin NOT NULL,
  destination_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  action_class VARCHAR(80) COLLATE utf8mb4_bin NOT NULL,
  outcome VARCHAR(40) COLLATE utf8mb4_bin NOT NULL,
  rationale_json JSON NOT NULL,
  policy_version VARCHAR(80) COLLATE utf8mb4_bin NOT NULL,
  decided_at DATETIME(3) NOT NULL,
  INDEX idx_risk_decision_subject (subject_id, destination_id, decided_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS experiment_definitions (
  experiment_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  version INT UNSIGNED NOT NULL,
  destination_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  status VARCHAR(40) COLLATE utf8mb4_bin NOT NULL,
  salt_version VARCHAR(80) COLLATE utf8mb4_bin NOT NULL,
  definition_json JSON NOT NULL,
  starts_at DATETIME(3) NOT NULL,
  ends_at DATETIME(3) NULL,
  PRIMARY KEY (experiment_id, version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS experiment_assignments (
  assignment_id VARCHAR(120) COLLATE utf8mb4_bin PRIMARY KEY,
  experiment_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  experiment_version INT UNSIGNED NOT NULL,
  subject_id VARCHAR(180) COLLATE utf8mb4_bin NOT NULL,
  destination_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  variant_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  salt_version VARCHAR(80) COLLATE utf8mb4_bin NOT NULL,
  bucket INT UNSIGNED NOT NULL,
  assigned_at DATETIME(3) NOT NULL,
  UNIQUE KEY uq_experiment_assignment_subject (experiment_id, experiment_version, subject_id, salt_version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS experiment_exposures (
  exposure_id VARCHAR(120) COLLATE utf8mb4_bin PRIMARY KEY,
  assignment_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  experiment_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  subject_id VARCHAR(180) COLLATE utf8mb4_bin NOT NULL,
  variant_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  correlation_id VARCHAR(180) COLLATE utf8mb4_bin NOT NULL,
  exposed_at DATETIME(3) NOT NULL,
  UNIQUE KEY uq_experiment_exposure_assignment (assignment_id, exposure_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS experiment_outcomes (
  outcome_id VARCHAR(120) COLLATE utf8mb4_bin PRIMARY KEY,
  assignment_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  metric_code VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  metric_value DOUBLE NOT NULL,
  occurred_at DATETIME(3) NOT NULL,
  INDEX idx_experiment_outcome_assignment (assignment_id, metric_code, occurred_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS growth_outbox_events (
  event_id VARCHAR(120) COLLATE utf8mb4_bin PRIMARY KEY,
  event_type VARCHAR(160) COLLATE utf8mb4_bin NOT NULL,
  aggregate_type VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  aggregate_id VARCHAR(180) COLLATE utf8mb4_bin NOT NULL,
  contract_version INT UNSIGNED NOT NULL,
  payload_json JSON NOT NULL,
  correlation_id VARCHAR(180) COLLATE utf8mb4_bin NOT NULL,
  causation_id VARCHAR(180) COLLATE utf8mb4_bin NULL,
  status VARCHAR(40) COLLATE utf8mb4_bin NOT NULL,
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

CREATE TABLE IF NOT EXISTS journey_progress_projection (
  destination_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  journey_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  subject_id VARCHAR(180) COLLATE utf8mb4_bin NOT NULL,
  status VARCHAR(40) COLLATE utf8mb4_bin NOT NULL,
  mission_progress_events BIGINT UNSIGNED NOT NULL DEFAULT 0,
  mission_completions BIGINT UNSIGNED NOT NULL DEFAULT 0,
  reward_unlocks BIGINT UNSIGNED NOT NULL DEFAULT 0,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (destination_id, journey_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS affiliate_performance_projection (
  destination_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  affiliate_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  qualified_acquisitions BIGINT UNSIGNED NOT NULL DEFAULT 0,
  qualified_referrals BIGINT UNSIGNED NOT NULL DEFAULT 0,
  guide_activations BIGINT UNSIGNED NOT NULL DEFAULT 0,
  successful_experiences BIGINT UNSIGNED NOT NULL DEFAULT 0,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (destination_id, affiliate_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS growth_campaign_projection (
  destination_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  campaign_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  qualified_acquisitions BIGINT UNSIGNED NOT NULL DEFAULT 0,
  guide_activations BIGINT UNSIGNED NOT NULL DEFAULT 0,
  successful_experiences BIGINT UNSIGNED NOT NULL DEFAULT 0,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (destination_id, campaign_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reward_performance_projection (
  destination_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  reward_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  unlocks BIGINT UNSIGNED NOT NULL DEFAULT 0,
  redemptions BIGINT UNSIGNED NOT NULL DEFAULT 0,
  expirations BIGINT UNSIGNED NOT NULL DEFAULT 0,
  inventory_exhaustions BIGINT UNSIGNED NOT NULL DEFAULT 0,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (destination_id, reward_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mission_performance_projection (
  destination_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  mission_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  progress_events BIGINT UNSIGNED NOT NULL DEFAULT 0,
  completions BIGINT UNSIGNED NOT NULL DEFAULT 0,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (destination_id, mission_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS experiment_outcome_projection (
  destination_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  experiment_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  variant_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  assignments BIGINT UNSIGNED NOT NULL DEFAULT 0,
  exposures BIGINT UNSIGNED NOT NULL DEFAULT 0,
  outcome_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  outcome_total DOUBLE NOT NULL DEFAULT 0,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (destination_id, experiment_id, variant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
