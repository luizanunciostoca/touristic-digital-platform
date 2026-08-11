import { describe, expect, it } from "vitest";

import {
  BUSINESS_ONBOARDING_STEPS,
  getBusinessOnboardingSpecialties,
  getBusinessOnboardingStepDefinition,
  validateBusinessOnboardingStepInput,
} from "./onboarding-steps.js";

describe("Business onboarding M56 step contract", () => {
  it("freezes the exact 28-step V1 order", () => {
    expect(BUSINESS_ONBOARDING_STEPS).toHaveLength(28);
    expect(BUSINESS_ONBOARDING_STEPS.map((step) => step.id)).toEqual([
      "welcome",
      "category",
      "specialty",
      "name",
      "objective",
      "audience",
      "ready",
      "arrival",
      "trust-cycle",
      "menu-discovery",
      "text-discovery",
      "name-discovery",
      "voice-discovery",
      "multilingual",
      "always-on",
      "assistant-query",
      "ranking-explanation",
      "context",
      "map",
      "profile",
      "route",
      "conversion",
      "reputation",
      "promotions",
      "analytics",
      "partner-panel",
      "ecosystem",
      "finish",
    ]);
  });

  it("preserves the V1 input contracts", () => {
    expect(validateBusinessOnboardingStepInput("category", "restaurant")).toBe(true);
    expect(validateBusinessOnboardingStepInput("category", "invalid")).toBe(false);
    expect(validateBusinessOnboardingStepInput("specialty", "Frutos do mar", { category: "restaurant" })).toBe(true);
    expect(validateBusinessOnboardingStepInput("specialty", "Piscina", { category: "restaurant" })).toBe(false);
    expect(validateBusinessOnboardingStepInput("name", "Toca do Morcego")).toBe(true);
    expect(validateBusinessOnboardingStepInput("name", " ")).toBe(false);
    expect(validateBusinessOnboardingStepInput("objective", "clients")).toBe(true);
    expect(validateBusinessOnboardingStepInput("audience", "international")).toBe(true);
  });

  it("derives category-specific specialties and detailed copy", () => {
    expect(getBusinessOnboardingSpecialties("lodging").map((option) => option.label)).toContain("Piscina");
    expect(getBusinessOnboardingStepDefinition("voice-discovery").description).toContain("microfone real");
    expect(getBusinessOnboardingStepDefinition("finish").primary).toBe("Continuar para cadastro");
  });
});
