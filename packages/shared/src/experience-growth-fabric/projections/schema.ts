export const growthProjectionSchemaSql = `
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
`;
