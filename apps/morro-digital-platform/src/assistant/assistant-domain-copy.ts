export type AssistantDomainLanguage = "pt" | "en" | "es" | "he";

export interface AssistantDomainOption {
  readonly label: string;
  readonly value: string;
}

const PLACE_OPTIONS: Record<
  AssistantDomainLanguage,
  readonly AssistantDomainOption[]
> = {
  pt: [
    { label: "Como chegar", value: "como chegar" },
    { label: "Ver fotos", value: "ver fotos" },
    { label: "Horário", value: "horário" },
    { label: "Voltar ao menu principal", value: "voltar ao menu" },
  ],
  en: [
    { label: "How to get there", value: "how to get there" },
    { label: "See photos", value: "see photos" },
    { label: "Opening hours", value: "opening hours" },
    { label: "Back to main menu", value: "back to main menu" },
  ],
  es: [
    { label: "Cómo llegar", value: "como llegar" },
    { label: "Ver fotos", value: "ver fotos" },
    { label: "Horario", value: "horario" },
    { label: "Volver al menú principal", value: "volver al menu" },
  ],
  he: [
    { label: "איך מגיעים", value: "איך מגיעים" },
    { label: "הצג תמונות", value: "הצג תמונות" },
    { label: "שעות פתיחה", value: "שעות פתיחה" },
    { label: "חזרה לתפריט הראשי", value: "חזרה לתפריט הראשי" },
  ],
};

const HELP_OPTIONS: Record<
  AssistantDomainLanguage,
  readonly AssistantDomainOption[]
> = {
  pt: [
    { label: "Praias", value: "praias" },
    { label: "Restaurantes", value: "restaurantes" },
    { label: "Pousadas", value: "pousadas" },
    { label: "Atrações", value: "atrações" },
  ],
  en: [
    { label: "Beaches", value: "beaches" },
    { label: "Restaurants", value: "restaurants" },
    { label: "Hotels", value: "hotels" },
    { label: "Attractions", value: "attractions" },
  ],
  es: [
    { label: "Playas", value: "playas" },
    { label: "Restaurantes", value: "restaurantes" },
    { label: "Posadas", value: "posadas" },
    { label: "Atracciones", value: "atracciones" },
  ],
  he: [
    { label: "חופים", value: "חופים" },
    { label: "מסעדות", value: "מסעדות" },
    { label: "מלונות", value: "מלונות" },
    { label: "אטרקציות", value: "אטרקציות" },
  ],
};

const NEARBY_OPTIONS: Record<
  AssistantDomainLanguage,
  readonly AssistantDomainOption[]
> = {
  pt: [
    { label: "Praias", value: "praias perto de mim" },
    { label: "Restaurantes", value: "restaurantes perto de mim" },
    { label: "Pousadas", value: "pousadas perto de mim" },
    { label: "Atrações", value: "atrações perto de mim" },
    { label: "Passeios", value: "passeios perto de mim" },
    { label: "Emergências", value: "emergências perto de mim" },
  ],
  en: [
    { label: "Beaches", value: "beaches near me" },
    { label: "Restaurants", value: "restaurants near me" },
    { label: "Hotels", value: "hotels near me" },
    { label: "Attractions", value: "attractions near me" },
    { label: "Tours", value: "tours near me" },
    { label: "Emergencies", value: "emergencies near me" },
  ],
  es: [
    { label: "Playas", value: "playas cerca de mi" },
    { label: "Restaurantes", value: "restaurantes cerca de mi" },
    { label: "Posadas", value: "posadas cerca de mi" },
    { label: "Atracciones", value: "atracciones cerca de mi" },
    { label: "Paseos", value: "paseos cerca de mi" },
    { label: "Emergencias", value: "emergencias cerca de mi" },
  ],
  he: [
    { label: "חופים", value: "חופים קרובים אליי" },
    { label: "מסעדות", value: "מסעדות קרובות אליי" },
    { label: "מלונות", value: "מלונות קרובים אליי" },
    { label: "אטרקציות", value: "אטרקציות קרובות אליי" },
    { label: "סיורים", value: "סיורים קרובים אליי" },
    { label: "חירום", value: "שירותי חירום קרובים אליי" },
  ],
};

export function placeDetailsOptions(
  language: AssistantDomainLanguage,
): readonly AssistantDomainOption[] {
  return PLACE_OPTIONS[language];
}

