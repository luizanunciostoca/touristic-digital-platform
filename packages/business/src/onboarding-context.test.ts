import { describe, expect, it } from "vitest";

import { updateBusinessOnboardingRuntimeContext } from "./onboarding-context.js";
import { createBusinessOnboardingSession } from "./onboarding.js";

describe("Business onboarding runtime context", () => {
  it("persists M58-M60 tutorial-only runtime results and rejects unknown keys", () => {
    const session = createBusinessOnboardingSession({
      context: { businessName: "Toca do Morcego" },
      now: new Date("2026-08-11T12:00:00.000Z"),
    });
    const candidate = Object.freeze({ id: "tutorial-toca", tutorial: true });
    const recommendation = Object.freeze({ rendered: true, score: 100 });
    const profile = Object.freeze({
      id: "tutorial-toca",
      name: "Toca do Morcego",
      tutorial: true,
      excludeFromBusinessMetrics: true,
    });
    const eventSummary = Object.freeze({ business_profile_opened: 1 });
    const promotion = Object.freeze({
      id: "tutorial-promotion-1",
      title: "Sunset especial",
      environment: "sandbox",
      publishable: false,
      tutorial: true,
      excludeFromBusinessMetrics: true,
    });
    const workspace = Object.freeze({
      businessName: "Toca do Morcego",
      eventCount: 1,
      tutorial: true,
      excludeFromBusinessMetrics: true,
    });

    const updated = updateBusinessOnboardingRuntimeContext(
      session,
      {
        tutorialBusinessCandidate: candidate,
        businessRecommendationResult: recommendation,
        tutorialBusinessProfile: profile,
        businessTutorialEventSummary: eventSummary,
        businessDemoPromotion: promotion,
        businessTutorialWorkspace: workspace,
        forbiddenCredential: "must-not-persist",
      },
      new Date("2026-08-11T12:01:00.000Z"),
    );

    expect(updated.conversationDraft.context.tutorialBusinessCandidate).toBe(
      candidate,
    );
    expect(updated.conversationDraft.context.businessRecommendationResult).toBe(
      recommendation,
    );
    expect(updated.conversationDraft.context.tutorialBusinessProfile).toBe(
      profile,
    );
    expect(updated.conversationDraft.context.businessTutorialEventSummary).toBe(
      eventSummary,
    );
    expect(updated.conversationDraft.context.businessDemoPromotion).toBe(
      promotion,
    );
    expect(updated.conversationDraft.context.businessTutorialWorkspace).toBe(
      workspace,
    );
    expect(updated.conversationDraft.context).not.toHaveProperty(
      "forbiddenCredential",
    );
  });
});
