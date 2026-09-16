import type { AssistantDialogResponse } from "@touristic/assistant";
import {
  morroV1SearchCatalog,
  normalizeSearchText,
  type MorroV1SearchCatalogItem,
} from "@touristic/search";

import { getV1ExplorePlaceActionOptions } from "../map/explore-location-actions-v1.js";
import { getV1ExploreLabel } from "../map/explore-v1-i18n.js";

export type AssistantV1PlaceActionLanguage = "pt" | "en" | "es" | "he";

export interface AssistantV1PlaceActionRequest {
  readonly input: string;
  readonly lastPlace: string | null;
  readonly lastCategory: string | null;
  readonly language?: AssistantV1PlaceActionLanguage;
}

export interface AssistantV1PlaceActionResolution {
  readonly response: AssistantDialogResponse;
  readonly place: MorroV1SearchCatalogItem;
  readonly category: string;
  readonly navigationDestination?: Readonly<{
    name: string;
    latitude: number;
    longitude: number;
    category: string;
  }>;
}

type Copy = Readonly<Record<AssistantV1PlaceActionLanguage, string>>;

type StaticActionKey =
  | "restaurant_menu"
  | "restaurant_contact"
  | "restaurant_reviews"
  | "accommodation_rooms"
  | "accommodation_booking"
  | "accommodation_share"
  | "tour_booking"
  | "tour_meeting_point"
  | "tour_contact"
  | "beach_conditions"
  | "transport_request"
  | "transport_fares"
  | "transport_contact"
  | "transport_schedules"
  | "transport_points"
  | "transport_service_area"
  | "transport_reviews";

