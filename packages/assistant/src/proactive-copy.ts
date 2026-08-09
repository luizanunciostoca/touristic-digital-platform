import type { AssistantLocale } from "./menu.js";

export interface AssistantProactiveContentCopy {
  labels: {
    sunriseHike: string;
    breakfast: string;
    lunch: string;
    beachAfternoon: string;
    sunset: string;
    dinner: string;
    naturalPools: string;
    bars: string;
    rainyDay: string;
  };
  returnToPlacePrefix: string;
  help: string;
  timeGreeting: {
    morning: string;
    afternoon: string;
    evening: string;
  };
  intro: {
    rain: string;
    hot: string;
    sunset: string;
    returning: string;
    default: string;
  };
  recommendations: {
    sunrise: string;
    secondBeach: string;
    boatTour: string;
    lunchVillage: string;
    naturalPools: string;
    fourthBeach: string;
    zipline: string;
    toca: string;
    seafrontDinner: string;
    nightSecondBeach: string;
    villageBars: string;
    adventure: string;
    romantic: string;
    family: string;
    rain: string;
    hot: string;
  };
  smartRecIntro: string;
  smartOptions: readonly [string, string, string, string, string];
}

export const ASSISTANT_PROACTIVE_CONTENT_COPY: Record<
  AssistantLocale,
  AssistantProactiveContentCopy
