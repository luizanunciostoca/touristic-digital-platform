export const ASSISTANT_PROACTIVE_COOLDOWN_MS = 5 * 60 * 1000;

export interface AssistantProactiveWeather {
  temp: number;
  precipprob: number;
  condition?: string;
}

export interface AssistantProactiveRecentPlace {
  name: string;
  category?: string | null;
  timestamp: number;
}

export interface AssistantProactiveProfile {
  visitCount: number;
  totalInteractions: number;
  behavior: {
    likesNature: boolean;
    isNightOwl: boolean;
    isFirstTimer: boolean;
    isAdventurer: boolean;
    isRomantic: boolean;
    isFamilyTrip: boolean;
  };
}

export type AssistantProactiveSuggestionType =
  | "sunset"
  | "morning_beach"
  | "nightlife"
  | "dinner"
  | "rainy_day"
  | "hot_day"
  | "returning_user"
  | "first_timer"
  | "adventure"
  | "romantic"
  | "family"
  | "after_beach";

export interface AssistantProactiveSuggestion {
  type: AssistantProactiveSuggestionType;
  priority: number;
}

export interface AssistantProactiveSuggestionInput {
  hour: number;
  profile: AssistantProactiveProfile;
  recentPlaces?: AssistantProactiveRecentPlace[];
  weather?: AssistantProactiveWeather | null;
  now?: number;
}

export interface AssistantProactiveSuggestionEngineOptions {
  now?: () => number;
  cooldownMs?: number;
}

function timeSuggestion(
  hour: number,
  profile: AssistantProactiveProfile,
): AssistantProactiveSuggestion | null {
  if (hour >= 16 && hour <= 17) return { type: "sunset", priority: 0.95 };
  if (hour >= 8 && hour <= 10 && profile.behavior.likesNature) {
    return { type: "morning_beach", priority: 0.75 };
  }
  if (hour >= 21 && profile.behavior.isNightOwl) {
    return { type: "nightlife", priority: 0.7 };
  }
  if (hour >= 18 && hour <= 19) return { type: "dinner", priority: 0.65 };
  return null;
}

function weatherSuggestion(
  weather: AssistantProactiveWeather | null | undefined,
  hour: number,
): AssistantProactiveSuggestion | null {
  if (!weather) return null;
  if (weather.precipprob > 60 && hour >= 8 && hour <= 18) {
    return { type: "rainy_day", priority: 0.85 };
  }
  if (weather.temp > 32 && hour >= 10 && hour <= 16) {
    return { type: "hot_day", priority: 0.7 };
  }
  return null;
}

function profileSuggestion(
  profile: AssistantProactiveProfile,
): AssistantProactiveSuggestion | null {
  if (profile.visitCount === 2) return { type: "returning_user", priority: 0.6 };
  if (profile.behavior.isFirstTimer && profile.totalInteractions <= 3) {
    return { type: "first_timer", priority: 0.8 };
  }
  if (profile.behavior.isAdventurer && profile.totalInteractions >= 5) {
    return { type: "adventure", priority: 0.65 };
  }
  if (profile.behavior.isRomantic && profile.totalInteractions >= 3) {
    return { type: "romantic", priority: 0.65 };
  }
  if (profile.behavior.isFamilyTrip && profile.totalInteractions >= 3) {
    return { type: "family", priority: 0.65 };
  }
  return null;
}

function historySuggestion(
  recentPlaces: AssistantProactiveRecentPlace[],
  hour: number,
  now: number,
): AssistantProactiveSuggestion | null {
  const lastPlace = recentPlaces[0];
  if (!lastPlace) return null;
  const minutesSince = (now - lastPlace.timestamp) / (1000 * 60);
  if (
    lastPlace.category === "beaches" &&
    minutesSince < 60 &&
    hour >= 11 &&
    hour <= 14
  ) {
    return { type: "after_beach", priority: 0.75 };
  }
  return null;
}

export function createAssistantProactiveSuggestionEngine(
  options: AssistantProactiveSuggestionEngineOptions = {},
) {
  const clock = options.now ?? Date.now;
  const cooldownMs = options.cooldownMs ?? ASSISTANT_PROACTIVE_COOLDOWN_MS;
  let lastSuggestionTime = 0;

  return {
    getSuggestion(
      input: AssistantProactiveSuggestionInput,
    ): AssistantProactiveSuggestion | null {
      const now = input.now ?? clock();
      if (now - lastSuggestionTime < cooldownMs) return null;

      const suggestions = [
        timeSuggestion(input.hour, input.profile),
        weatherSuggestion(input.weather, input.hour),
        profileSuggestion(input.profile),
        historySuggestion(input.recentPlaces ?? [], input.hour, now),
      ].filter((item): item is AssistantProactiveSuggestion => item !== null);

      if (suggestions.length === 0) return null;
      suggestions.sort((a, b) => b.priority - a.priority);
      const best = suggestions[0];
      if (!best || best.priority < 0.6) return null;

      lastSuggestionTime = now;
      return { ...best };
    },

    resetCooldown(): void {
      lastSuggestionTime = 0;
    },
  };
}