const STATIC_COPY: Readonly<Record<StaticActionKey, Copy>> = Object.freeze({
  restaurant_menu: {
    pt: "Este restaurante ainda não possui cardápio digital cadastrado.",
    en: "This restaurant does not have a digital menu yet.",
    es: "Este restaurante aún no tiene menú digital.",
    he: "למסעדה עדיין אין תפריט דיגיטלי.",
  },
  restaurant_contact: {
    pt: "Este restaurante ainda não possui canais de contato cadastrados.",
    en: "This restaurant has no contact channels registered yet.",
    es: "Este restaurante aún no tiene canales de contacto.",
    he: "למסעדה עדיין אין ערוצי קשר.",
  },
  restaurant_reviews: {
    pt: "Ainda não há avaliações cadastradas para este restaurante.",
    en: "No reviews are registered for this restaurant yet.",
    es: "Aún no hay reseñas registradas para este restaurante.",
    he: "עדיין אין ביקורות רשומות למסעדה זו.",
  },
  accommodation_rooms: {
    pt: "Esta hospedagem ainda não possui quartos cadastrados. Consulte disponibilidade e valores pelo contato disponível.",
    en: "This accommodation does not have registered rooms yet. Check availability and rates through the available contact channel.",
    es: "Este alojamiento aún no tiene habitaciones registradas. Consulta disponibilidad y valores por el canal de contacto disponible.",
    he: "למקום האירוח עדיין אין חדרים רשומים. ניתן לבדוק זמינות ומחירים דרך ערוץ הקשר הזמין.",
  },
  accommodation_booking: {
    pt: "Esta hospedagem ainda não possui canal de reserva cadastrado.",
    en: "This accommodation does not have a booking channel registered yet.",
    es: "Este alojamiento aún no tiene un canal de reserva registrado.",
    he: "למקום האירוח עדיין אין ערוץ הזמנה רשום.",
  },
  accommodation_share: {
    pt: "O compartilhamento desta hospedagem ainda não está disponível no assistente.",
    en: "Sharing this accommodation is not available in the assistant yet.",
    es: "Compartir este alojamiento aún no está disponible en el asistente.",
    he: "שיתוף מקום האירוח הזה עדיין אינו זמין בעוזר.",
  },
  tour_booking: {
    pt: "Este passeio ainda não possui canal de reserva cadastrado.",
    en: "This tour does not have a booking channel registered yet.",
    es: "Este paseo aún no tiene un canal de reserva registrado.",
    he: "לסיור זה עדיין אין ערוץ הזמנה רשום.",
  },
  tour_meeting_point: {
    pt: "O ponto de encontro ainda não possui coordenadas válidas cadastradas. Consulte as instruções ou entre em contato com o operador.",
    en: "The meeting point does not have valid coordinates yet. Check the instructions or contact the operator.",
    es: "El punto de encuentro aún no tiene coordenadas válidas. Consulta las instrucciones o contacta al operador.",
    he: "לנקודת המפגש עדיין אין קואורדינטות תקינות. בדוק את ההנחיות או צור קשר עם המפעיל.",
  },
  tour_contact: {
    pt: "Este passeio ainda não possui canais de contato cadastrados.",
    en: "This tour has no contact channels registered yet.",
    es: "Este paseo aún no tiene canales de contacto registrados.",
    he: "לסיור זה עדיין אין ערוצי קשר רשומים.",
  },
  beach_conditions: {
    pt: "Ainda não há condições confiáveis cadastradas para esta praia. Consulte clima, maré e avisos locais antes do banho.",
    en: "There are no reliable beach conditions registered yet. Check weather, tide and local warnings before swimming.",
    es: "Aún no hay condiciones confiables registradas para esta playa. Consulta el clima, la marea y los avisos locales antes de bañarte.",
    he: "עדיין אין תנאי חוף אמינים רשומים. בדוק מזג אוויר, גאות ואזהרות מקומיות לפני הרחצה.",
  },
  transport_request: {
    pt: "Este transporte ainda não possui canal de solicitação cadastrado.",
    en: "This transport service has no request channel registered yet.",
    es: "Este transporte aún no tiene un canal de solicitud registrado.",
    he: "לשירות הסעה זה עדיין אין ערוץ הזמנה רשום.",
  },
  transport_fares: {
    pt: "As tarifas ainda não estão cadastradas. Consulte o operador para confirmar o valor.",
    en: "Fares are not registered yet. Contact the operator to confirm the price.",
    es: "Las tarifas aún no están registradas. Consulta al operador para confirmar el precio.",
    he: "התעריפים עדיין לא רשומים. יש לפנות למפעיל לאישור המחיר.",
  },
  transport_contact: {
    pt: "Este transporte ainda não possui canais de contato cadastrados.",
    en: "This transport service has no contact channels registered yet.",
    es: "Este transporte aún no tiene canales de contacto registrados.",
    he: "לשירות הסעה זה עדיין אין ערוצי קשר רשומים.",
  },
  transport_schedules: {
    pt: "Os horários ainda não estão cadastrados.",
    en: "Schedules are not registered yet.",
    es: "Los horarios aún no están registrados.",
    he: "השעות עדיין אינן רשומות.",
  },
  transport_points: {
    pt: "Os pontos ainda não estão cadastrados.",
    en: "Stops are not registered yet.",
    es: "Los puntos aún no están registrados.",
    he: "התחנות עדיין אינן רשומות.",
  },
  transport_service_area: {
    pt: "A área atendida ainda não está cadastrada.",
    en: "The service area is not registered yet.",
    es: "El área de servicio aún no está registrada.",
    he: "אזור השירות עדיין אינו רשום.",
  },
  transport_reviews: {
    pt: "Ainda não há avaliações cadastradas para este transporte.",
    en: "No reviews are registered for this transport service yet.",
    es: "Aún no hay reseñas registradas para este transporte.",
    he: "עדיין אין ביקורות רשומות לשירות זה.",
  },
});

const STATIC_ACTIONS: Readonly<
  Record<
    string,
    readonly Readonly<{ aliases: readonly string[]; action: StaticActionKey }>[]
  >
