import type { AssistantLocale } from "@touristic/assistant";

export type V1ExploreLabelKey =
  | "backMenu"
  | "backFilters"
  | "back"
  | "nearby"
  | "seeAll"
  | "restaurantsBeach"
  | "restaurantsVillage"
  | "restaurantsGarapua"
  | "restaurantsPizza"
  | "restaurantsSeafood"
  | "restaurantsVegetarian"
  | "restaurantsBar"
  | "beachesSurf"
  | "beachesDiving"
  | "beachesSunset"
  | "beachesFamily"
  | "beachesStructure"
  | "hotelsBeachfront"
  | "hotelsVillage"
  | "hotelsBudget"
  | "hotelsLuxury"
  | "hotelsCharming"
  | "shopsFashion"
  | "shopsSupermarket"
  | "shopsCrafts"
  | "shopsAccessories"
  | "shopsPharmacy"
  | "attractionsNature"
  | "attractionsHistoric"
  | "attractionsSunset"
  | "attractionsNightlife"
  | "attractionsDiving"
  | "nightlifeLiveMusic"
  | "nightlifeBar"
  | "nightlifeClub"
  | "nightlifeSunset"
  | "tourIsland"
  | "tourGamboa"
  | "tourAtv"
  | "tourBoat"
  | "tourDiving"
  | "tourAdventure"
  | "tourWildlife"
  | "emergenciesHospital"
  | "emergenciesPolice"
  | "emergenciesFirefighters"
  | "emergenciesPharmacy"
  | "transportBoat"
  | "transportBuggy"
  | "transportWalking"
  | "transportPier"
  | "transportAgency"
  | "menu"
  | "directions"
  | "photos"
  | "contact"
  | "more"
  | "rooms"
  | "book"
  | "beachConditions"
  | "information"
  | "bookTour"
  | "meetingPoint"
  | "requestTransport"
  | "location"
  | "fares"
  | "moreInformation"
  | "favorite"
  | "hours"
  | "priceRange"
  | "reviews"
  | "share";

type Copy = Readonly<Record<AssistantLocale, string>>;

