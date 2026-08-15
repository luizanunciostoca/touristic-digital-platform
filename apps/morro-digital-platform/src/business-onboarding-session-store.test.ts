import { describe, expect, it } from "vitest";

import {
  createBusinessOnboardingSession,
  setBusinessOnboardingStatus,
  transitionBusinessOnboarding,
  type BusinessOnboardingSession,
} from "@touristic/business/onboarding";

import {
  BUSINESS_ONBOARDING_BROWSER_SESSION_KEY,
  BusinessOnboardingBrowserSessionStore,
} from "./business-onboarding-session-store.js";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

function withContext(
  session: BusinessOnboardingSession,
  context: Readonly<Record<string, unknown>>,
): BusinessOnboardingSession {
  return Object.freeze({
    ...session,
    conversationDraft: Object.freeze({
      ...session.conversationDraft,
      context: Object.freeze({ ...context }),
    }),
  });
}

describe("BusinessOnboardingBrowserSessionStore", () => {
  it("restores a paused step with bounded allowlisted context", () => {
    const storage = new MemoryStorage();
    const store = new BusinessOnboardingBrowserSessionStore(storage);
    const createdAt = new Date("2026-08-15T03:00:00.000Z");
    let session = createBusinessOnboardingSession({
      context: {
        businessName: "Toca do Morcego",
        category: "events",
      },
      locale: "pt-BR",
      now: createdAt,
    });
    session = transitionBusinessOnboarding(session, "name", {
      now: new Date("2026-08-15T03:05:00.000Z"),
    });
    session = withContext(session, {
      ...session.conversationDraft.context,
      businessVoiceDiscoveryReady: true,
      credential: "must-not-persist",
    });
    session = setBusinessOnboardingStatus(session, "PAUSED", {
      now: new Date("2026-08-15T03:06:00.000Z"),
      reason: "user_pause",
    });

    store.save(session);
    const restored = store.load(new Date("2026-08-15T04:00:00.000Z"));

    expect(restored?.status).toBe("PAUSED");
    expect(restored?.conversationDraft.currentStepId).toBe("name");
    expect(restored?.selectedLanguage).toBe("pt-BR");
    expect(restored?.conversationDraft.context).toMatchObject({
      businessName: "Toca do Morcego",
      category: "events",
      businessVoiceDiscoveryReady: true,
    });
    expect(restored?.conversationDraft.context.credential).toBeUndefined();
  });

  it("clears expired or structurally invalid persisted sessions", () => {
    const storage = new MemoryStorage();
    const store = new BusinessOnboardingBrowserSessionStore(storage);
    const session = createBusinessOnboardingSession({
      now: new Date("2026-08-01T12:00:00.000Z"),
    });

    store.save(session);
    expect(
      store.load(new Date("2026-08-09T12:00:00.000Z")),
    ).toBeNull();
    expect(storage.getItem(BUSINESS_ONBOARDING_BROWSER_SESSION_KEY)).toBeNull();

    storage.setItem(
      BUSINESS_ONBOARDING_BROWSER_SESSION_KEY,
      JSON.stringify({ version: 999, status: "ACTIVE", stepId: "welcome" }),
    );
    expect(store.load(new Date("2026-08-15T04:00:00.000Z"))).toBeNull();
    expect(storage.getItem(BUSINESS_ONBOARDING_BROWSER_SESSION_KEY)).toBeNull();
  });

  it("removes terminal sessions instead of making them resumable", () => {
    const storage = new MemoryStorage();
    const store = new BusinessOnboardingBrowserSessionStore(storage);
    const active = createBusinessOnboardingSession({
      now: new Date("2026-08-15T03:00:00.000Z"),
    });

    store.save(active);
    expect(storage.getItem(BUSINESS_ONBOARDING_BROWSER_SESSION_KEY)).not.toBeNull();

    const completed = setBusinessOnboardingStatus(active, "COMPLETED", {
      now: new Date("2026-08-15T03:10:00.000Z"),
    });
    store.save(completed);
    expect(storage.getItem(BUSINESS_ONBOARDING_BROWSER_SESSION_KEY)).toBeNull();
  });

  it("remains usable when browser storage is unavailable", () => {
    const store = new BusinessOnboardingBrowserSessionStore(null);
    const session = createBusinessOnboardingSession();

    expect(() => store.save(session)).not.toThrow();
    expect(store.load()).toBeNull();
    expect(() => store.clear()).not.toThrow();
  });
});
