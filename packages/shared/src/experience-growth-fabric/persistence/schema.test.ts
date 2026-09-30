import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const schema = readFileSync(new URL("./schema.sql", import.meta.url), "utf8");

const requiredTables = [
  "affiliate_acquisition_cycles",
  "affiliate_influence_touchpoints",
  "referral_campaigns",
  "referral_placements",
  "referral_tokens",
  "destination_journeys",
  "journey_experiences",
  "engagement_xp_ledger",
  "engagement_badge_grants",
  "engagement_collection_progress",
  "mission_definitions",
  "mission_progress",
  "reward_definitions",
  "reward_inventory",
  "reward_entitlements",
  "affiliate_xp_ledger",
  "affiliate_growth_profiles",
  "affiliate_challenge_progress",
  "risk_signals",
  "risk_decisions",
  "experiment_definitions",
  "experiment_assignments",
  "experiment_exposures",
  "experiment_outcomes",
  "growth_outbox_events",
  "growth_consumer_claims",
  "growth_dead_letters",
  "journey_progress_projection",
  "affiliate_performance_projection",
  "growth_campaign_projection",
  "reward_performance_projection",
  "mission_performance_projection",
  "experiment_outcome_projection",
] as const;

describe("W21 isolated MySQL schema contract", () => {
  it("contains every additive Growth Fabric table", () => {
    for (const table of requiredTables) {
      expect(schema).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
  });

  it("contains no destructive DDL", () => {
    expect(schema).not.toMatch(/\bDROP\s+TABLE\b/iu);
    expect(schema).not.toMatch(/\bTRUNCATE\b/iu);
    expect(schema).not.toMatch(/\bALTER\s+TABLE\b/iu);
    expect(schema).not.toMatch(/\bDELETE\s+FROM\b/iu);
  });

  it("pins idempotency and replay uniqueness in persistence", () => {
    expect(schema).toContain("uq_engagement_xp_idempotency");
    expect(schema).toContain("uq_affiliate_xp_idempotency");
    expect(schema).toContain("uq_reward_entitlement_idempotency");
    expect(schema).toContain("PRIMARY KEY (consumer_name, event_id)");
    expect(schema).toContain("uq_experiment_assignment_subject");
  });

  it("does not persist raw latitude or longitude columns", () => {
    expect(schema).not.toMatch(/\braw_latitude\b/iu);
    expect(schema).not.toMatch(/\braw_longitude\b/iu);
    expect(schema).not.toMatch(/\blatitude\b/iu);
    expect(schema).not.toMatch(/\blongitude\b/iu);
  });
});
