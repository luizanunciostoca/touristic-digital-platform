import { describe, expect, it } from "vitest";

import {
  buildBusinessTutorialPromotion,
  buildBusinessTutorialWorkspaceSnapshot,
  getBusinessTutorialPromotionDefaults,
  incrementBusinessTutorialEventSummary,
} from "./onboarding-workspace.js";

describe("Business tutorial partner workspace", () => {
  it("normalizes only the frozen session metrics", () => {
    const summary = incrementBusinessTutorialEventSummary(
      { business_profile_opened: 2, arbitrary_metric: 99 },
      "business_route_started",
    );
    const workspace = buildBusinessTutorialWorkspaceSnapshot({
      businessName: "<Maré Alta>",
      eventSummary: summary,
    });

    expect(workspace.businessName).toBe("Maré Alta");
    expect(workspace.eventCount).toBe(3);
    expect(
      workspace.metrics.find(
        (metric) => metric.key === "business_profile_opened",
      )?.value,
    ).toBe(2);
    expect(
      workspace.metrics.find(
        (metric) => metric.key === "business_route_started",
      )?.value,
    ).toBe(1);
    expect(workspace.metrics).toHaveLength(10);
    expect(workspace.excludeFromBusinessMetrics).toBe(true);
  });

  it("creates non-publishable sandbox promotions only with required fields", () => {
    const promotion = buildBusinessTutorialPromotion(
      {
        title: "<Almoço especial>",
        description: "Benefício para visitantes do guia.",
        cta: "Ver oferta",
        validUntil: "2026-12-31",
      },
      "promo-1",
    );

    expect(promotion).toMatchObject({
      id: "promo-1",
      title: "Almoço especial",
      environment: "sandbox",
      publishable: false,
      tutorial: true,
      excludeFromBusinessMetrics: true,
    });
    expect(buildBusinessTutorialPromotion({ title: "Incompleta" })).toBeNull();
  });

  it("preserves category-specific frozen promotion defaults", () => {
    expect(getBusinessTutorialPromotionDefaults("events")).toMatchObject({
      title: "Ingresso ou benefício especial",
      cta: "Ver evento",
    });
    expect(getBusinessTutorialPromotionDefaults("unknown").cta).toBe(
      "Ver oferta",
    );
  });
});