const LABELS: Readonly<Record<V1ExploreLabelKey, Copy>> = Object.freeze({
  backMenu: {
    pt: "Voltar ao menu",
    en: "Back to menu",
    es: "Volver al menú",
    he: "חזרה לתפריט",
  },
  backFilters: {
    pt: "Voltar aos filtros",
    en: "Back to filters",
    es: "Volver a los filtros",
    he: "חזרה למסננים",
  },
  back: { pt: "Voltar", en: "Back", es: "Volver", he: "חזרה" },
  nearby: {
    pt: "Próximos a mim",
    en: "Nearby",
    es: "Cercanos a mí",
    he: "קרובים אלי",
  },
  seeAll: { pt: "Ver todos", en: "See all", es: "Ver todos", he: "ראה הכל" },
  restaurantsBeach: {
    pt: "Na praia",
    en: "On the beach",
    es: "En la playa",
    he: "על החוף",
  },
  restaurantsVillage: {
    pt: "Na vila",
    en: "In the village",
    es: "En la villa",
    he: "בכפר",
  },
  restaurantsGarapua: {
    pt: "Em Garapuá",
    en: "In Garapuá",
    es: "En Garapuá",
    he: "בגראפואָה",
  },
  restaurantsPizza: {
    pt: "Pizzaria / Italiana",
    en: "Pizza / Italian",
    es: "Pizzería / Italiana",
    he: "פיצה / איטלקי",
  },
  restaurantsSeafood: {
    pt: "Frutos do mar",
    en: "Seafood",
    es: "Mariscos",
    he: "פירות ים",
  },
  restaurantsVegetarian: {
    pt: "Vegetariano / Vegano",
    en: "Vegetarian / Vegan",
    es: "Vegetariano / Vegano",
    he: "צמחוני / טבעוני",
  },
  restaurantsBar: {
    pt: "Bar / Petiscos",
    en: "Bar / Snacks",
    es: "Bar / Picadas",
    he: "בר / נשנושים",
  },
  beachesSurf: {
    pt: "Com ondas para surf",
    en: "Good waves for surfing",
    es: "Con olas para surf",
    he: "עם גלים לגלישה",
  },
  beachesDiving: {
    pt: "Para mergulho / snorkel",
    en: "For diving / snorkel",
    es: "Para buceo / snorkel",
    he: "לצלילה / שנורקל",
  },
  beachesSunset: {
    pt: "Para pôr do sol",
    en: "For sunset",
    es: "Para ver el atardecer",
    he: "לשקיעה",
  },
  beachesFamily: {
    pt: "Familiar / tranquila",
    en: "Family-friendly / calm",
    es: "Familiar / tranquila",
    he: "משפחתי / רגוע",
  },
  beachesStructure: {
    pt: "Com estrutura / bares",
    en: "With bars / facilities",
    es: "Con estructura / bares",
    he: "עם ברים / תשתיות",
  },
  hotelsBeachfront: {
    pt: "Frente à praia",
    en: "Beachfront",
    es: "Frente a la playa",
    he: "מול החוף",
  },
  hotelsVillage: {
    pt: "Na vila",
    en: "In the village",
    es: "En la villa",
    he: "בכפר",
  },
  hotelsBudget: {
    pt: "Econômico",
    en: "Budget",
    es: "Económico",
    he: "חסכוני",
  },
  hotelsLuxury: {
    pt: "Luxo / Conforto",
    en: "Luxury / Comfort",
    es: "Lujo / Confort",
    he: "יוקרה / נוחות",
  },
  hotelsCharming: {
    pt: "Pousada charmosa",
    en: "Charming guesthouse",
    es: "Posada con encanto",
    he: "פוסאדה מקסימה",
  },
  shopsFashion: {
    pt: "Roupas e moda",
    en: "Clothes and fashion",
    es: "Ropa y moda",
    he: "ביגוד ואופנה",
  },
  shopsSupermarket: {
    pt: "Supermercado",
    en: "Supermarket",
    es: "Supermercado",
    he: "סופרמרקט",
  },
  shopsCrafts: {
    pt: "Artesanato / Souvenirs",
    en: "Crafts / Souvenirs",
    es: "Artesanía / Souvenirs",
    he: "אומנות / מזכרות",
  },
  shopsAccessories: {
    pt: "Bijuteria / Acessórios",
    en: "Jewelry / Accessories",
    es: "Bisutería / Accesorios",
    he: "תכשיטים / אביזרים",
  },
  shopsPharmacy: {
    pt: "Farmácia",
    en: "Pharmacy",
    es: "Farmacia",
    he: "בית מרקחת",
  },
  attractionsNature: {
    pt: "Praias e natureza",
    en: "Beaches and nature",
    es: "Playas y naturaleza",
    he: "חופים וטבע",
  },
  attractionsHistoric: {
    pt: "Histórico / Cultural",
    en: "Historic / Cultural",
    es: "Histórico / Cultural",
    he: "היסטורי / תרבותי",
  },
  attractionsSunset: {
    pt: "Pôr do sol",
    en: "Sunset",
    es: "Atardecer",
    he: "שקיעה",
  },
  attractionsNightlife: {
    pt: "Vida noturna",
    en: "Nightlife",
    es: "Vida nocturna",
    he: "חיי לילה",
  },
  attractionsDiving: {
    pt: "Mergulho / Snorkel",
    en: "Diving / Snorkel",
    es: "Buceo / Snorkel",
    he: "צלילה / שנורקל",
  },
  nightlifeLiveMusic: {
    pt: "Música ao vivo",
    en: "Live music",
    es: "Música en vivo",
    he: "מוזיקה חיה",
  },
  nightlifeBar: {
    pt: "Bar / Drinks",
    en: "Bar / Drinks",
    es: "Bar / Tragos",
    he: "בר / משקאות",
  },
  nightlifeClub: {
    pt: "Balada / Dança",
    en: "Club / Dancing",
    es: "Fiesta / Baile",
    he: "מועדון / ריקודים",
  },
  nightlifeSunset: {
    pt: "Sunset bar",
    en: "Sunset bar",
    es: "Sunset bar",
    he: "בר שקיעה",
  },
  tourIsland: {
    pt: "Passeio Volta à Ilha",
    en: "Island Round Trip",
    es: "Vuelta a la Isla",
    he: "סיבוב האי",
  },
  tourGamboa: {
    pt: "Trilha Ecológica para a Gamboa",
    en: "Ecological Trail to Gamboa",
    es: "Sendero Ecológico a Gamboa",
    he: "שביל אקולוגי לגמבואה",
  },
  tourAtv: {
    pt: "Expedição de Quadriciclo",
    en: "ATV Expedition",
    es: "Expedición en Cuadriciclo",
    he: "מסע קוואדריציקל",
  },
  tourBoat: {
    pt: "Passeio de barco",
    en: "Boat tour",
    es: "Paseo en barco",
    he: "סיור בסירה",
  },
  tourDiving: {
    pt: "Mergulho / Snorkel",
    en: "Diving / Snorkeling",
    es: "Buceo / Snorkel",
    he: "צלילה / שנורקל",
  },
  tourAdventure: {
    pt: "Aventura / Trilha",
    en: "Adventure / Hiking",
    es: "Aventura / Senderismo",
    he: "הרפתקאות / טיול",
  },
  tourWildlife: {
    pt: "Observação de fauna",
    en: "Wildlife watching",
    es: "Observación de fauna",
    he: "צפייה בחיות בר",
  },
  emergenciesHospital: {
    pt: "Hospital / Saúde",
    en: "Hospital / Health",
    es: "Hospital / Salud",
    he: "בית חולים / בריאות",
  },
  emergenciesPolice: {
    pt: "Polícia",
    en: "Police",
    es: "Policía",
    he: "משטרה",
  },
  emergenciesFirefighters: {
    pt: "Bombeiros",
    en: "Firefighters",
    es: "Bomberos",
    he: "כבאים",
  },
  emergenciesPharmacy: {
    pt: "Farmácia",
    en: "Pharmacy",
    es: "Farmacia",
    he: "בית מרקחת",
  },
  transportBoat: {
    pt: "Lancha / Catamarã",
    en: "Speedboat / Catamaran",
    es: "Lancha / Catamarán",
    he: "סירת מנוע / קטמרן",
  },
  transportBuggy: {
    pt: "Buggy / Transfer",
    en: "Buggy / Transfer",
    es: "Buggy / Transfer",
    he: "באגי / העברה",
  },
  transportWalking: {
    pt: "A pé / Trilha",
    en: "On foot / Trail",
    es: "A pie / Sendero",
    he: "ברגל / שביל",
  },
  transportPier: {
    pt: "Porto / Cais",
    en: "Port / Pier",
    es: "Puerto / Muelle",
    he: "נמל / רציף",
  },
  transportAgency: {
    pt: "Agência de Viagem",
    en: "Travel agency",
    es: "Agencia de viajes",
    he: "סוכנות נסיעות",
  },
  menu: { pt: "Cardápio", en: "Menu", es: "Menú", he: "תפריט" },
  directions: {
    pt: "Como chegar",
    en: "Directions",
    es: "Cómo llegar",
    he: "איך להגיע",
  },
  photos: {
    pt: "Ver fotos",
    en: "View photos",
    es: "Ver fotos",
    he: "צפה תמונות",
  },
  contact: { pt: "Contato", en: "Contact", es: "Contacto", he: "יצירת קשר" },
  more: {
    pt: "Mais opções",
    en: "More options",
    es: "Más opciones",
    he: "אפשרויות נוספות",
  },
  rooms: {
    pt: "Ver quartos",
    en: "View rooms",
    es: "Ver habitaciones",
    he: "הצג חדרים",
  },
  book: { pt: "Reservar", en: "Book", es: "Reservar", he: "הזמנה" },
  beachConditions: {
    pt: "Condições da praia",
    en: "Beach conditions",
    es: "Condiciones de la playa",
    he: "תנאי החוף",
  },
  information: {
    pt: "Informações",
    en: "Information",
    es: "Información",
    he: "מידע",
  },
  bookTour: {
    pt: "Reservar passeio",
    en: "Book tour",
    es: "Reservar paseo",
    he: "הזמנת סיור",
  },
  meetingPoint: {
    pt: "Ponto de encontro",
    en: "Meeting point",
    es: "Punto de encuentro",
    he: "נקודת מפגש",
  },
  requestTransport: {
    pt: "Solicitar",
    en: "Request",
    es: "Solicitar",
    he: "הזמנה",
  },
  location: { pt: "Localização", en: "Location", es: "Ubicación", he: "מיקום" },
  fares: { pt: "Tarifas", en: "Fares", es: "Tarifas", he: "תעריפים" },
  moreInformation: {
    pt: "Mais informações",
    en: "More information",
    es: "Más información",
    he: "מידע נוסף",
  },
  favorite: { pt: "Favoritar", en: "Favorite", es: "Favorito", he: "מועדפים" },
  hours: { pt: "Horários", en: "Hours", es: "Horarios", he: "שעות" },
  priceRange: {
    pt: "Faixa de preço",
    en: "Price range",
    es: "Rango de precios",
    he: "טווח מחירים",
  },
  reviews: { pt: "Avaliações", en: "Reviews", es: "Reseñas", he: "ביקורות" },
  share: { pt: "Compartilhar", en: "Share", es: "Compartir", he: "שיתוף" },
});