> = {
  pt: {
    labels: {
      sunriseHike: "Trilha ao nascer do sol",
      breakfast: "Café da manhã",
      lunch: "Almoço",
      beachAfternoon: "Praias (tarde)",
      sunset: "Pôr do sol",
      dinner: "Jantar",
      naturalPools: "Piscinas naturais",
      bars: "Bares",
      rainyDay: "Dia de chuva — o que fazer?",
    },
    returnToPlacePrefix: "🔄 Voltar a ",
    help: "Ajuda",
    timeGreeting: {
      morning: "Bom dia",
      afternoon: "Boa tarde",
      evening: "Boa noite",
    },
    intro: {
      rain: "{timeGreeting}! Parece que pode chover hoje. Veja o que fazer em dias de chuva em Morro 🌧️",
      hot: "{timeGreeting}! Dia quente ({temp}°C)! Perfeito para as piscinas naturais 🌊",
      sunset:
        "{timeGreeting}! Hora mágica do pôr do sol em Morro! Não perca 🌅",
      returning:
        "{timeGreeting}! Bem-vindo de volta! Como posso ajudar hoje? 🌴",
      default:
        "{timeGreeting}! Sou seu guia de Morro de São Paulo. Como posso ajudar? 🌴",
    },
    recommendations: {
      sunrise:
        "🌅 **Nascer do sol no Farol do Morro** — vista panorâmica incrível de manhã cedo",
      secondBeach:
        "🏖️ **Segunda Praia** — melhor horário para nadar antes do sol forte",
      boatTour: "⛵ **Passeio de barco** — saídas pela manhã com mar calmo",
      lunchVillage:
        "🍽️ **Almoço na vila** — restaurantes com frutos do mar frescos",
      naturalPools: "🤿 **Piscinas naturais** — maré baixa à tarde é ideal",
      fourthBeach:
        "🌊 **Quarta Praia** — menos movimento e água cristalina à tarde",
      zipline: "🎢 **Tirolesa** — adrenalina com vista para o mar",
      toca: "🌇 **Toca do Morcego** — melhor pôr do sol da ilha, não perca!",
      seafrontDinner:
        "🍽️ **Jantar à beira-mar** — restaurantes com mesas na areia",
      nightSecondBeach: "🎶 **Segunda Praia à noite** — shows ao vivo e luau",
      villageBars: "🍹 **Bares da vila** — ambiente animado e drinks tropicais",
      adventure:
        "🤿 **Mergulho nas piscinas naturais** — visibilidade incrível",
      romantic:
        "💑 **Jantar romântico na Terceira Praia** — mesas na areia ao luar",
      family: "👨‍👩‍👧 **Primeira Praia** — calma e segura para crianças",
      rain: "🏛️ **Forte de Tapirandu** — visita histórica coberta para dias de chuva",
      hot: "🌊 **Piscinas naturais** — refrescante nos dias mais quentes",
    },
    smartRecIntro:
      "Com base no momento atual e no seu perfil, aqui estão minhas recomendações:\n\n{items}\n\nQuer mais detalhes sobre algum desses lugares?",
    smartOptions: [
      "Ver no mapa",
      "Como chegar",
      "Ver fotos",
      "Outras sugestões",
      "Voltar ao menu",
    ],
  },
  en: {
    labels: {
      sunriseHike: "Sunrise hike",
      breakfast: "Breakfast",
      lunch: "Lunch",
      beachAfternoon: "Beaches (afternoon)",
      sunset: "Sunset",
      dinner: "Dinner",
      naturalPools: "Natural pools",
      bars: "Bars",
      rainyDay: "Rainy day — what to do?",
    },
    returnToPlacePrefix: "🔄 Back to ",
    help: "Help",
    timeGreeting: {
      morning: "Good morning",
      afternoon: "Good afternoon",
      evening: "Good evening",
    },
    intro: {
      rain: "{timeGreeting}! It may rain today. Here are good things to do in Morro on a rainy day 🌧️",
      hot: "{timeGreeting}! Hot day ({temp}°C)! Perfect for the natural pools 🌊",
      sunset:
        "{timeGreeting}! It is the magic hour for sunset in Morro. Don't miss it 🌅",
      returning: "{timeGreeting}! Welcome back! How can I help today? 🌴",
      default:
        "{timeGreeting}! I am your Morro de São Paulo guide. How can I help? 🌴",
    },
    recommendations: {
      sunrise:
        "🌅 **Sunrise at Farol do Morro** — amazing panoramic views early in the morning",
      secondBeach:
        "🏖️ **Second Beach** — the best time to swim before the stronger sun",
      boatTour: "⛵ **Boat tour** — morning departures with calmer sea",
      lunchVillage:
        "🍽️ **Lunch in the village** — restaurants with fresh seafood",
      naturalPools: "🤿 **Natural pools** — low tide in the afternoon is ideal",
      fourthBeach:
        "🌊 **Fourth Beach** — less crowded and crystal-clear water in the afternoon",
      zipline: "🎢 **Zipline** — adrenaline with sea views",
      toca: "🌇 **Toca do Morcego** — the island's best sunset, don't miss it!",
      seafrontDinner:
        "🍽️ **Seafront dinner** — restaurants with tables on the sand",
      nightSecondBeach:
        "🎶 **Second Beach at night** — live shows and luau atmosphere",
      villageBars:
        "🍹 **Village bars** — lively atmosphere and tropical drinks",
      adventure: "🤿 **Diving in the natural pools** — excellent visibility",
      romantic:
        "💑 **Romantic dinner at Third Beach** — moonlit tables on the sand",
      family: "👨‍👩‍👧 **First Beach** — calm and safe for children",
      rain: "🏛️ **Forte de Tapirandu** — a great historical stop for rainy days",
      hot: "🌊 **Natural pools** — refreshing on hotter days",
    },
    smartRecIntro:
      "Based on the current moment and your profile, here are my recommendations:\n\n{items}\n\nWould you like more details about any of these places?",
    smartOptions: [
      "View on map",
      "Get directions",
      "View photos",
      "Other suggestions",
      "Back to menu",
    ],
  },
  es: {
    labels: {
      sunriseHike: "Caminata al amanecer",
      breakfast: "Desayuno",
      lunch: "Almuerzo",
      beachAfternoon: "Playas (tarde)",
      sunset: "Atardecer",
      dinner: "Cena",
      naturalPools: "Piscinas naturales",
      bars: "Bares",
      rainyDay: "Día de lluvia — ¿qué hacer?",
    },
    returnToPlacePrefix: "🔄 Volver a ",
    help: "Ayuda",
    timeGreeting: {
      morning: "Buenos días",
      afternoon: "Buenas tardes",
      evening: "Buenas noches",
    },
    intro: {
      rain: "{timeGreeting}. Parece que puede llover hoy. Aquí tienes buenas opciones para un día de lluvia en Morro 🌧️",
      hot: "{timeGreeting}. Día caluroso ({temp}°C). Perfecto para las piscinas naturales 🌊",
      sunset:
        "{timeGreeting}. Es la hora mágica del atardecer en Morro. No te lo pierdas 🌅",
      returning:
        "{timeGreeting}. ¡Bienvenido de vuelta! ¿Cómo puedo ayudarte hoy? 🌴",
      default:
        "{timeGreeting}. Soy tu guía de Morro de São Paulo. ¿Cómo puedo ayudarte? 🌴",
    },
    recommendations: {
      sunrise:
        "🌅 **Amanecer en el Farol do Morro** — una vista panorámica increíble temprano por la mañana",
      secondBeach:
        "🏖️ **Segunda Playa** — el mejor horario para nadar antes del sol fuerte",
      boatTour:
        "⛵ **Paseo en barco** — salidas por la mañana con mar más tranquilo",
      lunchVillage:
        "🍽️ **Almuerzo en la villa** — restaurantes con mariscos frescos",
      naturalPools:
        "🤿 **Piscinas naturales** — la marea baja por la tarde es ideal",
      fourthBeach:
        "🌊 **Cuarta Playa** — menos movimiento y agua cristalina por la tarde",
      zipline: "🎢 **Tirolesa** — adrenalina con vista al mar",
      toca: "🌇 **Toca do Morcego** — el mejor atardecer de la isla, no te lo pierdas",
      seafrontDinner:
        "🍽️ **Cena frente al mar** — restaurantes con mesas sobre la arena",
      nightSecondBeach:
        "🎶 **Segunda Playa de noche** — shows en vivo y ambiente de luau",
      villageBars:
        "🍹 **Bares de la villa** — ambiente animado y tragos tropicales",
      adventure:
        "🤿 **Buceo en las piscinas naturales** — visibilidad excelente",
      romantic:
        "💑 **Cena romántica en Tercera Playa** — mesas sobre la arena bajo la luna",
      family: "👨‍👩‍👧 **Primera Playa** — tranquila y segura para niños",
      rain: "🏛️ **Forte de Tapirandu** — una gran parada histórica para días de lluvia",
      hot: "🌊 **Piscinas naturales** — ideales para refrescarse en los días más calurosos",
    },
    smartRecIntro:
      "Según el momento actual y tu perfil, aquí van mis recomendaciones:\n\n{items}\n\n¿Quieres más detalles sobre alguno de estos lugares?",
    smartOptions: [
      "Ver en el mapa",
      "Cómo llegar",
      "Ver fotos",
      "Otras sugerencias",
      "Volver al menú",
    ],
  },
  he: {
    labels: {
      sunriseHike: "הליכת זריחה",
      breakfast: "ארוחת בוקר",
      lunch: "ארוחת צהריים",
      beachAfternoon: "חופים (אחר הצהריים)",
      sunset: "שקיעה",
      dinner: "ארוחת ערב",
      naturalPools: "בריכות טבעיות",
      bars: "ברים",
      rainyDay: "יום גשום — מה לעשות?",
    },
    returnToPlacePrefix: "🔄 חזרה אל ",
    help: "עזרה",
    timeGreeting: {
      morning: "בוקר טוב",
      afternoon: "צהריים טובים",
      evening: "ערב טוב",
    },
    intro: {
      rain: "{timeGreeting}! ייתכן גשם היום. הנה אפשרויות טובות ליום גשום במורו 🌧️",
      hot: "{timeGreeting}! יום חם ({temp}°C). מושלם לבריכות הטבעיות 🌊",
      sunset: "{timeGreeting}! זו השעה הקסומה של השקיעה במורו. אל תפספס 🌅",
      returning: "{timeGreeting}! ברוך שובך! איך אפשר לעזור היום? 🌴",
      default:
        "{timeGreeting}! אני המדריך שלך למורו דה סאו פאולו. איך אפשר לעזור? 🌴",
    },
    recommendations: {
      sunrise: "🌅 **זריחה בפארול דו מורו** — נוף פנורמי מדהים מוקדם בבוקר",
      secondBeach: "🏖️ **החוף השני** — הזמן הטוב ביותר לשחות לפני שהשמש מתחזקת",
      boatTour: "⛵ **שיט** — יציאות בבוקר עם ים רגוע יותר",
      lunchVillage: "🍽️ **ארוחת צהריים בכפר** — מסעדות עם פירות ים טריים",
      naturalPools: "🤿 **בריכות טבעיות** — שפל אחר הצהריים אידיאלי",
      fourthBeach: "🌊 **החוף הרביעי** — פחות עמוס ומים צלולים אחר הצהריים",
      zipline: "🎢 **אומגה** — אדרנלין עם נוף לים",
      toca: "🌇 **טוקה דו מורצ'גו** — השקיעה הטובה ביותר באי, אל תפספס",
      seafrontDinner: "🍽️ **ארוחת ערב מול הים** — מסעדות עם שולחנות על החול",
      nightSecondBeach: "🎶 **החוף השני בלילה** — הופעות חיות ואווירת לואו",
      villageBars: "🍹 **ברי הכפר** — אווירה חיה וקוקטיילים טרופיים",
      adventure: "🤿 **צלילה בבריכות הטבעיות** — ראות מצוינת",
      romantic: "💑 **ארוחה רומנטית בחוף השלישי** — שולחנות על החול לאור הירח",
      family: "👨‍👩‍👧 **החוף הראשון** — רגוע ובטוח לילדים",
      rain: "🏛️ **פורטה דה טפיראנדו** — עצירה היסטורית נהדרת לימים גשומים",
      hot: "🌊 **בריכות טבעיות** — נהדרות להתרעננות בימים חמים",
    },
    smartRecIntro:
      "לפי השעה הנוכחית והפרופיל שלך, הנה ההמלצות שלי:\n\n{items}\n\nרוצה עוד פרטים על אחד מהמקומות האלה?",
    smartOptions: [
      "הצג במפה",
      "איך להגיע",
      "צפה בתמונות",
      "הצעות נוספות",
      "חזרה לתפריט",
    ],
  },
};
