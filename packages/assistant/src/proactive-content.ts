import {
  getAssistantMainMenu,
  type AssistantLocale,
  type AssistantMenuValue,
} from "./menu.js";
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

const TEXT = {
  pt: {
    returnPrefix: "🔄 Voltar a ",
    help: "Ajuda",
    breakfast: "Café da manhã",
    lunch: "Almoço",
    naturalPools: "Piscinas naturais",
    beachAfternoon: "Praias (tarde)",
    sunset: "Pôr do sol",
    dinner: "Jantar",
    bars: "Bares",
    rainyDay: "Dia de chuva — o que fazer?",
    greeting: { morning: "Bom dia", afternoon: "Boa tarde", evening: "Boa noite" },
    intro: {
      rain: "{greeting}! Parece que pode chover hoje. Veja o que fazer em dias de chuva em Morro 🌧️",
      hot: "{greeting}! Dia quente ({temp}°C)! Perfeito para as piscinas naturais 🌊",
      sunset: "{greeting}! Hora mágica do pôr do sol em Morro! Não perca 🌅",
      returning: "{greeting}! Bem-vindo de volta! Como posso ajudar hoje? 🌴",
      default: "{greeting}! Sou seu guia de Morro de São Paulo. Como posso ajudar? 🌴",
    },
    recommendations: {
      sunrise: "🌅 **Nascer do sol no Farol do Morro** — vista panorâmica incrível de manhã cedo",
      secondBeach: "🏖️ **Segunda Praia** — melhor horário para nadar antes do sol forte",
      boatTour: "⛵ **Passeio de barco** — saídas pela manhã com mar calmo",
      lunchVillage: "🍽️ **Almoço na vila** — restaurantes com frutos do mar frescos",
      naturalPools: "🤿 **Piscinas naturais** — maré baixa à tarde é ideal",
      fourthBeach: "🌊 **Quarta Praia** — menos movimento e água cristalina à tarde",
      zipline: "🎢 **Tirolesa** — adrenalina com vista para o mar",
      toca: "🌇 **Toca do Morcego** — melhor pôr do sol da ilha, não perca!",
      seafrontDinner: "🍽️ **Jantar à beira-mar** — restaurantes com mesas na areia",
      nightSecondBeach: "🎶 **Segunda Praia à noite** — shows ao vivo e luau",
      villageBars: "🍹 **Bares da vila** — ambiente animado e drinks tropicais",
      adventure: "🤿 **Mergulho nas piscinas naturais** — visibilidade incrível",
      romantic: "💑 **Jantar romântico na Terceira Praia** — mesas na areia ao luar",
      family: "👨‍👩‍👧 **Primeira Praia** — calma e segura para crianças",
      rain: "🏛️ **Forte de Tapirandu** — visita histórica coberta para dias de chuva",
      hot: "🌊 **Piscinas naturais** — refrescante nos dias mais quentes",
    },
    smartIntro:
      "Com base no momento atual e no seu perfil, aqui estão minhas recomendações:\n\n{items}\n\nQuer mais detalhes sobre algum desses lugares?",
    smartOptions: ["Ver no mapa", "Como chegar", "Ver fotos", "Outras sugestões", "Voltar ao menu"],
  },
  en: {
    returnPrefix: "🔄 Return to ",
    help: "Help",
    breakfast: "Breakfast",
    lunch: "Lunch",
    naturalPools: "Natural pools",
    beachAfternoon: "Beaches (afternoon)",
    sunset: "Sunset",
    dinner: "Dinner",
    bars: "Bars",
    rainyDay: "Rainy day — what to do?",
    greeting: { morning: "Good morning", afternoon: "Good afternoon", evening: "Good evening" },
    intro: {
      rain: "{greeting}! It may rain today. Here are good things to do in Morro on a rainy day 🌧️",
      hot: "{greeting}! Hot day ({temp}°C)! Perfect for the natural pools 🌊",
      sunset: "{greeting}! It is the magic hour for sunset in Morro. Don't miss it 🌅",
      returning: "{greeting}! Welcome back! How can I help today? 🌴",
      default: "{greeting}! I am your Morro de São Paulo guide. How can I help? 🌴",
    },
    recommendations: {
      sunrise: "🌅 **Sunrise at Farol do Morro** — amazing panoramic views early in the morning",
      secondBeach: "🏖️ **Second Beach** — the best time to swim before the stronger sun",
      boatTour: "⛵ **Boat tour** — morning departures with calmer sea",
      lunchVillage: "🍽️ **Lunch in the village** — restaurants with fresh seafood",
      naturalPools: "🤿 **Natural pools** — low tide in the afternoon is ideal",
      fourthBeach: "🌊 **Fourth Beach** — less crowded and crystal-clear water in the afternoon",
      zipline: "🎢 **Zipline** — adrenaline with sea views",
      toca: "🌇 **Toca do Morcego** — the island's best sunset, don't miss it!",
      seafrontDinner: "🍽️ **Seafront dinner** — restaurants with tables on the sand",
      nightSecondBeach: "🎶 **Second Beach at night** — live shows and luau atmosphere",
      villageBars: "🍹 **Village bars** — lively atmosphere and tropical drinks",
      adventure: "🤿 **Diving in the natural pools** — excellent visibility",
      romantic: "💑 **Romantic dinner at Third Beach** — moonlit tables on the sand",
      family: "👨‍👩‍👧 **First Beach** — calm and safe for children",
      rain: "🏛️ **Forte de Tapirandu** — a great historical stop for rainy days",
      hot: "🌊 **Natural pools** — refreshing on hotter days",
    },
    smartIntro:
      "Based on the current moment and your profile, here are my recommendations:\n\n{items}\n\nWould you like more details about any of these places?",
    smartOptions: ["View on map", "Get directions", "View photos", "Other suggestions", "Back to menu"],
  },
  es: {
    returnPrefix: "🔄 Volver a ",
    help: "Ayuda",
    breakfast: "Desayuno",
    lunch: "Almuerzo",
    naturalPools: "Piscinas naturales",
    beachAfternoon: "Playas (tarde)",
    sunset: "Atardecer",
    dinner: "Cena",
    bars: "Bares",
    rainyDay: "Día de lluvia — ¿qué hacer?",
    greeting: { morning: "Buenos días", afternoon: "Buenas tardes", evening: "Buenas noches" },
    intro: {
      rain: "{greeting}! Parece que puede llover hoy. Mira qué hacer en Morro en un día de lluvia 🌧️",
      hot: "{greeting}! ¡Día caluroso ({temp}°C)! Perfecto para las piscinas naturales 🌊",
      sunset: "{greeting}! ¡Hora mágica del atardecer en Morro! No te lo pierdas 🌅",
      returning: "{greeting}! ¡Bienvenido de nuevo! ¿Cómo puedo ayudarte hoy? 🌴",
      default: "{greeting}! Soy tu guía de Morro de São Paulo. ¿Cómo puedo ayudarte? 🌴",
    },
    recommendations: {
      sunrise: "🌅 **Amanecer en Farol do Morro** — increíble vista panorámica temprano",
      secondBeach: "🏖️ **Segunda Praia** — el mejor horario para nadar antes del sol fuerte",
      boatTour: "⛵ **Paseo en barco** — salidas por la mañana con mar más tranquilo",
      lunchVillage: "🍽️ **Almuerzo en la villa** — restaurantes con mariscos frescos",
      naturalPools: "🤿 **Piscinas naturales** — la marea baja por la tarde es ideal",
      fourthBeach: "🌊 **Quarta Praia** — menos movimiento y agua cristalina por la tarde",
      zipline: "🎢 **Tirolesa** — adrenalina con vista al mar",
      toca: "🌇 **Toca do Morcego** — uno de los mejores atardeceres de la isla",
      seafrontDinner: "🍽️ **Cena frente al mar** — restaurantes con mesas en la arena",
      nightSecondBeach: "🎶 **Segunda Praia de noche** — música en vivo y ambiente de luau",
      villageBars: "🍹 **Bares de la villa** — ambiente animado y bebidas tropicales",
      adventure: "🤿 **Buceo en las piscinas naturales** — excelente visibilidad",
      romantic: "💑 **Cena romántica en Terceira Praia** — mesas en la arena bajo la luna",
      family: "👨‍👩‍👧 **Primeira Praia** — tranquila y segura para niños",
      rain: "🏛️ **Forte de Tapirandu** — visita histórica para días de lluvia",
      hot: "🌊 **Piscinas naturales** — refrescantes en los días más calurosos",
    },
    smartIntro:
      "Según el momento actual y tu perfil, estas son mis recomendaciones:\n\n{items}\n\n¿Quieres más detalles sobre alguno de estos lugares?",
    smartOptions: ["Ver en el mapa", "Cómo llegar", "Ver fotos", "Otras sugerencias", "Volver al menú"],
  },
  he: {
    returnPrefix: "🔄 חזרה אל ",
    help: "עזרה",
    breakfast: "ארוחת בוקר",
    lunch: "ארוחת צהריים",
    naturalPools: "בריכות טבעיות",
    beachAfternoon: "חופים (אחר הצהריים)",
    sunset: "שקיעה",
    dinner: "ארוחת ערב",
    bars: "ברים",
    rainyDay: "יום גשום — מה עושים?",
    greeting: { morning: "בוקר טוב", afternoon: "צהריים טובים", evening: "ערב טוב" },
    intro: {
      rain: "{greeting}! נראה שייתכן גשם היום. הנה דברים שאפשר לעשות במורו ביום גשום 🌧️",
      hot: "{greeting}! יום חם ({temp}°C)! מושלם לבריכות הטבעיות 🌊",
      sunset: "{greeting}! שעת הקסם של השקיעה במורו הגיעה! אל תפספס 🌅",
      returning: "{greeting}! ברוך שובך! איך אפשר לעזור היום? 🌴",
      default: "{greeting}! אני המדריך שלך למורו דה סאו פאולו. איך אפשר לעזור? 🌴",
    },
    recommendations: {
      sunrise: "🌅 **זריחה ב-Farol do Morro** — נוף פנורמי מרהיב מוקדם בבוקר",
      secondBeach: "🏖️ **החוף השני** — הזמן הטוב ביותר לשחות לפני השמש החזקה",
      boatTour: "⛵ **שיט בסירה** — יציאות בבוקר כשהים רגוע יותר",
      lunchVillage: "🍽️ **ארוחת צהריים בכפר** — מסעדות עם פירות ים טריים",
      naturalPools: "🤿 **בריכות טבעיות** — שפל אחר הצהריים הוא אידיאלי",
      fourthBeach: "🌊 **החוף הרביעי** — פחות עמוס ומים צלולים אחר הצהריים",
      zipline: "🎢 **אומגה** — אדרנלין עם נוף לים",
      toca: "🌇 **Toca do Morcego** — שקיעה מיוחדת באי",
      seafrontDinner: "🍽️ **ארוחת ערב מול הים** — מסעדות עם שולחנות על החול",
      nightSecondBeach: "🎶 **החוף השני בלילה** — הופעות חיות ואווירת לואו",
      villageBars: "🍹 **ברים בכפר** — אווירה תוססת ומשקאות טרופיים",
      adventure: "🤿 **צלילה בבריכות הטבעיות** — ראות מצוינת",
      romantic: "💑 **ארוחת ערב רומנטית בחוף השלישי** — שולחנות על החול לאור הירח",
      family: "👨‍👩‍👧 **החוף הראשון** — רגוע ובטוח לילדים",
      rain: "🏛️ **Forte de Tapirandu** — ביקור היסטורי מתאים ליום גשום",
      hot: "🌊 **בריכות טבעיות** — מרעננות בימים החמים",
    },
    smartIntro:
      "בהתבסס על הזמן הנוכחי והפרופיל שלך, הנה ההמלצות שלי:\n\n{items}\n\nרוצה פרטים נוספים על אחד המקומות?",
    smartOptions: ["הצג במפה", "הוראות הגעה", "הצג תמונות", "הצעות נוספות", "חזרה לתפריט"],
  },
} as const;