export function helpResponse(language: AssistantDomainLanguage) {
  const text: Record<AssistantDomainLanguage, string> = {
    pt: "Posso ajudar com praias, restaurantes, pousadas, atrações, passeios, vida noturna, localização, favoritos e rotas.",
    en: "I can help with beaches, restaurants, hotels, attractions, tours, nightlife, location, favorites, and routes.",
    es: "Puedo ayudarte con playas, restaurantes, posadas, atracciones, paseos, vida nocturna, ubicación, favoritos y rutas.",
    he: "אני יכול לעזור עם חופים, מסעדות, מלונות, אטרקציות, סיורים, חיי לילה, מיקום, מועדפים ומסלולים.",
  };
  return { text: text[language], options: HELP_OPTIONS[language] };
}

export function askPlaceCopy(
  language: AssistantDomainLanguage,
  intent: "photos" | "price" | "hours" | "more_info",
): string {
  const copy: Record<AssistantDomainLanguage, Record<typeof intent, string>> = {
    pt: {
      photos: "De qual local você quer ver fotos?",
      price: "De qual local você quer saber o preço?",
      hours: "De qual local você quer saber o horário?",
      more_info: "Sobre qual local você quer mais informações?",
    },
    en: {
      photos: "Which place would you like to see photos of?",
      price: "Which place would you like price information for?",
      hours: "Which place would you like opening hours for?",
      more_info: "Which place would you like more information about?",
    },
    es: {
      photos: "¿De qué lugar quieres ver fotos?",
      price: "¿De qué lugar quieres saber el precio?",
      hours: "¿De qué lugar quieres saber el horario?",
      more_info: "¿Sobre qué lugar quieres más información?",
    },
    he: {
      photos: "של איזה מקום תרצה לראות תמונות?",
      price: "על איזה מקום תרצה מידע על המחיר?",
      hours: "על איזה מקום תרצה לדעת את שעות הפתיחה?",
      more_info: "על איזה מקום תרצה מידע נוסף?",
    },
  };
  return copy[language][intent];
}

export function locationCopy(language: AssistantDomainLanguage) {
  const copy: Record<
    AssistantDomainLanguage,
    { unavailable: string; resolved: string; failed: string }
  > = {
    pt: {
      unavailable: "Não consegui acessar sua localização neste dispositivo.",
      resolved: "Localização atualizada com sucesso.",
      failed:
        "Não consegui obter sua localização. Verifique a permissão de localização e tente novamente.",
    },
    en: {
      unavailable: "I couldn't access your location on this device.",
      resolved: "Location updated successfully.",
      failed:
        "I couldn't get your location. Check location permission and try again.",
    },
    es: {
      unavailable: "No pude acceder a tu ubicación en este dispositivo.",
      resolved: "Ubicación actualizada correctamente.",
      failed:
        "No pude obtener tu ubicación. Verifica el permiso de ubicación e inténtalo de nuevo.",
    },
    he: {
      unavailable: "לא הצלחתי לגשת למיקום שלך במכשיר הזה.",
      resolved: "המיקום עודכן בהצלחה.",
      failed: "לא הצלחתי לקבל את המיקום שלך. בדוק את הרשאת המיקום ונסה שוב.",
    },
  };
  return copy[language];
}