> = Object.freeze({
  restaurants: [
    { aliases: ["cardapio", "menu"], action: "restaurant_menu" },
    {
      aliases: ["contato", "contact", "contacto"],
      action: "restaurant_contact",
    },
    {
      aliases: ["avaliacoes", "reviews"],
      action: "restaurant_reviews",
    },
  ],
  hotels: [
    {
      aliases: ["ver quartos", "quartos", "rooms"],
      action: "accommodation_rooms",
    },
    {
      aliases: ["reservar", "reserva", "book", "booking"],
      action: "accommodation_booking",
    },
    {
      aliases: ["compartilhar", "share"],
      action: "accommodation_share",
    },
  ],
  tours: [
    {
      aliases: [
        "reservar passeio",
        "reservar",
        "reserva",
        "book tour",
        "booking",
      ],
      action: "tour_booking",
    },
    {
      aliases: ["ponto de encontro", "meeting point", "local de encontro"],
      action: "tour_meeting_point",
    },
    { aliases: ["contato", "contact", "contacto"], action: "tour_contact" },
  ],
  beaches: [
    {
      aliases: ["condicoes da praia", "condicoes", "beach conditions"],
      action: "beach_conditions",
    },
  ],
  transport: [
    {
      aliases: ["solicitar transporte", "solicitar", "request transport"],
      action: "transport_request",
    },
    {
      aliases: ["tarifas", "tarifa", "fares", "fare"],
      action: "transport_fares",
    },
    {
      aliases: ["contato", "contact", "contacto"],
      action: "transport_contact",
    },
    { aliases: ["horarios", "schedules"], action: "transport_schedules" },
    { aliases: ["pontos", "stops", "points"], action: "transport_points" },
    {
      aliases: ["area atendida", "service area"],
      action: "transport_service_area",
    },
    { aliases: ["avaliacoes", "reviews"], action: "transport_reviews" },
  ],
});

function resolvePlace(name: string | null): MorroV1SearchCatalogItem | null {
  if (!name) return null;
  const normalized = normalizeSearchText(name);
  return (
    morroV1SearchCatalog.find(
      (candidate) => normalizeSearchText(candidate.name) === normalized,
    ) ??
    morroV1SearchCatalog.find((candidate) =>
      (candidate.aliases ?? []).some(
        (alias) => normalizeSearchText(alias) === normalized,
      ),
    ) ??
    null
  );
}

function primaryOptions(
  category: string,
  language: AssistantV1PlaceActionLanguage,
) {
  return getV1ExplorePlaceActionOptions(category, language).map(
    ({ label, value }) => ({
      label,
      value,
    }),
  );
}

function resolved(
  place: MorroV1SearchCatalogItem,
  action: StaticActionKey,
  language: AssistantV1PlaceActionLanguage,
): AssistantV1PlaceActionResolution {
  return {
    place,
    category: place.category,
    response: {
      text: STATIC_COPY[action][language],
      options: primaryOptions(place.category, language),
      metadata: {
        domain: "v1_place_action",
        state: "unavailable",
        action,
        place: place.name,
        category: place.category,
        deterministic: true,
      },
    },
  };
}

function transportNavigationConfirmation(
  placeName: string,
  language: AssistantV1PlaceActionLanguage,
) {
  const copy = {
    pt: {
      text: `Deseja iniciar a navegação até ${placeName}?`,
      yes: "Sim",
      no: "Não",
    },
    en: {
      text: `Would you like to start navigation to ${placeName}?`,
      yes: "Yes",
      no: "No",
    },
    es: {
      text: `¿Deseas iniciar la navegación hasta ${placeName}?`,
      yes: "Sí",
      no: "No",
    },
    he: { text: `האם תרצה להתחיל ניווט אל ${placeName}?`, yes: "כן", no: "לא" },
  } as const;
  return copy[language];
}

