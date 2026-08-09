import {
  getAssistantMainMenu,
  type AssistantLocale,
  type AssistantMenuValue,
} from "./menu.js";
import { ASSISTANT_PROACTIVE_CONTENT_COPY } from "./proactive-copy.js";
import type {
  AssistantProactiveProfile,
  AssistantProactiveRecentPlace,
  AssistantProactiveWeather,
} from "./proactive-suggestions.js";

export interface AssistantContextualMenuButton {
  label: string;
  value: string;
  priority: number;
  category?: string;
}

export interface AssistantContextualMenuInput {
  locale?: AssistantLocale;
  hour: number;
  profile: AssistantProactiveProfile;
  topInterests?: string[];
  recentPlaces?: AssistantProactiveRecentPlace[];
  weather?: AssistantProactiveWeather | null;
}

export interface AssistantSmartRecommendationInput {
  locale?: AssistantLocale;
  hour: number;
  profile: AssistantProactiveProfile;
  recentPlaces?: AssistantProactiveRecentPlace[];
  weather?: AssistantProactiveWeather | null;
}

function interpolate(
  template: string,
  params: Record<string, string | number>,
): string {
  return Object.entries(params).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

function menuLabel(locale: AssistantLocale, value: AssistantMenuValue): string {
  return (
    getAssistantMainMenu(locale).find((item) => item.value === value)?.label ??
    value
  );
}

function timeButtons(
  locale: AssistantLocale,
  hour: number,
  weather: AssistantProactiveWeather | null | undefined,
): AssistantContextualMenuButton[] {
  const copy = ASSISTANT_PROACTIVE_CONTENT_COPY[locale];
  const buttons: AssistantContextualMenuButton[] = [];

  if (hour >= 5 && hour < 9) {
    buttons.push({
      label: `🌅 ${copy.labels.sunriseHike}`,
      value: "Mirante da Tirolesa",
      priority: 9,
      category: "attractions",
    });
    buttons.push({
      label: `☕ ${copy.labels.breakfast}`,
      value: menuLabel(locale, "restaurants"),
      priority: 8,
      category: "restaurants",
    });
  } else if (hour >= 9 && hour < 12) {
    buttons.push({
      label: menuLabel(locale, "beaches"),
      value: menuLabel(locale, "beaches"),
      priority: 9,
      category: "beaches",
    });
    buttons.push({
      label: menuLabel(locale, "tours"),
      value: menuLabel(locale, "tours"),
      priority: 8,
      category: "tours",
    });
  } else if (hour >= 12 && hour < 15) {
    buttons.push({
      label: `🍽️ ${copy.labels.lunch}`,
      value: menuLabel(locale, "restaurants"),
      priority: 9,
      category: "restaurants",
    });
    buttons.push({
      label: `🤿 ${copy.labels.naturalPools}`,
      value: "Quarta Praia",
      priority: 7,
      category: "beaches",
    });
  } else if (hour >= 15 && hour < 18) {
    buttons.push({
      label: `🌊 ${copy.labels.beachAfternoon}`,
      value: menuLabel(locale, "beaches"),
      priority: 9,
      category: "beaches",
    });
    buttons.push({
      label: menuLabel(locale, "attractions"),
      value: menuLabel(locale, "attractions"),
      priority: 8,
      category: "attractions",
    });
  } else if (hour >= 18 && hour < 20) {
    buttons.push({
      label: `🌇 ${copy.labels.sunset}`,
      value: "Toca do Morcego",
      priority: 10,
      category: "attractions",
    });
    buttons.push({
      label: `🍽️ ${copy.labels.dinner}`,
      value: menuLabel(locale, "restaurants"),
      priority: 9,
      category: "restaurants",
    });
  } else {
    buttons.push({
      label: menuLabel(locale, "nightlife"),
      value: menuLabel(locale, "nightlife"),
      priority: 9,
      category: "nightlife",
    });
    buttons.push({
      label: `🍹 ${copy.labels.bars}`,
      value: menuLabel(locale, "nightlife"),
      priority: 8,
      category: "nightlife",
    });
  }

  if ((weather?.precipprob ?? 0) > 60) {
    buttons.unshift({
      label: `🌧️ ${copy.labels.rainyDay}`,
      value: menuLabel(locale, "attractions"),
      priority: 10,
      category: "attractions",
    });
  }

  return buttons;
}

function contextualIntro(
  input: AssistantContextualMenuInput,
  locale: AssistantLocale,
): string {
  const copy = ASSISTANT_PROACTIVE_CONTENT_COPY[locale];
  const timeGreeting =
    input.hour >= 5 && input.hour < 12
      ? copy.timeGreeting.morning
      : input.hour >= 12 && input.hour < 18
        ? copy.timeGreeting.afternoon
        : copy.timeGreeting.evening;

  if ((input.weather?.precipprob ?? 0) > 60) {
    return interpolate(copy.intro.rain, { timeGreeting });
  }
  if ((input.weather?.temp ?? 0) > 30) {
    return interpolate(copy.intro.hot, {
      timeGreeting,
      temp: Math.round(input.weather?.temp ?? 0),
    });
  }
  if (input.hour >= 16 && input.hour <= 17) {
    return interpolate(copy.intro.sunset, { timeGreeting });
  }

  return interpolate(
    input.profile.visitCount > 1 ? copy.intro.returning : copy.intro.default,
    { timeGreeting },
  );
}

export function getAssistantContextualMenu(
  input: AssistantContextualMenuInput,
) {
  const locale = input.locale ?? "pt";
  const copy = ASSISTANT_PROACTIVE_CONTENT_COPY[locale];
  const recentPlaces = input.recentPlaces ?? [];
  const buttons: AssistantContextualMenuButton[] = [];
  const usedCategories = new Set<string>();

  if (recentPlaces[0]) {
    buttons.push({
      label: `${copy.returnToPlacePrefix}${recentPlaces[0].name}`,
      value: `[place]${recentPlaces[0].name}`,
      priority: 10,
    });
  }

  for (const button of timeButtons(locale, input.hour, input.weather)) {
    if (!button.category || !usedCategories.has(button.category)) {
      buttons.push(button);
      if (button.category) usedCategories.add(button.category);
    }
  }

  for (const interest of input.topInterests ?? []) {
    if (usedCategories.has(interest)) continue;
    const item = getAssistantMainMenu(locale).find(
      (entry) => entry.value === interest,
    );
    if (!item) continue;
    buttons.push({
      label: item.label,
      value: item.label,
      priority: 5,
      category: interest,
    });
    usedCategories.add(interest);
  }

  const defaults: AssistantMenuValue[] = [
    "beaches",
    "restaurants",
    "hotels",
    "attractions",
    "tours",
    "nightlife",
    "shops",
  ];

  for (const category of defaults) {
    if (!usedCategories.has(category) && buttons.length < 7) {
      const label = menuLabel(locale, category);
      buttons.push({ label, value: label, priority: 1, category });
      usedCategories.add(category);
    }
  }

  buttons.push({
    label: `❓ ${copy.help}`,
    value: menuLabel(locale, "help"),
    priority: 0,
    category: "help",
  });
  buttons.sort((a, b) => b.priority - a.priority);

  return {
    buttons: buttons.slice(0, 8),
    intro: contextualIntro(input, locale),
  };
}

export function getAssistantSmartRecommendation(
  input: AssistantSmartRecommendationInput,
) {
  const locale = input.locale ?? "pt";
  const copy = ASSISTANT_PROACTIVE_CONTENT_COPY[locale];
  const recommendations: string[] = [];

  if (input.hour >= 5 && input.hour < 9) {
    recommendations.push(copy.recommendations.sunrise);
  } else if (input.hour >= 9 && input.hour < 12) {
    recommendations.push(
      copy.recommendations.secondBeach,
      copy.recommendations.boatTour,
    );
  } else if (input.hour >= 12 && input.hour < 15) {
    recommendations.push(
      copy.recommendations.lunchVillage,
      copy.recommendations.naturalPools,
    );
  } else if (input.hour >= 15 && input.hour < 18) {
    recommendations.push(
      copy.recommendations.fourthBeach,
      copy.recommendations.zipline,
    );
  } else if (input.hour >= 18 && input.hour < 20) {
    recommendations.push(
      copy.recommendations.toca,
      copy.recommendations.seafrontDinner,
    );
  } else {
    recommendations.push(
      copy.recommendations.nightSecondBeach,
      copy.recommendations.villageBars,
    );
  }

  if (input.profile.behavior.isAdventurer) {
    recommendations.push(copy.recommendations.adventure);
  }
  if (input.profile.behavior.isRomantic) {
    recommendations.push(copy.recommendations.romantic);
  }
  if (input.profile.behavior.isFamilyTrip) {
    recommendations.push(copy.recommendations.family);
  }
  if ((input.weather?.precipprob ?? 0) > 50) {
    recommendations.push(copy.recommendations.rain);
  } else if ((input.weather?.temp ?? 0) > 30) {
    recommendations.push(copy.recommendations.hot);
  }

  const recentNames = (input.recentPlaces ?? []).map((place) =>
    place.name.toLowerCase(),
  );
  const filtered = recommendations.filter(
    (item) =>
      !recentNames.some((name) =>
        item.toLowerCase().includes(name.split(" ")[0]?.toLowerCase() ?? name),
      ),
  );
  const finalRecommendations = (
    filtered.length > 0 ? filtered : recommendations
  ).slice(0, 4);

  return {
    text: interpolate(copy.smartRecIntro, {
      items: finalRecommendations.join("\n\n"),
    }),
    options: [...copy.smartOptions],
    recommendations: finalRecommendations,
  };
}