export function nearbyCopy(
  language: AssistantDomainLanguage,
  state:
    "awaiting_category" | "location_required" | "empty" | "denied_or_failed",
): {
  readonly text: string;
  readonly options?: readonly AssistantDomainOption[];
} {
  const text: Record<AssistantDomainLanguage, Record<typeof state, string>> = {
    pt: {
      awaiting_category:
        "Posso buscar o que está mais perto de você, mas primeiro me diga a categoria: praias, restaurantes, pousadas, atrações, passeios ou emergências.",
      location_required:
        "Para buscar lugares próximos, preciso da sua localização atual.",
      empty:
        "Não encontrei locais dessa categoria no catálogo curado de Morro de São Paulo.",
      denied_or_failed:
        "Não consegui obter sua localização. Verifique a permissão de localização e tente novamente.",
    },
    en: {
      awaiting_category:
        "I can find what is closest to you, but first choose a category: beaches, restaurants, hotels, attractions, tours, or emergencies.",
      location_required: "To find nearby places, I need your current location.",
      empty:
        "I couldn't find places in this category in the curated Morro de São Paulo catalog.",
      denied_or_failed:
        "I couldn't get your location. Check location permission and try again.",
    },
    es: {
      awaiting_category:
        "Puedo buscar lo que está más cerca de ti, pero primero elige una categoría: playas, restaurantes, posadas, atracciones, paseos o emergencias.",
      location_required:
        "Para buscar lugares cercanos, necesito tu ubicación actual.",
      empty:
        "No encontré lugares de esta categoría en el catálogo curado de Morro de São Paulo.",
      denied_or_failed:
        "No pude obtener tu ubicación. Verifica el permiso de ubicación e inténtalo de nuevo.",
    },
    he: {
      awaiting_category:
        "אני יכול למצוא מה הכי קרוב אליך, אבל קודם בחר קטגוריה: חופים, מסעדות, מלונות, אטרקציות, סיורים או שירותי חירום.",
      location_required:
        "כדי למצוא מקומות קרובים אני צריך את המיקום הנוכחי שלך.",
      empty: "לא מצאתי מקומות בקטגוריה הזו בקטלוג האוצר של מורו דה סאו פאולו.",
      denied_or_failed:
        "לא הצלחתי לקבל את המיקום שלך. בדוק את הרשאת המיקום ונסה שוב.",
    },
  };
  return {
    text: text[language][state],
    ...(state === "awaiting_category" || state === "empty"
      ? { options: NEARBY_OPTIONS[language] }
      : {}),
  };
}

export function nearbyResolvedCopy(
  language: AssistantDomainLanguage,
  results: readonly {
    readonly name: string;
    readonly distanceMeters: number;
  }[],
): string {
  const list = results
    .map((result) => `${result.name} (${result.distanceMeters} m)`)
    .join(", ");
  const text: Record<AssistantDomainLanguage, string> = {
    pt: `Mais perto de você: ${list}.`,
    en: `Closest to you: ${list}.`,
    es: `Más cerca de ti: ${list}.`,
    he: `הכי קרוב אליך: ${list}.`,
  };
  return text[language];
}

export function favoritesCopy(
  language: AssistantDomainLanguage,
  names: readonly string[],
) {
  if (names.length === 0) {
    const empty: Record<AssistantDomainLanguage, string> = {
      pt: "Você ainda não adicionou lugares aos favoritos.",
      en: "You haven't added any favorite places yet.",
      es: "Todavía no has añadido lugares a favoritos.",
      he: "עדיין לא הוספת מקומות למועדפים.",
    };
    return empty[language];
  }
  const joined = names.join(", ");
  const text: Record<AssistantDomainLanguage, string> = {
    pt: `Seus favoritos: ${joined}.`,
    en: `Your favorites: ${joined}.`,
    es: `Tus favoritos: ${joined}.`,
    he: `המועדפים שלך: ${joined}.`,
  };
  return text[language];
}

export function photosCopy(
  language: AssistantDomainLanguage,
  state: "unavailable" | "asset_source_pending" | "resolved",
  place: string,
  count = 0,
): string {
  const copy: Record<AssistantDomainLanguage, Record<typeof state, string>> = {
    pt: {
      unavailable: `Não encontrei fotos disponíveis de ${place}.`,
      asset_source_pending: `As fotos de ${place} estão catalogadas, mas os arquivos ainda não estão disponíveis nesta versão.`,
      resolved: `Encontrei ${count} fotos de ${place}.`,
    },
    en: {
      unavailable: `I couldn't find available photos of ${place}.`,
      asset_source_pending: `Photos of ${place} are cataloged, but the files are not available in this version yet.`,
      resolved: `I found ${count} photos of ${place}.`,
    },
    es: {
      unavailable: `No encontré fotos disponibles de ${place}.`,
      asset_source_pending: `Las fotos de ${place} están catalogadas, pero los archivos todavía no están disponibles en esta versión.`,
      resolved: `Encontré ${count} fotos de ${place}.`,
    },
    he: {
      unavailable: `לא מצאתי תמונות זמינות של ${place}.`,
      asset_source_pending: `התמונות של ${place} מקוטלגות, אבל הקבצים עדיין אינם זמינים בגרסה הזו.`,
      resolved: `מצאתי ${count} תמונות של ${place}.`,
    },
  };
  return copy[language][state];
}

