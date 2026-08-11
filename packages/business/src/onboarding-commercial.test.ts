import { describe, expect, it } from "vitest";

import {
  BUSINESS_PRIVACY_VERSION,
  BUSINESS_TERMS_VERSION,
  buildBusinessCheckoutHandoff,
  buildBusinessCommercialDraft,
  recommendBusinessCommercialPlan,
  verifyBusinessPaymentForSession,
} from "./onboarding-commercial.js";

describe("Business commercial conversion handoff", () => {
  it("recommends the frozen V1 plan by objective", () => {
    expect(recommendBusinessCommercialPlan("reservations").id).toBe("growth");
    expect(recommendBusinessCommercialPlan("events").id).toBe("performance");
    expect(recommendBusinessCommercialPlan("brand").id).toBe("essential");
  });

  it("requires contractor data plus terms and privacy before preparing checkout", () => {
    const missingConsent = buildBusinessCommercialDraft({
      objective: "reservations",
      contractor: {
        name: "Luiz",
        email: "luiz@example.com",
        phone: "75999999999",
        document: "12345678900",
      },
      acceptTerms: true,
      acceptPrivacy: false,
    });
    expect(missingConsent).toBeNull();

    const draft = buildBusinessCommercialDraft({
      objective: "reservations",
      contractor: {
        name: "<Luiz>",
        email: "luiz@example.com",
        phone: "75999999999",
        document: "12345678900",
      },
      acceptTerms: true,
      acceptPrivacy: true,
      marketingConsent: true,
      acceptedAt: "2026-08-11T12:00:00.000Z",
    });

    expect(draft).toMatchObject({
      selectedPlanId: "growth",
      contractor: { name: "Luiz" },
      marketingConsent: true,
      tutorial: true,
      excludeFromBusinessMetrics: true,
    });
    expect(draft?.acceptedTerms).toEqual([
      {
        type: "terms",
        version: BUSINESS_TERMS_VERSION,
        acceptedAt: "2026-08-11T12:00:00.000Z",
      },
      {
        type: "privacy",
        version: BUSINESS_PRIVACY_VERSION,
        acceptedAt: "2026-08-11T12:00:00.000Z",
      },
      {
        type: "marketing",
        version: "consent-v1",
        acceptedAt: "2026-08-11T12:00:00.000Z",
      },
    ]);
  });

  it("builds a payment-provider handoff without claiming payment confirmation", () => {
    const commercialDraft = buildBusinessCommercialDraft({
      selectedPlanId: "performance",
      objective: "events",
      contractor: {
        name: "Luiz",
        email: "luiz@example.com",
        phone: "75999999999",
        document: "12345678900",
      },
      acceptTerms: true,
      acceptPrivacy: true,
      acceptedAt: "2026-08-11T12:00:00.000Z",
    });
    const handoff = buildBusinessCheckoutHandoff({
      sessionId: "session-1",
      commercialDraft,
      businessDraft: { displayName: "Toca do Morcego" },
      returnUrl: "https://morro.example/business-onboarding.html",
    });

    expect(handoff).toMatchObject({
      sessionId: "session-1",
      planId: "performance",
      requiresPaymentProvider: true,
      tutorial: false,
      businessDraft: { displayName: "Toca do Morcego" },
    });
    expect(handoff).not.toHaveProperty("paymentStatus");
    expect(handoff).not.toHaveProperty("verified");
  });

  it("accepts payment verification only for the expected session", () => {
    expect(
      verifyBusinessPaymentForSession("session-1", {
        verified: true,
        sessionId: "session-2",
        reference: "pay-wrong",
      }),
    ).toBeNull();
    expect(
      verifyBusinessPaymentForSession("session-1", {
        verified: false,
        sessionId: "session-1",
        reference: "pay-unverified",
      }),
    ).toBeNull();
    expect(
      verifyBusinessPaymentForSession("session-1", {
        verified: true,
        sessionId: "session-1",
        reference: "<pay-1>",
      }),
    ).toEqual({ reference: "pay-1" });
  });
});
