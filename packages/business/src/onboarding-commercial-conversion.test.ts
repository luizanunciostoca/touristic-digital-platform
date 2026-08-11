import { describe, expect, it } from "vitest";

import {
  acceptBusinessCommercialVerifiedPayment,
  buildBusinessCommercialAcceptances,
  buildBusinessCommercialCheckoutHandoff,
  buildBusinessCommercialContractor,
  recommendBusinessCommercialPlan,
} from "./onboarding-commercial-conversion.js";

describe("Business commercial conversion boundary", () => {
  it("recommends the frozen V1 plan by objective", () => {
    expect(recommendBusinessCommercialPlan("reservations")?.id).toBe("growth");
    expect(recommendBusinessCommercialPlan("events")?.id).toBe("performance");
    expect(recommendBusinessCommercialPlan("brand")?.id).toBe("essential");
  });

  it("sanitizes contractor data and requires valid mandatory fields", () => {
    expect(
      buildBusinessCommercialContractor({
        name: "<Luiz> Silva",
        email: " LUIZ@example.com ",
        phone: "+55 75 99999-0000",
        document: "123.456.789-00",
      }),
    ).toEqual({
      name: "Luiz Silva",
      email: "luiz@example.com",
      phone: "+55 75 99999-0000",
      document: "123.456.789-00",
    });
    expect(
      buildBusinessCommercialContractor({
        name: "Luiz",
        email: "invalid",
        phone: "1",
        document: "2",
      }),
    ).toBeNull();
  });

  it("requires partnership terms and privacy while keeping marketing optional", () => {
    expect(
      buildBusinessCommercialAcceptances(
        { terms: true, privacy: true, marketing: true },
        "2026-08-11T17:00:00.000Z",
      ),
    ).toEqual([
      {
        type: "terms",
        version: "business-partner-terms-2026-08",
        acceptedAt: "2026-08-11T17:00:00.000Z",
      },
      {
        type: "privacy",
        version: "privacy-policy-2026-08",
        acceptedAt: "2026-08-11T17:00:00.000Z",
      },
      {
        type: "marketing",
        version: "consent-v1",
        acceptedAt: "2026-08-11T17:00:00.000Z",
      },
    ]);
    expect(
      buildBusinessCommercialAcceptances(
        { terms: true, privacy: false },
        "2026-08-11T17:00:00.000Z",
      ),
    ).toBeNull();
  });

  it("builds only a Payments handoff and contains no payment execution result", () => {
    const contractor = buildBusinessCommercialContractor({
      name: "Luiz Silva",
      email: "luiz@example.com",
      phone: "+55 75 99999-0000",
      document: "123.456.789-00",
    });
    const acceptedTerms = buildBusinessCommercialAcceptances(
      { terms: true, privacy: true },
      "2026-08-11T17:00:00.000Z",
    );
    const handoff = buildBusinessCommercialCheckoutHandoff({
      sessionId: "session-1",
      planId: "growth",
      contractor,
      acceptedTerms,
      businessDraft: { displayName: "Toca do Morcego" },
      returnUrl: "https://morro.digital/empresas",
    });

    expect(handoff).toMatchObject({
      sessionId: "session-1",
      planId: "growth",
      tutorial: false,
      requiresPaymentsCapability: true,
    });
    expect(handoff).not.toHaveProperty("checkoutUrl");
    expect(handoff).not.toHaveProperty("publicToken");
    expect(handoff).not.toHaveProperty("paymentStatus");
  });

  it("accepts confirmation only from a verified result for the same session", () => {
    expect(
      acceptBusinessCommercialVerifiedPayment("session-right", {
        verified: true,
        sessionId: "session-wrong",
        reference: "pay-1",
      }),
    ).toBeNull();
    expect(
      acceptBusinessCommercialVerifiedPayment("session-right", {
        verified: true,
        sessionId: "session-right",
        reference: "<pay-1>",
        definitiveBusinessId: "business-1",
      }),
    ).toEqual({
      paymentStatus: "CONFIRMED",
      activationStatus: "READY_TO_CONVERT",
      paymentReference: "pay-1",
      definitiveBusinessId: "business-1",
    });
  });
});