export function hoursCopy(
  language: AssistantDomainLanguage,
  place: string,
  openNow: boolean | null,
): string {
  if (openNow === null) {
    const missing: Record<AssistantDomainLanguage, string> = {
      pt: `Não encontrei um horário de funcionamento atualizado para ${place}.`,
      en: `I couldn't find up-to-date opening hours for ${place}.`,
      es: `No encontré un horario de funcionamiento actualizado para ${place}.`,
      he: `לא מצאתי שעות פתיחה עדכניות עבור ${place}.`,
    };
    return missing[language];
  }
  const text: Record<AssistantDomainLanguage, string> = {
    pt: `${place} está ${openNow ? "aberto" : "fechado"} agora.`,
    en: `${place} is ${openNow ? "open" : "closed"} now.`,
    es: `${place} está ${openNow ? "abierto" : "cerrado"} ahora.`,
    he: `${place} ${openNow ? "פתוח" : "סגור"} עכשיו.`,
  };
  return text[language];
}

export function moreInfoUnavailable(
  language: AssistantDomainLanguage,
  place: string,
): string {
  const text: Record<AssistantDomainLanguage, string> = {
    pt: `Não encontrei detalhes atualizados de ${place}.`,
    en: `I couldn't find up-to-date details for ${place}.`,
    es: `No encontré detalles actualizados de ${place}.`,
    he: `לא מצאתי פרטים עדכניים על ${place}.`,
  };
  return text[language];
}

export function formatPlaceDetailsCopy(
  language: AssistantDomainLanguage,
  details: {
    readonly name: string;
    readonly category?: string | null;
    readonly address?: string | null;
    readonly openNow: boolean | null;
    readonly phone?: string | null;
    readonly website?: string | null;
  },
): string {
  const parts = [details.name];
  if (details.category) parts.push(details.category);
  if (details.address) parts.push(details.address);
  if (details.openNow !== null) {
    const openState: Record<
      AssistantDomainLanguage,
      readonly [string, string]
    > = {
      pt: ["Aberto agora", "Fechado agora"],
      en: ["Open now", "Closed now"],
      es: ["Abierto ahora", "Cerrado ahora"],
      he: ["פתוח עכשיו", "סגור עכשיו"],
    };
    parts.push(openState[language][details.openNow ? 0 : 1]);
  }
  if (details.phone) {
    const phoneLabel: Record<AssistantDomainLanguage, string> = {
      pt: "Telefone",
      en: "Phone",
      es: "Teléfono",
      he: "טלפון",
    };
    parts.push(`${phoneLabel[language]}: ${details.phone}`);
  }
  if (details.website) {
    const siteLabel: Record<AssistantDomainLanguage, string> = {
      pt: "Site",
      en: "Website",
      es: "Sitio web",
      he: "אתר",
    };
    parts.push(`${siteLabel[language]}: ${details.website}`);
  }
  return parts.join(" · ");
}

export function priceCopy(
  language: AssistantDomainLanguage,
  place: string,
): string {
  const text: Record<AssistantDomainLanguage, string> = {
    pt: `💰 Sobre preços em <b>${place}</b>:<br><br>As informações de preço podem variar. Recomendo verificar diretamente com o estabelecimento.<br><br>Em geral, as praias de Morro de São Paulo são <b>gratuitas</b>. Passeios de barco custam em torno de <b>R$ 80-150</b> por pessoa. Restaurantes variam de <b>R$ 30-150</b> por pessoa.`,
    en: `💰 About prices at <b>${place}</b>:<br><br>Prices may vary. I recommend checking directly with the establishment.<br><br>In general, the beaches in Morro de São Paulo are <b>free</b>. Boat tours cost around <b>R$ 80-150</b> per person. Restaurants range from <b>R$ 30-150</b> per person.`,
    es: `💰 Sobre precios en <b>${place}</b>:<br><br>Los precios pueden variar. Recomiendo consultar directamente con el establecimiento.<br><br>En general, las playas de Morro de São Paulo son <b>gratuitas</b>. Los paseos en barco cuestan alrededor de <b>R$ 80-150</b> por persona. Los restaurantes varían entre <b>R$ 30-150</b> por persona.`,
    he: `💰 לגבי מחירים ב־<b>${place}</b>:<br><br>המחירים עשויים להשתנות. מומלץ לבדוק ישירות מול העסק.<br><br>באופן כללי, החופים במורו דה סאו פאולו הם <b>בחינם</b>. סיורי סירה עולים בערך <b>R$ 80-150</b> לאדם. מסעדות נעות סביב <b>R$ 30-150</b> לאדם.`,
  };
  return text[language];
}
