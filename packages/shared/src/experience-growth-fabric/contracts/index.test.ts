import { describe, expect, it } from "vitest";

import {
  GROWTH_FEATURE_FLAG_DEFAULTS,
  actorMayAuthorizeValue,
  canTrustClassAuthorize,
  eventTrustClass,
  isGrowthFeatureEnabled,
  isOpaqueReference,
  isSha256,
  validateEventV1,
} from "./index.js";

describe("growth contract invariants", () => {
  it("defaults every feature flag to OFF", () => {
    const values = Object.values(GROWTH_FEATURE_FLAG_DEFAULTS);
    const allOff = values.every((value) => value === false);
    expect(allOff).toBe(true);
  });

  it("requires the master flag before child flags", () => {
    const childOnly = isGrowthFeatureEnabled("JOURNEY_ENABLED", {
      values: { JOURNEY_ENABLED: true },
      evaluatedAt: "2026-09-29T23:00:00Z",
    });
    expect(childOnly).toBe(false);

    const enabled = isGrowthFeatureEnabled("JOURNEY_ENABLED", {
      values: {
        GROWTH_FABRIC_ENABLED: true,
        JOURNEY_ENABLED: true,
      },
      evaluatedAt: "2026-09-29T23:00:00Z",
    });
    expect(enabled).toBe(true);
  });

  it("keeps browser and LLM outside value authority", () => {
    const browser = actorMayAuthorizeValue("browser", "experience_value");
    const llm = actorMayAuthorizeValue("llm", "low_risk_progress");
    const financial = actorMayAuthorizeValue(
      "financial",
      "financial_consequence",
    );

    expect(browser).toBe(false);
    expect(llm).toBe(false);
    expect(financial).toBe(true);
  });

  it("does not authorize money from behavioral evidence", () => {
    const behavioral = canTrustClassAuthorize(
      "behavioral",
      "financial_consequence",
    );
    const financial = canTrustClassAuthorize(
      "financial_authoritative",
      "financial_consequence",
    );

    expect(behavioral).toBe(false);
    expect(financial).toBe(true);
    expect(eventTrustClass("MapOpened")).toBe("behavioral");
    expect(eventTrustClass("PaymentApproved")).toBe("financial_authoritative");
  });

  it("validates a versioned event envelope", () => {
    const result = validateEventV1({
      eventId: "evt_12345678",
      type: "JourneyStarted",
      version: 1,
      occurredAt: "2026-09-29T23:00:00.000Z",
      destinationId: "dst_12345678",
      correlationId: "cor_12345678",
      payload: { journeyId: "journey_12345678" },
    });

    expect(result).toEqual({ valid: true });
  });

  it("rejects unknown event types", () => {
    const result = validateEventV1({
      eventId: "evt_12345678",
      type: "MoneyInvented",
      version: 1,
      occurredAt: "2026-09-29T23:00:00.000Z",
      destinationId: "dst_12345678",
      correlationId: "cor_12345678",
      payload: {},
    });

    expect(result).toEqual({
      valid: false,
      code: "EVENT_TYPE_UNKNOWN",
    });
  });

  it("validates opaque references and SHA-256 digests", () => {
    expect(isOpaqueReference("A7KF93H_example")).toBe(true);
    expect(isOpaqueReference("x")).toBe(false);
    expect(isSha256("a".repeat(64))).toBe(true);
  });
});
