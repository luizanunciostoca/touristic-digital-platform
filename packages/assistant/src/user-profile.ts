export const ASSISTANT_PROFILE_STORAGE_KEY = "morro_user_profile";
export const ASSISTANT_PROFILE_MAX_HISTORY = 50;
export const ASSISTANT_PROFILE_MAX_RECENT_PLACES = 20;

export type AssistantLanguage = "pt" | "en" | "es" | "he";
export type AssistantUserType = "tourist" | "resident";
export type AssistantInterestCategory =
  | "beaches"
  | "restaurants"
  | "hotels"
  | "shops"
  | "attractions"
  | "nightlife"
  | "tours"
  | "emergencies";

export interface AssistantProfilePlace {
  name: string;
  category?: string | null;
  lat?: number;
  lon?: number;
  timestamp?: number;
  savedAt?: number;
}

export interface AssistantUserProfile {
  language: AssistantLanguage | null;
  firstVisit: number;
  visitCount: number;
  lastVisit: number;
  interests: Record<AssistantInterestCategory, number>;
  userType: AssistantUserType;
  behavior: {
    prefersEconomic: boolean;
    prefersLuxury: boolean;
    isAdventurer: boolean;
    isNightOwl: boolean;
    isFamilyTrip: boolean;
    isRomantic: boolean;
    likesNature: boolean;
    isFirstTimer: boolean;
    isResident: boolean;
  };
  recentPlaces: AssistantProfilePlace[];
  favoritePlaces: AssistantProfilePlace[];
  peakUsageHour: number | null;
  totalInteractions: number;
  successfulNavigations: number;
  searchPatterns: string[];
}

export interface AssistantProfileStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export interface AssistantUserProfileOptions {
  storage?: AssistantProfileStorage;
  now?: () => number;
  getLanguage?: () => AssistantLanguage;
  getCategoryLabel?: (
    category: AssistantInterestCategory,
    language: AssistantLanguage,
  ) => string | null;
}

const COPY = {
  pt: {
    times: ["manhã", "tarde", "entardecer", "noite"],
    hints: ["casal", "família", "aventura"],
    prices: ["econômico", "luxo"],
    suggestions: {
      breakfast: "Café da manhã",
      beaches: "Praias",
      tours: "Passeios",
      sunset: "Pôr do sol",
      restaurants: "Restaurantes",
      nightlife: "Vida Noturna",
      romanticRestaurants: "Restaurantes românticos",
      calmBeaches: "Praias calmas",
      attractions: "Atrações",
      diving: "Mergulho",
      hotels: "Pousadas",
    },
    greetings: ["Bom dia", "Boa tarde", "Boa noite"],
    behaviors: [
      "viagem romântica",
      "viagem em família",
      "perfil aventureiro",
      "prefere opções econômicas",
      "prefere opções de luxo",
      "ativo à noite",
    ],
    resident: [
      "Serviços locais",
      "Eventos na ilha",
      "Negócios parceiros",
      "Notícias da ilha",
      "Restaurantes",
      "Emergências",
    ],
    userTypes: ["turista", "morador local"],
  },
  en: {
    times: ["morning", "afternoon", "sunset time", "night"],
    hints: ["couple", "family", "adventure"],
    prices: ["budget", "luxury"],
    suggestions: {
      breakfast: "Breakfast",
      beaches: "Beaches",
      tours: "Tours",
      sunset: "Sunset",
      restaurants: "Restaurants",
      nightlife: "Nightlife",
      romanticRestaurants: "Romantic restaurants",
      calmBeaches: "Calm beaches",
      attractions: "Attractions",
      diving: "Diving",
      hotels: "Inns",
    },
    greetings: ["Good morning", "Good afternoon", "Good evening"],
    behaviors: [
      "romantic trip",
      "family trip",
      "adventurous profile",
      "prefers budget-friendly options",
      "prefers luxury options",
      "active at night",
    ],
    resident: [
      "Local services",
      "Island events",
      "Partner businesses",
      "Island news",
      "Restaurants",
      "Emergencies",
    ],
    userTypes: ["tourist", "local resident"],
  },
  es: {
    times: ["mañana", "tarde", "atardecer", "noche"],
    hints: ["pareja", "familia", "aventura"],
    prices: ["económico", "lujo"],
    suggestions: {
      breakfast: "Desayuno",
      beaches: "Playas",
      tours: "Paseos",
      sunset: "Atardecer",
      restaurants: "Restaurantes",
      nightlife: "Vida Nocturna",
      romanticRestaurants: "Restaurantes románticos",
      calmBeaches: "Playas tranquilas",
      attractions: "Atracciones",
      diving: "Buceo",
      hotels: "Posadas",
    },
    greetings: ["Buenos días", "Buenas tardes", "Buenas noches"],
    behaviors: [
      "viaje romántico",
      "viaje en familia",
      "perfil aventurero",
      "prefiere opciones económicas",
      "prefiere opciones de lujo",
      "activo por la noche",
    ],
    resident: [
      "Servicios locales",
      "Eventos en la isla",
      "Negocios socios",
      "Noticias de la isla",
      "Restaurantes",
      "Emergencias",
    ],
    userTypes: ["turista", "residente local"],
  },
  he: {
    times: ["בוקר", "אחר הצהריים", "שקיעה", "לילה"],
    hints: ["זוג", "משפחה", "הרפתקה"],
    prices: ["חסכוני", "יוקרה"],
    suggestions: {
      breakfast: "ארוחת בוקר",
      beaches: "חופים",
      tours: "סיורים",
      sunset: "שקיעה",
      restaurants: "מסעדות",
      nightlife: "חיי לילה",
      romanticRestaurants: "מסעדות רומנטיות",
      calmBeaches: "חופים שקטים",
      attractions: "אטרקציות",
      diving: "צלילה",
      hotels: "פוסאדות",
    },
    greetings: ["בוקר טוב", "צהריים טובים", "ערב טוב"],
    behaviors: [
      "טיול רומנטי",
      "טיול משפחתי",
      "פרופיל הרפתקני",
      "מעדיף אפשרויות חסכוניות",
      "מעדיף אפשרויות יוקרה",
      "פעיל בלילה",
    ],
    resident: [
      "שירותים מקומיים",
      "אירועים באי",
      "עסקים שותפים",
      "חדשות האי",
      "מסעדות",
      "חירום",
    ],
    userTypes: ["תייר", "תושב מקומי"],
  },
} as const;

