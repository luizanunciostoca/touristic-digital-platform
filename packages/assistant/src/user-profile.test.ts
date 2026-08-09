import { describe, expect, it } from "vitest";

import {
  ASSISTANT_PROFILE_STORAGE_KEY,
  createAssistantUserProfileManager,
  createDefaultAssistantUserProfile,
} from "./user-profile.js";

function memoryStorage(seed?: unknown) {
  const values = new Map<string, string>();
  if (seed !== undefined) {
    values.set(ASSISTANT_PROFILE_STORAGE_KEY, JSON.stringify(seed));
  }
  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    dump() {
      return values.get(ASSISTANT_PROFILE_STORAGE_KEY) ?? null;
    },
  };
}

describe("assistant V1 user profile", () => {
  it("creates the canonical tourist profile", () => {
    const profile = createDefaultAssistantUserProfile(() => 1000);
    expect(profile).toMatchObject({
      firstVisit: 1000,
      visitCount: 1,
      lastVisit: 1000,
      userType: "tourist",
      totalInteractions: 0,
      successfulNavigations: 0,
      behavior: { isFirstTimer: true, isResident: false },
    });
  });

  it("deep merges a saved profile and increments the session counter", () => {
    const storage = memoryStorage({
      visitCount: 3,
      behavior: { isRomantic: true },
    });
    const manager = createAssistantUserProfileManager({
      storage,
      now: () => 2000,
    });
    expect(manager.getUserProfile()).toMatchObject({
      visitCount: 4,
      lastVisit: 2000,
      behavior: { isRomantic: true, isResident: false },
    });
  });

  it("records category score, place recency and V1 behavior inference", () => {
    const manager = createAssistantUserProfileManager({
      now: () => new Date("2026-08-09T22:00:00Z").getTime(),
      getLanguage: () => "pt",
    });
    manager.recordInteraction(
      "Quero praia barata para casal com mergulho, moro aqui",
      "beaches",
      { name: "Segunda Praia", category: "beaches", lat: -13, lon: -38 },
    );
    const profile = manager.getUserProfile();
    expect(profile.totalInteractions).toBe(1);
    expect(profile.interests.beaches).toBe(1);
    expect(profile.recentPlaces[0]?.name).toBe("Segunda Praia");
    expect(profile.behavior).toMatchObject({
      prefersEconomic: true,
      isAdventurer: true,
      isRomantic: true,
      likesNature: true,
      isResident: true,
    });
    expect(profile.userType).toBe("resident");
    expect(profile.searchPatterns[0]).toContain("praia barata");
  });

  it("deduplicates recent places and caps interest scores at ten", () => {
    let now = 1000;
    const manager = createAssistantUserProfileManager({ now: () => now });
    for (let index = 0; index < 12; index += 1) {
      now += 1;
      manager.recordInteraction("praia", "beaches", {
        name: "Primeira Praia",
      });
    }
    expect(manager.getTopInterests()).toEqual(["beaches"]);
    expect(manager.getUserProfile().interests.beaches).toBe(10);
    expect(manager.getRecentPlaces()).toHaveLength(1);
  });

  it("manages favorites and successful navigation counters", () => {
    const manager = createAssistantUserProfileManager({ now: () => 123 });
    manager.addFavoritePlace({ name: "Farol" });
    manager.addFavoritePlace({ name: "Farol" });
    manager.addFavoritePlace({ name: "Forte" });
    manager.recordSuccessfulNavigation();
    expect(manager.getFavoritePlaces().map((place) => place.name)).toEqual([
      "Farol",
      "Forte",
    ]);
    expect(manager.getUserProfile().successfulNavigations).toBe(1);
    manager.removeFavoritePlace("Farol");
    expect(manager.getFavoritePlaces().map((place) => place.name)).toEqual([
      "Forte",
    ]);
  });

  it("produces resident suggestions and a profile summary without provider secrets", () => {
    const manager = createAssistantUserProfileManager({
      now: () => new Date("2026-08-09T14:00:00Z").getTime(),
      getLanguage: () => "pt",
    });
    manager.setUserType("resident");
    manager.recordInteraction("quero restaurante barato", "restaurants", {
      name: "Sambass",
    });
    const personalized = manager.getPersonalizedSuggestions();
    expect(personalized.suggestions).toContain("Serviços locais");
    expect(personalized.greeting).toContain("morador");
    expect(manager.getProfileSummaryForLLM()).toContain("Tipo: morador local");
    expect(manager.getProfileSummaryForLLM()).toContain("Restaurantes");
  });

  it("can manually switch between tourist and resident and reset", () => {
    const manager = createAssistantUserProfileManager({ now: () => 5000 });
    manager.setUserType("resident");
    expect(manager.getUserType()).toBe("resident");
    expect(manager.getUserProfile().behavior.isResident).toBe(true);
    manager.setUserType("tourist");
    expect(manager.getUserType()).toBe("tourist");
    manager.recordInteraction("surf", "beaches");
    manager.resetProfile();
    expect(manager.getUserProfile()).toMatchObject({
      visitCount: 1,
      totalInteractions: 0,
      userType: "tourist",
    });
  });

  it("persists mutations through the injected storage port", () => {
    const storage = memoryStorage();
    const manager = createAssistantUserProfileManager({
      storage,
      now: () => 100,
    });
    manager.recordInteraction("restaurante", "restaurants");
    const saved = JSON.parse(storage.dump() ?? "{}") as {
      totalInteractions?: number;
      interests?: { restaurants?: number };
    };
    expect(saved.totalInteractions).toBe(1);
    expect(saved.interests?.restaurants).toBe(1);
  });
});