export function getV1ExploreLabel(
  key: V1ExploreLabelKey,
  locale: AssistantLocale = "pt",
): string {
  return LABELS[key][locale];
}

export function getV1ExploreUiCopy(locale: AssistantLocale = "pt") {
  const copy = {
    pt: {
      selected: (name: string) => `${name} selecionado.`,
      mapUnknown: "Falha desconhecida no mapa.",
      mapCategoryError: (reason: string) =>
        `Não foi possível exibir esta categoria: ${reason}`,
      categoryAria: (label: string, count: number) =>
        `${label}, ${count} locais`,
      filtersPrompt: (label: string, count: number) =>
        `${label}: encontrei ${count} locais. Como você quer filtrar?`,
      allPrompt: (label: string, count: number) =>
        `${label}: encontrei ${count} opções. Escolha um local para ver os detalhes.`,
      nearbyPrompt: (label: string, count: number) =>
        `${label}: estes são os ${count} locais mais próximos de você.`,
      geoFallback: (label: string, count: number) =>
        `Não consegui obter sua localização. Mostrando ${count} opções de ${label}.`,
      filterFound: (label: string, count: number, filter: string) =>
        `${label}: encontrei ${count} opção(ões) para ${filter}.`,
      filterFallback: (count: number, filter: string) =>
        `Não encontrei correspondência exata para ${filter}. Mostrando todos os ${count} locais.`,
      chooseOther: (label: string) =>
        `${label}: escolha outro local para ver os detalhes.`,
    },
    en: {
      selected: (name: string) => `${name} selected.`,
      mapUnknown: "Unknown map failure.",
      mapCategoryError: (reason: string) =>
        `Unable to display this category: ${reason}`,
      categoryAria: (label: string, count: number) =>
        `${label}, ${count} places`,
      filtersPrompt: (label: string, count: number) =>
        `${label}: I found ${count} places. How would you like to filter them?`,
      allPrompt: (label: string, count: number) =>
        `${label}: I found ${count} options. Choose a place to see the details.`,
      nearbyPrompt: (label: string, count: number) =>
        `${label}: these are the ${count} places closest to you.`,
      geoFallback: (label: string, count: number) =>
        `I couldn't get your location. Showing ${count} ${label} options.`,
      filterFound: (label: string, count: number, filter: string) =>
        `${label}: I found ${count} option(s) for ${filter}.`,
      filterFallback: (count: number, filter: string) =>
        `I couldn't find an exact match for ${filter}. Showing all ${count} places.`,
      chooseOther: (label: string) =>
        `${label}: choose another place to see the details.`,
    },
    es: {
      selected: (name: string) => `${name} seleccionado.`,
      mapUnknown: "Fallo desconocido del mapa.",
      mapCategoryError: (reason: string) =>
        `No fue posible mostrar esta categoría: ${reason}`,
      categoryAria: (label: string, count: number) =>
        `${label}, ${count} lugares`,
      filtersPrompt: (label: string, count: number) =>
        `${label}: encontré ${count} lugares. ¿Cómo quieres filtrarlos?`,
      allPrompt: (label: string, count: number) =>
        `${label}: encontré ${count} opciones. Elige un lugar para ver los detalles.`,
      nearbyPrompt: (label: string, count: number) =>
        `${label}: estos son los ${count} lugares más cercanos a ti.`,
      geoFallback: (label: string, count: number) =>
        `No pude obtener tu ubicación. Mostrando ${count} opciones de ${label}.`,
      filterFound: (label: string, count: number, filter: string) =>
        `${label}: encontré ${count} opción(es) para ${filter}.`,
      filterFallback: (count: number, filter: string) =>
        `No encontré una coincidencia exacta para ${filter}. Mostrando los ${count} lugares.`,
      chooseOther: (label: string) =>
        `${label}: elige otro lugar para ver los detalles.`,
    },
    he: {
      selected: (name: string) => `${name} נבחר.`,
      mapUnknown: "תקלה לא ידועה במפה.",
      mapCategoryError: (reason: string) =>
        `לא ניתן להציג קטגוריה זו: ${reason}`,
      categoryAria: (label: string, count: number) =>
        `${label}, ${count} מקומות`,
      filtersPrompt: (label: string, count: number) =>
        `${label}: מצאתי ${count} מקומות. איך תרצה לסנן?`,
      allPrompt: (label: string, count: number) =>
        `${label}: מצאתי ${count} אפשרויות. בחר מקום כדי לראות פרטים.`,
      nearbyPrompt: (label: string, count: number) =>
        `${label}: אלה ${count} המקומות הקרובים אליך ביותר.`,
      geoFallback: (label: string, count: number) =>
        `לא הצלחתי לקבל את מיקומך. מציג ${count} אפשרויות של ${label}.`,
      filterFound: (label: string, count: number, filter: string) =>
        `${label}: מצאתי ${count} אפשרויות עבור ${filter}.`,
      filterFallback: (count: number, filter: string) =>
        `לא נמצאה התאמה מדויקת עבור ${filter}. מציג את כל ${count} המקומות.`,
      chooseOther: (label: string) => `${label}: בחר מקום אחר כדי לראות פרטים.`,
    },
  } as const;
  return copy[locale];
}
