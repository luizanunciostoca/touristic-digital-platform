import { describe, expect, it, vi } from "vitest";

import {
  BUSINESS_ONBOARDING_GUARD_TIMEOUT_MS,
  BusinessOnboardingHostController,
} from "./onboarding-host.js";
import {
  createBusinessOnboardingSession,
  setBusinessOnboardingStatus,
} from "./onboarding.js";

describe("BusinessOnboardingHostController", () => {
  it("starts at welcome and exposes chapter/step progress", () => {
    const host = new BusinessOnboardingHostController({
      now: new Date("2026-08-11T12:00:00.000Z"),
    });
    const snapshot = host.snapshot();

    expect(snapshot.stepId).toBe("welcome");
    expect(snapshot.stepNumber).toBe(1);
    expect(snapshot.totalSteps).toBe(28);
    expect(snapshot.canGoBack).toBe(false);
    expect(snapshot.canGoForward).toBe(true);
    expect(snapshot.chapter?.id).toBe("business-foundation");
  });

  it("moves forward/back while preserving immutable session transitions", async () => {
    const host = new BusinessOnboardingHostController();
    const initial = host.snapshot().session;

    const category = await host.next(new Date("2026-08-11T12:01:00.000Z"));
    expect(category.stepId).toBe("category");
    expect(category.session).not.toBe(initial);

    const welcome = await host.back(new Date("2026-08-11T12:02:00.000Z"));
    expect(welcome.stepId).toBe("welcome");
  });

  it("resumes a paused non-expired session and rejects an expired one", () => {
    const base = createBusinessOnboardingSession({
      locale: "es",
      now: new Date("2026-08-01T12:00:00.000Z"),
    });
    const paused = setBusinessOnboardingStatus(base, "PAUSED", {
      now: new Date("2026-08-01T12:05:00.000Z"),
    });

    const resumed = new BusinessOnboardingHostController({
      session: paused,
      now: new Date("2026-08-02T12:00:00.000Z"),
    }).snapshot();
    expect(resumed.session.status).toBe("ACTIVE");
    expect(resumed.session.selectedLanguage).toBe("es");

    const expired = new BusinessOnboardingHostController({
      session: paused,
      locale: "pt",
      now: new Date("2026-08-20T12:00:00.000Z"),
    }).snapshot();
    expect(expired.stepId).toBe("welcome");
    expect(expired.session.createdAt).toBe("2026-08-20T12:00:00.000Z");
  });

  it("fails closed when a transition guard denies", async () => {
    const beforeTransition = vi.fn(() => false);
    const host = new BusinessOnboardingHostController({ beforeTransition });

    const snapshot = await host.next();
    expect(snapshot.stepId).toBe("welcome");
    expect(beforeTransition).toHaveBeenCalledOnce();
  });

  it("fails closed when an async guard exceeds the bounded timeout", async () => {
    vi.useFakeTimers();
    try {
      const host = new BusinessOnboardingHostController({
        guardTimeoutMs: 100,
        beforeTransition: () => new Promise<boolean>(() => undefined),
      });
      const pending = host.next();
      await vi.advanceTimersByTimeAsync(101);
      const snapshot = await pending;
      expect(snapshot.stepId).toBe("welcome");
      expect(BUSINESS_ONBOARDING_GUARD_TIMEOUT_MS).toBe(8000);
    } finally {
      vi.useRealTimers();
    }
  });

  it("pauses, restarts and completes without mixing Auth session state", async () => {
    const host = new BusinessOnboardingHostController({ locale: "he" });
    await host.next();

    expect(host.pause().session.status).toBe("PAUSED");
    expect(host.restart().stepId).toBe("welcome");
    expect(host.snapshot().session.selectedLanguage).toBe("he");
    expect(host.complete().session.status).toBe("COMPLETED");
  });
});
