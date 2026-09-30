export const GROWTH_FEATURE_FLAG_DEFAULTS = Object.freeze({
  GROWTH_FABRIC_ENABLED: false,
  JOURNEY_ENABLED: false,
  ENGAGEMENT_ENABLED: false,
  REWARDS_ENABLED: false,
  AFFILIATE_V2_ENABLED: false,
  AFFILIATE_PLACEMENTS_ENABLED: false,
  AFFILIATE_ATTRIBUTION_V2_SHADOW: false,
  AFFILIATE_ATTRIBUTION_V2_AUTHORITY: false,
  REFERRAL_PLACEMENTS_ENABLED: false,
  JOURNEY_ORCHESTRATOR_ENABLED: false,
  TRUST_RISK_ENABLED: false,
  RISK_ENFORCEMENT_ENABLED: false,
  EXPERIMENTATION_ENABLED: false,
  MORRO_PASS_UI_ENABLED: false,
  AFFILIATE_GROWTH_ENABLED: false,
  PLATFORM_FUNDED_REWARDS_ENABLED: false,
} as const);

export type GrowthFeatureFlagName = keyof typeof GROWTH_FEATURE_FLAG_DEFAULTS;

export interface GrowthFeatureFlagSnapshot {
  readonly values: Partial<Record<GrowthFeatureFlagName, boolean>>;
  readonly destinationId?: string;
  readonly cohort?: string;
  readonly subjectId?: string;
  readonly evaluatedAt: string;
}

export function isGrowthFeatureEnabled(
  name: GrowthFeatureFlagName,
  snapshot?: GrowthFeatureFlagSnapshot,
): boolean {
  const explicit = snapshot?.values[name] ?? GROWTH_FEATURE_FLAG_DEFAULTS[name];

  if (name === "GROWTH_FABRIC_ENABLED") return explicit === true;

  const master =
    snapshot?.values.GROWTH_FABRIC_ENABLED ??
    GROWTH_FEATURE_FLAG_DEFAULTS.GROWTH_FABRIC_ENABLED;

  return master === true && explicit === true;
}
