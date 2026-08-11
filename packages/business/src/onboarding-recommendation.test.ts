import { describe, expect, it } from "vitest";

import {
  buildBusinessTutorialRecommendationCandidate,
  evaluateBusinessTutorialRecommendation,
  scoreBusinessTutorialRecommendation,
} from "./onboarding-recommendation.js";

const candidate = buildBusinessTutorialRecommendationCandidate(
  {
    businessName: "Toca do Morcego",
    category: "events",
    specialty: "sunset",
    objective: "mais reservas",
    audience: "casais",
    businessLocation: {
      coordinates: {
        latitude: -13.377,
        longitude: -38.913,
      },
      source: "catalog",
    },
  },
  {
    categoryLabel: "Eventos",
    cta: "Ver empresa",
    id: "tutorial-toca",
  },
);

describe("M58 Business tutorial recommendation sandbox", () => {
  it("builds an immutable tutorial-only candidate", () => {
    expect(candidate).toMatchObject({
      id: "tutorial-toca",
      name: "Toca do Morcego",
      category: "events",
      categoryLabel: "Eventos",
      specialty: "sunset",
      latitude: -13.377,
      longitude: -38.913,
      tutorial: true,
      excludeFromBusinessMetrics: true,
    });
    expect(Object.isFrozen(candidate)).toBe(true);
  });

  it("preserves the frozen V1 additive recommendation weights", () => {
    expect(
      scoreBusinessTutorialRecommendation("Quero uma festa hoje", candidate),
    ).toBe(55);
    expect(
      scoreBusinessTutorialRecommendation(
        "Quero ver Toca do Morcego",
        candidate,
      ),
    ).toBe(100);
    expect(
      scoreBusinessTutorialRecommendation("procuro sunset", candidate),
    ).toBe(85);
    expect(scoreBusinessTutorialRecommendation("para casais", candidate)).toBe(
      15,
    );
  });

  it("renders only scores at or above the V1 threshold", () => {
    expect(
      evaluateBusinessTutorialRecommendation("procuro sunset", candidate),
    ).toMatchObject({
      score: 85,
      rendered: true,
      tutorial: true,
      excludeFromBusinessMetrics: true,
    });
    expect(
      evaluateBusinessTutorialRecommendation("para casais", candidate),
    ).toMatchObject({
      score: 15,
      rendered: false,
    });
  });
});
