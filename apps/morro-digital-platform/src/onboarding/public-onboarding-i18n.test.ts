import { describe, expect, it } from "vitest";

import {
  getPublicOnboardingCopy,
  publicOnboardingLocale,
} from "./public-onboarding-i18n.js";

describe("public onboarding i18n", () => {
  it("normalizes the four supported browser language families", () => {
    expect(publicOnboardingLocale("pt-PT")).toBe("pt");
    expect(publicOnboardingLocale("en-GB")).toBe("en");
    expect(publicOnboardingLocale("es-AR")).toBe("es");
    expect(publicOnboardingLocale("he-IL")).toBe("he");
    expect(publicOnboardingLocale("iw-IL")).toBe("he");
  });

  it("keeps Portuguese as the local fallback for missing onboarding locale", () => {
    expect(publicOnboardingLocale(null)).toBe("pt");
    expect(publicOnboardingLocale("fr-FR")).toBe("pt");
  });

  it("provides complete localized first-run and six-step tour copy without the retired Assistant trigger step", () => {
    const expectations = [
      ["pt", "Bem-vindo ao Morro Digital", "Passo 1 de 6"],
      ["en", "Welcome to Morro Digital", "Step 1 of 6"],
      ["es", "Bienvenido a Morro Digital", "Paso 1 de 6"],
      ["he", "ברוכים הבאים ל-Morro Digital", "שלב 1 מתוך 6"],
    ] as const;

    for (const [locale, title, step] of expectations) {
      const copy = getPublicOnboardingCopy(locale);
      expect(copy.title).toBe(title);
      expect(copy.tour.steps).toHaveLength(6);
      expect(copy.tour.step(1, 6)).toBe(step);
      expect(
        copy.tour.steps.some((item) => item.description.includes("botão")),
      ).toBe(false);
      expect(
        copy.tour.steps.some((item) => item.description.includes("button")),
      ).toBe(false);
      expect(copy.startTitle.length).toBeGreaterThan(0);
      expect(copy.skip.length).toBeGreaterThan(0);
      expect(copy.tour.done.length).toBeGreaterThan(0);
    }
  });
});