function interpolate(template: string, params: Record<string, string | number>): string {
  return Object.entries(params).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

function menuLabel(locale: AssistantLocale, value: AssistantMenuValue): string {
  return getAssistantMainMenu(locale).find((item) => item.value === value)?.label ?? value;
}

function timeButtons(
  locale: AssistantLocale,
  hour: number,
  weather: AssistantProactiveWeather | null | undefined,
): AssistantContextualMenuButton[] {
  const t = TEXT[locale];
  const buttons: AssistantContextualMenuButton[] = [];

  if (hour >= 5 && hour < 9) {
    buttons.push({ label: "🌅 Trilha ao nascer do sol", value: "Mirante da Tirolesa", priority: 9, category: "attractions" });
    buttons.push({ label: `☕ ${t.breakfast}`, value: menuLabel(locale, "restaurants"), priority: 8, category: "restaurants" });
  } else if (hour >= 9 && hour < 12) {
    buttons.push({ label: menuLabel(locale, "beaches"), value: menuLabel(locale, "beaches"), priority: 9, category: "beaches" });
    buttons.push({ label: menuLabel(locale, "tours"), value: menuLabel(locale, "tours"), priority: 8, category: "tours" });
  } else if (hour >= 12 && hour < 15) {
    buttons.push({ label: `🍽️ ${t.lunch}`, value: menuLabel(locale, "restaurants"), priority: 9, category: "restaurants" });
    buttons.push({ label: `🤿 ${t.naturalPools}`, value: "Quarta Praia", priority: 7, category: "beaches" });
  } else if (hour >= 15 && hour < 18) {
    buttons.push({ label: `🌊 ${t.beachAfternoon}`, value: menuLabel(locale, "beaches"), priority: 9, category: "beaches" });
    buttons.push({ label: menuLabel(locale, "attractions"), value: menuLabel(locale, "attractions"), priority: 8, category: "attractions" });
  } else if (hour >= 18 && hour < 20) {
    buttons.push({ label: `🌇 ${t.sunset}`, value: "Toca do Morcego", priority: 10, category: "attractions" });
    buttons.push({ label: `🍽️ ${t.dinner}`, value: menuLabel(locale, "restaurants"), priority: 9, category: "restaurants" });
  } else {
    buttons.push({ label: menuLabel(locale, "nightlife"), value: menuLabel(locale, "nightlife"), priority: 9, category: "nightlife" });
    buttons.push({ label: `🍹 ${t.bars}`, value: menuLabel(locale, "nightlife"), priority: 8, category: "nightlife" });
  }

  if ((weather?.precipprob ?? 0) > 60) {
    buttons.unshift({ label: `🌧️ ${t.rainyDay}`, value: menuLabel(locale, "attractions"), priority: 10, category: "attractions" });
  }
  return buttons;
}

function contextualIntro(input: AssistantContextualMenuInput, locale: AssistantLocale): string {
  const t = TEXT[locale];
  const greeting =
    input.hour >= 5 && input.hour < 12
      ? t.greeting.morning
      : input.hour >= 12 && input.hour < 18
        ? t.greeting.afternoon
        : t.greeting.evening;
  if ((input.weather?.precipprob ?? 0) > 60) {
    return interpolate(t.intro.rain, { greeting });
  }
  if ((input.weather?.temp ?? 0) > 30) {
    return interpolate(t.intro.hot, {
      greeting,
      temp: Math.round(input.weather?.temp ?? 0),
    });
  }
  if (input.hour >= 16 && input.hour <= 17) {
    return interpolate(t.intro.sunset, { greeting });
  }
  return interpolate(input.profile.visitCount > 1 ? t.intro.returning : t.intro.default, {
    greeting,
  });
}

export function getAssistantContextualMenu(input: AssistantContextualMenuInput) {
  const locale = input.locale ?? "pt";
  const recentPlaces = input.recentPlaces ?? [];
  const buttons: AssistantContextualMenuButton[] = [];
  const usedCategories = new Set<string>();

  if (recentPlaces[0]) {
    buttons.push({
      label: `${TEXT[locale].returnPrefix}${recentPlaces[0].name}`,
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
    const item = getAssistantMainMenu(locale).find((entry) => entry.value === interest);
    if (!item) continue;
    buttons.push({ label: item.label, value: item.label, priority: 5, category: interest });
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
    label: `❓ ${TEXT[locale].help}`,
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

export function getAssistantSmartRecommendation(input: AssistantSmartRecommendationInput) {
  const locale = input.locale ?? "pt";
  const t = TEXT[locale];
  const recommendations: string[] = [];

  if (input.hour >= 5 && input.hour < 9) {
    recommendations.push(t.recommendations.sunrise);
  } else if (input.hour >= 9 && input.hour < 12) {
    recommendations.push(t.recommendations.secondBeach, t.recommendations.boatTour);
  } else if (input.hour >= 12 && input.hour < 15) {
    recommendations.push(t.recommendations.lunchVillage, t.recommendations.naturalPools);
  } else if (input.hour >= 15 && input.hour < 18) {
    recommendations.push(t.recommendations.fourthBeach, t.recommendations.zipline);
  } else if (input.hour >= 18 && input.hour < 20) {
    recommendations.push(t.recommendations.toca, t.recommendations.seafrontDinner);
  } else {
    recommendations.push(t.recommendations.nightSecondBeach, t.recommendations.villageBars);
  }

  if (input.profile.behavior.isAdventurer) recommendations.push(t.recommendations.adventure);
  if (input.profile.behavior.isRomantic) recommendations.push(t.recommendations.romantic);
  if (input.profile.behavior.isFamilyTrip) recommendations.push(t.recommendations.family);
  if ((input.weather?.precipprob ?? 0) > 50) recommendations.push(t.recommendations.rain);
  else if ((input.weather?.temp ?? 0) > 30) recommendations.push(t.recommendations.hot);

  const recentNames = (input.recentPlaces ?? []).map((place) => place.name.toLowerCase());
  const filtered = recommendations.filter(
    (item) =>
      !recentNames.some((name) =>
        item.toLowerCase().includes(name.split(" ")[0]?.toLowerCase() ?? name),
      ),
  );
  const finalRecommendations = (filtered.length > 0 ? filtered : recommendations).slice(0, 4);

  return {
    text: interpolate(t.smartIntro, { items: finalRecommendations.join("\n\n") }),
    options: [...t.smartOptions],
    recommendations: finalRecommendations,
  };
}
