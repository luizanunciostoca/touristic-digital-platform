import { describe, expect, it } from "vitest";
import { normalizeBusinessProfile } from "@touristic/business";
import {
  businessDashboardViews,
  patchBusinessProfile,
  requestedBusinessId,
} from "./business-dashboard-surface.js";

describe("business dashboard surface", () => {
  it("freezes the V1-equivalent primary view inventory", () => {
    expect(businessDashboardViews).toEqual([
      "dashboard",
      "performance",
      "audience",
      "offers",
      "promotions",
      "settings",
    ]);
  });

  it("reads an explicit Business scope from the query string", () => {
    expect(requestedBusinessId("?businessId=toca-do-morcego")).toBe(
      "toca-do-morcego",
    );
    expect(requestedBusinessId("?foo=bar")).toBeUndefined();
  });

  it("patches editable fields without dropping protected profile state", () => {
    const current = normalizeBusinessProfile({
      id: "toca-do-morcego",
      name: "Toca",
      categoryLabel: "Bar",
      specialty: "Sunset",
      description: "Original",
      cta: "Ver empresa",
      locationLabel: "Morro de São Paulo",
      locationIsExample: false,
      tutorial: true,
      excludeFromBusinessMetrics: true,
      promotion: {
        id: "promo-1",
        title: "Sunset",
        description: "Promo",
        cta: "Ver oferta",
        validUntil: "2026-12-31",
      },
    });

    const next = patchBusinessProfile(current, "toca-do-morcego", {
      name: "Toca do Morcego",
      categoryLabel: "Experiência",
      description: "Atualizada",
    });

    expect(next.name).toBe("Toca do Morcego");
    expect(next.categoryLabel).toBe("Experiência");
    expect(next.description).toBe("Atualizada");
    expect(next.specialty).toBe("Sunset");
    expect(next.tutorial).toBe(true);
    expect(next.excludeFromBusinessMetrics).toBe(true);
    expect(next.promotion?.id).toBe("promo-1");
  });
});