function moreOptions(
  place: MorroV1SearchCatalogItem,
  language: AssistantV1PlaceActionLanguage,
): AssistantV1PlaceActionResolution | null {
  const back = {
    label: `⬅️ ${getV1ExploreLabel("back", language)}`,
    value: place.name,
  };
  const copy: Partial<Record<string, Copy>> = {
    restaurants: {
      pt: "Outras informações disponíveis:",
      en: "Other available information:",
      es: "Otra información disponible:",
      he: "מידע נוסף זמין:",
    },
    hotels: {
      pt: "Outras informações da hospedagem:",
      en: "More accommodation information:",
      es: "Más información del alojamiento:",
      he: "מידע נוסף על מקום האירוח:",
    },
    tours: {
      pt: "Outras informações disponíveis sobre o passeio:",
      en: "More information available about the tour:",
      es: "Más información disponible sobre el paseo:",
      he: "מידע נוסף זמין על הסיור:",
    },
    beaches: {
      pt: "Outras informações disponíveis sobre a praia:",
      en: "More information available about the beach:",
      es: "Más información disponible sobre la playa:",
      he: "מידע נוסף זמין על החוף:",
    },
    transport: {
      pt: "Ainda não há informações adicionais cadastradas para este transporte.",
      en: "No additional information is registered for this transport service yet.",
      es: "Aún no hay información adicional registrada para este transporte.",
      he: "עדיין אין מידע נוסף רשום עבור שירות הסעה זה.",
    },
  };
  const text = copy[place.category];
  const action = {
    restaurants: "restaurant_more_options",
    hotels: "accommodation_more_options",
    tours: "tour_more_options",
    beaches: "beach_more_options",
    transport: "transport_more_options",
  }[place.category];
  if (!text || !action) return null;
  const options =
    place.category === "restaurants"
      ? [
          {
            label: `ℹ️ ${getV1ExploreLabel("information", language)}`,
            value: "mais detalhes",
          },
          {
            label: `🕒 ${getV1ExploreLabel("hours", language)}`,
            value: "horário de funcionamento",
          },
          {
            label: `💰 ${getV1ExploreLabel("priceRange", language)}`,
            value: "quanto custa",
          },
          {
            label: `⭐ ${getV1ExploreLabel("reviews", language)}`,
            value: "avaliações",
          },
          {
            label: `❤️ ${getV1ExploreLabel("favorite", language)}`,
            value: "adicionar aos favoritos",
          },
          back,
        ]
      : place.category === "hotels"
        ? [
            {
              label: `🔗 ${getV1ExploreLabel("share", language)}`,
              value: "compartilhar",
            },
            back,
          ]
        : [back];
  return {
    place,
    category: place.category,
    response: {
      text: text[language],
      options,
      metadata: {
        domain: "v1_place_action",
        state: place.category === "transport" ? "unavailable" : "resolved",
        action,
        place: place.name,
        category: place.category,
        deterministic: true,
      },
    },
  };
}

export function resolveAssistantV1PlaceAction(
  request: AssistantV1PlaceActionRequest,
): AssistantV1PlaceActionResolution | null {
  const place = resolvePlace(request.lastPlace);
  if (!place) return null;
  if ((request.lastCategory ?? place.category) !== place.category) return null;

  const language = request.language ?? "pt";
  const normalized = normalizeSearchText(request.input);
  if (
    [
      "mais opcoes",
      "outras opcoes",
      "more options",
      "mas opciones",
      "אפשרויות נוספות",
    ].includes(normalized)
  ) {
    return moreOptions(place, language);
  }

  if (
    place.category === "transport" &&
    ["localizacao", "location", "ubicacion", "מיקום"].includes(normalized)
  ) {
    const destination = Object.freeze({
      name: place.name,
      latitude: place.latitude,
      longitude: place.longitude,
      category: place.category,
    });
    const confirmation = transportNavigationConfirmation(place.name, language);
    return {
      place,
      category: place.category,
      navigationDestination: destination,
      response: {
        text: confirmation.text,
        options: [
          { label: confirmation.yes, value: "sim" },
          { label: confirmation.no, value: "não" },
        ],
        metadata: {
          domain: "v1_place_action",
          state: "awaiting_confirmation",
          action: "transport_location",
          place: place.name,
          category: place.category,
          deterministic: true,
          navigation: "awaiting_confirmation",
          destination: place.name,
          pendingRoute: destination,
        },
      },
    };
  }

  const match = STATIC_ACTIONS[place.category]?.find(({ aliases }) =>
    aliases.includes(normalized),
  );
  return match ? resolved(place, match.action, language) : null;
}
