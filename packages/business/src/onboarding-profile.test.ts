import { describe, expect, it } from "vitest";

import { buildBusinessTutorialProfile } from "./onboarding-profile.js";

const context = {
  businessName: "<Maré Alta>",
  category: "restaurant",
  specialty: "Frutos do mar",
  businessLocation: {
    matchedName: "Maré Alta",
    isExample: false,
  },
  tutorialBusinessCandidate: {
    id: "tutorial-mare-alta",
  },
};

describe("M59 Business tutorial profile sandbox", () => {
  it("reuses the Business profile core without inventing rating or hours", () => {
    const profile = buildBusinessTutorialProfile(context, {
      categoryLabel: "Restaurante",
      cta: "Ver cardápio",
    });

    expect(profile).toMatchObject({
      id: "tutorial-mare-alta",
      name: "Maré Alta",
      categoryLabel: "Restaurante",
      specialty: "Frutos do mar",
      cta: "Ver cardápio",
      locationLabel: "Maré Alta",
      locationIsExample: false,
      tutorial: true,
      excludeFromBusinessMetrics: true,
    });
    expect(profile).not.toHaveProperty("rating");
    expect(profile).not.toHaveProperty("openNow");
    expect(Object.isFrozen(profile)).toBe(true);
  });

  it("marks device/example location as demonstrative", () => {
    const profile = buildBusinessTutorialProfile(
      {
        ...context,
        businessLocation: {
          source: "device",
          name: "device-location",
        },
      },
      { categoryLabel: "Restaurante" },
    );

    expect(profile.locationIsExample).toBe(true);
    expect(profile.locationLabel).toBe("device-location");
  });

  it("preserves an explicit tutorial promotion through the shared profile model", () => {
    const profile = buildBusinessTutorialProfile(context, {
      promotion: {
        id: "promo-1",
        title: "Sunset especial",
        description: "Experiência demonstrativa",
        cta: "Ver oferta",
        validUntil: "2026-08-31",
      },
    });

    expect(profile.promotion).toMatchObject({
      id: "promo-1",
      title: "Sunset especial",
      cta: "Ver oferta",
    });
  });
});
