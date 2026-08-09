export const ASSISTANT_LOCALES = ["pt", "en", "es", "he"] as const;

export type AssistantLocale = (typeof ASSISTANT_LOCALES)[number];

export const ASSISTANT_MAIN_MENU = [
  {
    value: "beaches",
    labels: { pt: "Praias", en: "Beaches", es: "Playas", he: "חופים" },
  },
  {
    value: "restaurants",
    labels: {
      pt: "Restaurantes",
      en: "Restaurants",
      es: "Restaurantes",
      he: "מסעדות",
    },
  },
  {
    value: "hotels",
    labels: { pt: "Pousadas", en: "Hotels", es: "Hoteles", he: "מלונות" },
  },
  {
    value: "shops",
    labels: { pt: "Lojas", en: "Shops", es: "Tiendas", he: "חנויות" },
  },
  {
    value: "transport",
    labels: {
      pt: "Transporte",
      en: "Transport",
      es: "Transporte",
      he: "תחבורה",
    },
  },
  {
    value: "attractions",
    labels: {
      pt: "Atrações",
      en: "Attractions",
      es: "Atracciones",
      he: "אטרקציות",
    },
  },
  {
    value: "tours",
    labels: { pt: "Passeios", en: "Tours", es: "Paseos", he: "סיורים" },
  },
  {
    value: "nightlife",
    labels: {
      pt: "Vida Noturna",
      en: "Nightlife",
      es: "Vida Nocturna",
      he: "חיי לילה",
    },
  },
  {
    value: "emergencies",
    labels: {
      pt: "Emergências",
      en: "Emergencies",
      es: "Emergencias",
      he: "מקרי חירום",
    },
  },
  {
    value: "help",
    labels: { pt: "Ajuda", en: "Help", es: "Ayuda", he: "עזרה" },
  },
] as const;

export type AssistantMenuValue = (typeof ASSISTANT_MAIN_MENU)[number]["value"];

export function getAssistantMainMenu(locale: AssistantLocale = "pt") {
  return ASSISTANT_MAIN_MENU.map((item) => ({
    value: item.value,
    label: item.labels[locale],
  }));
}
