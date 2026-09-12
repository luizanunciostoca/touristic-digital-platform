import { describe, expect, it } from "vitest";
import {
  hasCompletedPublicOnboarding,
  persistPublicOnboardingCompletion,
  PUBLIC_ONBOARDING_STORAGE_KEY,
  type PublicOnboardingStorage,
} from "./public-onboarding.js";

class MemoryStorage implements PublicOnboardingStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("public onboarding persistence", () => {
  it("starts incomplete when the browser has no explicit completion marker", () => {
    const storage = new MemoryStorage();

    expect(hasCompletedPublicOnboarding(storage)).toBe(false);
    expect(storage.values.has(PUBLIC_ONBOARDING_STORAGE_KEY)).toBe(false);
  });

  it("persists only the canonical explicit completion marker", () => {
    const storage = new MemoryStorage();

    expect(persistPublicOnboardingCompletion(storage)).toBe(true);
    expect(storage.values.get(PUBLIC_ONBOARDING_STORAGE_KEY)).toBe("1");
    expect(hasCompletedPublicOnboarding(storage)).toBe(true);
  });

  it("fails open when browser storage is unavailable", () => {
    const storage: PublicOnboardingStorage = {
      getItem() {
        throw new Error("storage unavailable");
      },
      setItem() {
        throw new Error("storage unavailable");
      },
    };

    expect(hasCompletedPublicOnboarding(storage)).toBe(false);
    expect(persistPublicOnboardingCompletion(storage)).toBe(false);
    expect(hasCompletedPublicOnboarding(null)).toBe(false);
    expect(persistPublicOnboardingCompletion(undefined)).toBe(false);
  });
});
