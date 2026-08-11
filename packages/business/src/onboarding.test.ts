import { describe, expect, it } from "vitest";

import {
  BUSINESS_ONBOARDING_CHAPTERS,
  BUSINESS_ONBOARDING_TTL_MS,
  buildBusinessTutorialRecommendationCandidate,
  completeBusinessOnboardingCapability,
  createBusinessOnboardingSession,
  evaluateBusinessTutorialRecommendation,
  getBusinessOnboardingChapter,
  isBusinessOnboardingResumable,
  scoreBusinessTutorialRecommendation,
  setBusinessOnboardingStatus,
  skipBusinessOnboardingCapability,
  transitionBusinessOnboarding,
} from "./onboarding.js";

const now = new Date("2026-08-10T22:30:00-03:00");

describe("M53 Business onboarding core", () => {
  it("freezes the five V1 chapters and 28 ordered steps", () => {
    expect(BUSINESS_ONBOARDING_CHAPTERS).toHaveLength(5);
    expect(
      BUSINESS_ONBOARDING_CHAPTERS.flatMap((chapter) => chapter.steps),
    ).toHaveLength(28);
    expect(BUSINESS_ONBOARDING_CHAPTERS[0]?.steps).toEqual([
      "welcome",
      "category",
      "specialty",
      "name",
      "objective",
      "audience",
      "ready",
    ]);
    expect(BUSINESS_ONBOARDING_CHAPTERS.at(-1)?.steps).toEqual([
      "analytics",
      "partner-panel",
      "ecosystem",
      "finish",
    ]);
  });

  it("maps steps to frozen chapter metadata", () => {
    expect(getBusinessOnboardingChapter("voice-discovery")).toMatchObject({
      id: "tourist-discovery",
      chapterNumber: 2,
      chapterStepNumber: 6,
      chapterStepTotal: 6,
      totalChapters: 5,
    });
    expect(getBusinessOnboardingChapter("unknown")).toBeNull();
  });

  it("creates onboarding state independently from Auth session state", () => {
    const session = createBusinessOnboardingSession({
      now,
      locale: "pt-BR",
      context: {
        businessName: " Toca do Morcego ",
        category: "nightlife",
        specialty: "sunset",
        objective: "mais reservas",
      },
    });

    expect(session).toMatchObject({
      version: 2,
      status: "ACTIVE",
      currentState: "WELCOME",
      previousState: null,
      selectedLanguage: "pt-BR",
      selectedObjective: "mais reservas",
      businessDraft: {
        displayName: "Toca do Morcego",
        normalizedName: "toca do morcego",
        categoryId: "nightlife",
        specialtyTags: ["sunset"],
        environment: "sandbox",
        publishable: false,
      },
      conversationDraft: {
        currentStepId: "welcome",
        status: "ACTIVE",
        reason: "created",
      },
    });
    expect(Date.parse(session.expiresAt) - Date.parse(session.createdAt)).toBe(
      BUSINESS_ONBOARDING_TTL_MS,
    );
    expect(Object.isFrozen(session)).toBe(true);
    expect(Object.isFrozen(session.businessDraft)).toBe(true);
    expect(Object.isFrozen(session.conversationDraft)).toBe(true);
  });

  it("preserves the V1 state mapping while advancing conversation steps", () => {
    const session = createBusinessOnboardingSession({ now });
    const next = transitionBusinessOnboarding(session, "category", {
      now: new Date(now.getTime() + 1_000),
    });

    expect(next.currentState).toBe("BUSINESS_CATEGORY");
    expect(next.previousState).toBe("WELCOME");
    expect(next.conversationDraft.currentStepId).toBe("category");
    expect(next.conversationDraft.reason).toBe("progress");
  });

  it("resumes paused sessions through a transition without touching Auth", () => {
    const session = createBusinessOnboardingSession({ now });
    const paused = setBusinessOnboardingStatus(session, "PAUSED", {
      now: new Date(now.getTime() + 1_000),
      reason: "user_exit",
    });
    const resumed = transitionBusinessOnboarding(paused, "name", {
      now: new Date(now.getTime() + 2_000),
      reason: "resume",
    });

    expect(paused.status).toBe("PAUSED");
    expect(resumed.status).toBe("ACTIVE");
    expect(resumed.conversationDraft.status).toBe("ACTIVE");
    expect(resumed.currentState).toBe("BUSINESS_IDENTITY");
  });

  it("treats only active/paused unexpired sessions as resumable", () => {
    const session = createBusinessOnboardingSession({ now });
    expect(isBusinessOnboardingResumable(session, now)).toBe(true);
    expect(
      isBusinessOnboardingResumable(
        session,
        new Date(now.getTime() + BUSINESS_ONBOARDING_TTL_MS),
      ),
    ).toBe(false);
    expect(
      isBusinessOnboardingResumable(
        setBusinessOnboardingStatus(session, "COMPLETED", { now }),
        now,
      ),
    ).toBe(false);
  });

  it("moves completion to the frozen COMPLETED state", () => {
    const session = createBusinessOnboardingSession({ now });
    const completed = setBusinessOnboardingStatus(session, "COMPLETED", {
      now: new Date(now.getTime() + 5_000),
    });

    expect(completed.status).toBe("COMPLETED");
    expect(completed.currentState).toBe("COMPLETED");
    expect(completed.conversationDraft.status).toBe("COMPLETED");
  });

  it("deduplicates completed and skipped capability sets", () => {
    const session = createBusinessOnboardingSession({ now });
    const completed = completeBusinessOnboardingCapability(
      completeBusinessOnboardingCapability(
        session,
        "business_location_confirmed",
      ),
      "business_location_confirmed",
    );
    const skipped = skipBusinessOnboardingCapability(
      skipBusinessOnboardingCapability(completed, "voice_search"),
      "voice_search",
    );

    expect(skipped.completedCapabilities).toEqual([
      "business_location_confirmed",
    ]);
    expect(skipped.skippedCapabilities).toEqual(["voice_search"]);
  });
});

describe("M58 Business tutorial recommendation sandbox", () => {
  const candidate = buildBusinessTutorialRecommendationCandidate(
    {
      businessName: "Toca do Morcego",
      category: "events",
      specialty: "sunset",
      objective: "mais reservas",
      audience: "casais",
      businessLocation: {
        coordinates: { latitude: -13.377, longitude: -38.913 },
        source: "catalog",
      },
    },
    { categoryLabel: "Eventos", cta: "Ver empresa", id: "tutorial-toca" },
  );

  it("builds an immutable tutorial-only candidate excluded from real metrics", () => {
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

  it("preserves the frozen V1 recommendation weights and threshold", () => {
    expect(scoreBusinessTutorialRecommendation("Quero uma festa hoje", candidate)).toBe(55);
    expect(scoreBusinessTutorialRecommendation("Quero ver Toca do Morcego", candidate)).toBe(100);
    expect(scoreBusinessTutorialRecommendation("procuro sunset", candidate)).toBe(30);
    expect(scoreBusinessTutorialRecommendation("algo tranquilo", candidate)).toBe(0);
  });

  it("renders only scores at or above the V1 threshold without publishing real data", () => {
    expect(evaluateBusinessTutorialRecommendation("Quero uma festa", candidate)).toMatchObject({
      score: 55,
      rendered: true,
      tutorial: true,
      excludeFromBusinessMetrics: true,
    });
    expect(evaluateBusinessTutorialRecommendation("procuro sunset", candidate)).toMatchObject({
      score: 30,
      rendered: false,
    });
  });
});