const categoryFallback: Record<
  AssistantLanguage,
  Record<AssistantInterestCategory, string>
> = {
  pt: {
    beaches: "Praias",
    restaurants: "Restaurantes",
    hotels: "Pousadas",
    shops: "Lojas",
    attractions: "Atrações",
    nightlife: "Vida Noturna",
    tours: "Passeios",
    emergencies: "Emergências",
  },
  en: {
    beaches: "Beaches",
    restaurants: "Restaurants",
    hotels: "Inns",
    shops: "Shops",
    attractions: "Attractions",
    nightlife: "Nightlife",
    tours: "Tours",
    emergencies: "Emergencies",
  },
  es: {
    beaches: "Playas",
    restaurants: "Restaurantes",
    hotels: "Posadas",
    shops: "Tiendas",
    attractions: "Atracciones",
    nightlife: "Vida Nocturna",
    tours: "Paseos",
    emergencies: "Emergencias",
  },
  he: {
    beaches: "חופים",
    restaurants: "מסעדות",
    hotels: "פוסאדות",
    shops: "חנויות",
    attractions: "אטרקציות",
    nightlife: "חיי לילה",
    tours: "סיורים",
    emergencies: "חירום",
  },
};

function clone<T>(value: T): T {
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : (JSON.parse(JSON.stringify(value)) as T);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepMerge<T extends object>(target: T, source: unknown): T {
  if (!isRecord(source)) return target;
  const result: Record<string, unknown> = { ...target };
  for (const [key, value] of Object.entries(source)) {
    const current = result[key];
    result[key] =
      isRecord(value) && isRecord(current)
        ? deepMerge(current, value)
        : clone(value);
  }
  return result as T;
}

export function createDefaultAssistantUserProfile(
  now: () => number = Date.now,
): AssistantUserProfile {
  const timestamp = now();
  return {
    language: null,
    firstVisit: timestamp,
    visitCount: 1,
    lastVisit: timestamp,
    interests: {
      beaches: 0,
      restaurants: 0,
      hotels: 0,
      shops: 0,
      attractions: 0,
      nightlife: 0,
      tours: 0,
      emergencies: 0,
    },
    userType: "tourist",
    behavior: {
      prefersEconomic: false,
      prefersLuxury: false,
      isAdventurer: false,
      isNightOwl: false,
      isFamilyTrip: false,
      isRomantic: false,
      likesNature: false,
      isFirstTimer: true,
      isResident: false,
    },
    recentPlaces: [],
    favoritePlaces: [],
    peakUsageHour: null,
    totalInteractions: 0,
    successfulNavigations: 0,
    searchPatterns: [],
  };
}

function inferBehavior(profile: AssistantUserProfile, input: string): void {
  const norm = input.toLowerCase();
  if (/(barato|econômico|economico|preço baixo|preco baixo|budget|cheap|acessível|acessivel)/i.test(norm))
    profile.behavior.prefersEconomic = true;
  if (/(luxo|luxury|confortável|confortavel|premium|top|melhor|exclusivo|vip)/i.test(norm))
    profile.behavior.prefersLuxury = true;
  if (/(trilha|mergulho|aventura|snorkel|caiaque|quadriciclo|hiking|adventure|surf)/i.test(norm))
    profile.behavior.isAdventurer = true;
  if (/(família|familia|criança|criancas|filho|filhos|kids|family|children)/i.test(norm))
    profile.behavior.isFamilyTrip = true;
  if (/(casal|romântico|romantico|namorado|namorada|lua de mel|honeymoon|romantic|couple)/i.test(norm))
    profile.behavior.isRomantic = true;
  if (/(praia|natureza|paisagem|vista|mar|oceano|beach|nature|ocean|playa)/i.test(norm))
    profile.behavior.likesNature = true;
  if (/(primeira vez|nunca fui|nunca estive|first time|never been|primera vez)/i.test(norm))
    profile.behavior.isFirstTimer = true;
  else if (/(já fui|já estive|voltei|de novo|outra vez|been before|came back|ya fui|volví)/i.test(norm))
    profile.behavior.isFirstTimer = false;

  if (/(moro aqui|sou morador|sou local|resido|residente|moro em morro|moro na ilha|i live here|i'm a local|soy residente|soy local|vivo aquí)/i.test(norm)) {
    profile.behavior.isResident = true;
    profile.userType = "resident";
  } else if (/(sou turista|estou de férias|estou visitando|vim de|chegue hoje|cheguei hoje|i'm a tourist|i'm visiting|soy turista)/i.test(norm)) {
    profile.behavior.isResident = false;
    profile.userType = "tourist";
  }
}

export function createAssistantUserProfileManager(
  options: AssistantUserProfileOptions = {},
) {
  const storage = options.storage;
  const now = options.now ?? Date.now;
  const getLanguage = options.getLanguage ?? (() => "pt" as const);
  const getCategoryLabel = options.getCategoryLabel;
  let profile = createDefaultAssistantUserProfile(now);

  const save = () => {
    if (!storage) return;
    try {
      storage.setItem(ASSISTANT_PROFILE_STORAGE_KEY, JSON.stringify(profile));
    } catch {
      // Quota/storage errors are non-fatal, matching V1 behavior.
    }
  };

  const load = () => {
    if (!storage) return;
    try {
      const raw = storage.getItem(ASSISTANT_PROFILE_STORAGE_KEY);
      if (raw) {
        profile = deepMerge(
          createDefaultAssistantUserProfile(now),
          JSON.parse(raw) as unknown,
        );
        profile.visitCount = (profile.visitCount || 0) + 1;
        profile.lastVisit = now();
      }
      save();
    } catch {
      profile = createDefaultAssistantUserProfile(now);
    }
  };

  const language = (): AssistantLanguage => {
    const current = getLanguage?.() ?? profile.language ?? "pt";
    return current in COPY ? current : "pt";
  };

  const label = (category: AssistantInterestCategory): string =>
    getCategoryLabel?.(category, language()) ??
    categoryFallback[language()][category];

  const topInterests = (limit = 3): AssistantInterestCategory[] =>
    (Object.entries(profile.interests) as [AssistantInterestCategory, number][])
      .filter(([, score]) => score > 0)
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .map(([category]) => category);

  load();

  return {
    getUserProfile(): AssistantUserProfile {
      return clone(profile);
    },

    recordInteraction(
      input: string,
      category: AssistantInterestCategory | null = null,
      place: AssistantProfilePlace | null = null,
    ): void {
      profile.totalInteractions += 1;
      profile.lastVisit = now();
      profile.language = language();
      const hour = new Date(now()).getHours();
      profile.peakUsageHour = hour;
      if (hour >= 21 || hour <= 4) profile.behavior.isNightOwl = true;

      if (category) {
        profile.interests[category] = Math.min(
          10,
          profile.interests[category] + 1,
        );
      }

      if (place?.name) {
        const entry: AssistantProfilePlace = {
          ...place,
          category: place.category ?? category,
          timestamp: now(),
        };
        profile.recentPlaces = profile.recentPlaces.filter(
          (item) => item.name !== place.name,
        );
        profile.recentPlaces.unshift(entry);
        profile.recentPlaces = profile.recentPlaces.slice(
          0,
          ASSISTANT_PROFILE_MAX_RECENT_PLACES,
        );
      }

      inferBehavior(profile, input);
      if (input.length > 2) {
        profile.searchPatterns.unshift(input.toLowerCase().trim());
        profile.searchPatterns = profile.searchPatterns.slice(0, 10);
      }
      if (profile.searchPatterns.length > ASSISTANT_PROFILE_MAX_HISTORY) {
        profile.searchPatterns = profile.searchPatterns.slice(
          0,
          ASSISTANT_PROFILE_MAX_HISTORY,
        );
      }
      save();
    },

    recordSuccessfulNavigation(): void {
      profile.successfulNavigations += 1;
      save();
    },

    addFavoritePlace(place: AssistantProfilePlace): void {
      if (!place?.name) return;
      if (!profile.favoritePlaces.some((item) => item.name === place.name)) {
        profile.favoritePlaces.push({ ...place, savedAt: now() });
        save();
      }
    },

    removeFavoritePlace(placeName: string): void {
      profile.favoritePlaces = profile.favoritePlaces.filter(
        (item) => item.name !== placeName,
      );
      save();
    },

    getFavoritePlaces(): AssistantProfilePlace[] {
      return clone(profile.favoritePlaces);
    },

    getRecentPlaces(limit = 5): AssistantProfilePlace[] {
      return clone(profile.recentPlaces.slice(0, limit));
    },

    getTopInterests(limit = 3): AssistantInterestCategory[] {
      return topInterests(limit);
    },

    getPersonalizedSuggestions() {
      const lang = language();
      const copy = COPY[lang];
      const hour = new Date(now()).getHours();
      const suggestions: string[] = [];
      const context: Record<string, string> = {};

      if (hour >= 6 && hour <= 11) {
        suggestions.push(copy.suggestions.breakfast, copy.suggestions.beaches);
        context.timeContext = copy.times[0];
      } else if (hour >= 12 && hour <= 17) {
        suggestions.push(copy.suggestions.beaches, copy.suggestions.tours);
        context.timeContext = copy.times[1];
      } else if (hour >= 18 && hour <= 19) {
        suggestions.push(copy.suggestions.sunset, copy.suggestions.restaurants);
        context.timeContext = copy.times[2];
      } else {
        suggestions.push(copy.suggestions.nightlife, copy.suggestions.restaurants);
        context.timeContext = copy.times[3];
      }

      if (profile.behavior.isRomantic) {
        suggestions.push(
          copy.suggestions.sunset,
          copy.suggestions.romanticRestaurants,
        );
        context.profileHint = copy.hints[0];
      }
      if (profile.behavior.isFamilyTrip) {
        suggestions.push(
          copy.suggestions.calmBeaches,
          copy.suggestions.attractions,
        );
        context.profileHint = copy.hints[1];
      }
      if (profile.behavior.isAdventurer) {
        suggestions.push(copy.suggestions.tours, copy.suggestions.diving);
        context.profileHint = copy.hints[2];
      }
      if (profile.behavior.prefersEconomic) context.pricePreference = copy.prices[0];
      if (profile.behavior.prefersLuxury) context.pricePreference = copy.prices[1];

      for (const interest of topInterests(3)) {
        const interestLabel = label(interest);
        if (!suggestions.includes(interestLabel)) suggestions.push(interestLabel);
      }

      if (profile.behavior.isResident || profile.userType === "resident") {
        for (const item of copy.resident) {
          if (!suggestions.includes(item)) suggestions.push(item);
        }
      }

      for (const fallback of [
        copy.suggestions.beaches,
        copy.suggestions.restaurants,
        copy.suggestions.hotels,
        copy.suggestions.attractions,
        copy.suggestions.tours,
      ]) {
        if (suggestions.length >= 6) break;
        if (!suggestions.includes(fallback)) suggestions.push(fallback);
      }

      const timeGreeting =
        hour >= 5 && hour < 12
          ? copy.greetings[0]
          : hour >= 12 && hour < 18
            ? copy.greetings[1]
            : copy.greetings[2];

      let greeting: string;
      if (profile.behavior.isResident || profile.userType === "resident") {
        greeting =
          lang === "pt"
            ? `${timeGreeting}! Olá, morador! O que você precisa hoje na ilha? 🌴`
            : lang === "en"
              ? `${timeGreeting}! Hello, local! What do you need today on the island? 🌴`
              : lang === "es"
                ? `¡${timeGreeting}! ¡Hola, residente! ¿Qué necesitas hoy en la isla? 🌴`
                : `${timeGreeting}! שלום, תושב! מה אתה צריך היום באי 🌴`;
      } else if (profile.visitCount > 1 && profile.behavior.isRomantic) {
        greeting = `${timeGreeting}! ${lang === "pt" ? "Que bom ter você de volta. Pronto para mais momentos especiais em Morro de São Paulo? 🌅" : lang === "en" ? "Great to have you back. Ready for more special moments in Morro de São Paulo? 🌅" : lang === "es" ? "Qué bueno tenerte de vuelta. ¿Listo para más momentos especiales en Morro de São Paulo? 🌅" : "טוב לראות אותך שוב. מוכן לעוד רגעים מיוחדים במורו דה סאו פאולו? 🌅"}`;
      } else if (profile.visitCount > 1 && profile.behavior.isAdventurer) {
        greeting = `${timeGreeting}${lang === "es" ? ", aventurero. ¿De vuelta para vivir más emociones en Morro de São Paulo? 🤿" : lang === "en" ? ", adventurer! Back for more thrills in Morro de São Paulo? 🤿" : lang === "he" ? ", הרפתקן! חזרת לעוד חוויות במורו דה סאו פאולו? 🤿" : ", aventureiro! De volta para mais emoções em Morro de São Paulo? 🤿"}`;
      } else if (profile.visitCount > 1) {
        greeting = `${timeGreeting}! ${lang === "pt" ? "Bem-vindo de volta a Morro de São Paulo! 🌴" : lang === "en" ? "Welcome back to Morro de São Paulo! 🌴" : lang === "es" ? "¡Bienvenido de vuelta a Morro de São Paulo! 🌴" : "ברוך שובך למורו דה סאו פאולו! 🌴"}`;
      } else if (profile.behavior.isFamilyTrip) {
        greeting = `${timeGreeting}! ${lang === "pt" ? "Bem-vindos à família! Morro de São Paulo tem muito para toda a família. 🌊" : lang === "en" ? "Welcome, family! Morro de São Paulo has plenty for everyone to enjoy. 🌊" : lang === "es" ? "¡Bienvenida, familia! Morro de São Paulo tiene mucho para disfrutar juntos. 🌊" : "ברוכים הבאים למשפחה! במורו דה סאו פאולו יש הרבה מה ליהנות יחד. 🌊"}`;
      } else {
        greeting = `${timeGreeting}! ${lang === "pt" ? "Bem-vindo a Morro de São Paulo! Sou seu guia digital. Como posso ajudar? 🌴" : lang === "en" ? "Welcome to Morro de São Paulo! I am your digital guide. How can I help? 🌴" : lang === "es" ? "Bienvenido a Morro de São Paulo. Soy tu guía digital. ¿Cómo puedo ayudarte? 🌴" : "ברוך הבא למורו דה סאו פאולו. אני המדריך הדיגיטלי שלך. איך אפשר לעזור? 🌴"}`;
      }

      return {
        suggestions: [...new Set(suggestions)].slice(0, 6),
        greeting,
        context,
        isFirstTimer: profile.behavior.isFirstTimer,
      };
    },

    getProfileSummaryForLLM(): string {
      const lang = language();
      const copy = COPY[lang];
      const interests = topInterests(3).map(label);
      const recent = profile.recentPlaces.slice(0, 3).map((place) => place.name);
      const behaviors: string[] = [];
      if (profile.behavior.isRomantic) behaviors.push(copy.behaviors[0]);
      if (profile.behavior.isFamilyTrip) behaviors.push(copy.behaviors[1]);
      if (profile.behavior.isAdventurer) behaviors.push(copy.behaviors[2]);
      if (profile.behavior.prefersEconomic) behaviors.push(copy.behaviors[3]);
      if (profile.behavior.prefersLuxury) behaviors.push(copy.behaviors[4]);
      if (profile.behavior.isNightOwl) behaviors.push(copy.behaviors[5]);

      const parts: string[] = [];
      if (interests.length) parts.push(`Interesses: ${interests.join(", ")}`);
      if (recent.length) parts.push(`Locais recentes: ${recent.join(", ")}`);
      if (behaviors.length) parts.push(`Perfil: ${behaviors.join(", ")}`);
      parts.push(
        `Tipo: ${copy.userTypes[profile.userType === "resident" ? 1 : 0]}`,
      );
      parts.push(
        `Sessões: ${profile.visitCount}, Interações: ${profile.totalInteractions}`,
      );
      return parts.join(". ");
    },

    setUserType(type: AssistantUserType): void {
      profile.userType = type;
      profile.behavior.isResident = type === "resident";
      save();
    },

    getUserType(): AssistantUserType {
      return profile.userType;
    },

    resetProfile(): void {
      profile = createDefaultAssistantUserProfile(now);
      save();
    },
  };
}
