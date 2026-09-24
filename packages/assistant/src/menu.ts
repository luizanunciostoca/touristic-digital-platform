export const ASSISTANT_LOCALES = ["pt", "en", "es", "he"] as const;

export type AssistantLocale = (typeof ASSISTANT_LOCALES)[number];

export const CANONICAL_CATEGORY_ORDER = [
  "beaches",
  "tours",
  "attractions",
  "restaurants",
  "hotels",
  "nightlife",
  "shops",
  "transport",
  "emergencies",
  "help",
] as const;

export type AssistantMenuValue = (typeof CANONICAL_CATEGORY_ORDER)[number];

export const CANONICAL_CATEGORY_LABELS = {
  beaches: { pt: "Praias", en: "Beaches", es: "Playas", he: "חופים" },
  tours: { pt: "Passeios", en: "Tours", es: "Paseos", he: "סיורים" },
  attractions: {
    pt: "Atrações",
    en: "Attractions",
    es: "Atracciones",
    he: "אטרקציות",
  },
  restaurants: {
    pt: "Restaurantes",
    en: "Restaurants",
    es: "Restaurantes",
    he: "מסעדות",
  },
  hotels: { pt: "Pousadas", en: "Hotels", es: "Hoteles", he: "מלונות" },
  nightlife: {
    pt: "Vida Noturna",
    en: "Nightlife",
    es: "Vida Nocturna",
    he: "חיי לילה",
  },
  shops: { pt: "Lojas", en: "Shops", es: "Tiendas", he: "חנויות" },
  transport: {
    pt: "Transporte",
    en: "Transport",
    es: "Transporte",
    he: "תחבורה",
  },
  emergencies: {
    pt: "Emergências",
    en: "Emergencies",
    es: "Emergencias",
    he: "מקרי חירום",
  },
  help: { pt: "Ajuda", en: "Help", es: "Ayuda", he: "עזרה" },
} as const satisfies Record<
  AssistantMenuValue,
  Record<AssistantLocale, string>
>;

export const ASSISTANT_MAIN_MENU = CANONICAL_CATEGORY_ORDER.map((value) => ({
  value,
  labels: CANONICAL_CATEGORY_LABELS[value],
}));

export function getAssistantMainMenu(locale: AssistantLocale = "pt") {
  return ASSISTANT_MAIN_MENU.map((item) => ({
    value: item.value,
    label: item.labels[locale],
  }));
}
