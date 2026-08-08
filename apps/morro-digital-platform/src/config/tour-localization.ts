import {
  getMorroTourById,
  morroTourCatalog,
  type TourRouteContract,
  type TourStopContract,
} from "./tour-catalog.js";

export const supportedTourLocales = ["pt-BR", "en", "es"] as const;
export type TourLocale = (typeof supportedTourLocales)[number];

interface LocalizedStopContent {
  readonly title: string;
  readonly photoAlt: string;
}

interface LocalizedRouteContent {
  readonly title: string;
  readonly description: string;
  readonly duration: string;
  readonly transport: string;
  readonly stops: Readonly<Record<string, LocalizedStopContent>>;
}

type LocalizedContentCatalog = Readonly<
  Record<string, Readonly<Record<TourLocale, LocalizedRouteContent>>>
>;

export interface LocalizedTourStopContract extends TourStopContract {
  readonly locale: TourLocale;
}

export interface LocalizedTourRouteContract extends TourRouteContract {
  readonly locale: TourLocale;
  readonly stops: readonly LocalizedTourStopContract[];
}

const translations: LocalizedContentCatalog = Object.freeze({
  "volta-a-ilha": Object.freeze({
    "pt-BR": Object.freeze({
      title: "Passeio Volta à Ilha",
      description:
        "O passeio mais tradicional de Morro de São Paulo. Conheça as belezas da ilha de Tinharé e Boipeba.",
      duration: "Aprox. 5 a 6 horas",
      transport: "Lancha rápida",
      stops: Object.freeze({
        "stop-1": Object.freeze({
          title: "Partida: Terceira Praia",
          photoAlt: "Lancha rápida na Terceira Praia de Morro de São Paulo",
        }),
        "stop-2": Object.freeze({
          title: "Piscinas Naturais de Garapuá",
          photoAlt:
            "Piscinas naturais de Garapuá com águas cristalinas e barcos",
        }),
        "stop-3": Object.freeze({
          title: "Piscinas Naturais de Moreré",
          photoAlt:
            "Piscinas naturais de Moreré em Boipeba com corais coloridos",
        }),
        "stop-4": Object.freeze({
          title: "Praia de Cueira (Boipeba)",
          photoAlt: "Praia da Cueira em Boipeba com barracas e coqueiros",
        }),
        "stop-5": Object.freeze({
          title: "Boca da Barra e Rio do Inferno",
          photoAlt: "Passeio de barco pelo Rio do Inferno com manguezais",
        }),
        "stop-6": Object.freeze({
          title: "Ostras em Canavieiras",
          photoAlt: "Criatório de ostras em Canavieiras com degustação",
        }),
        "stop-7": Object.freeze({
          title: "Cairu (Sede do Município)",
          photoAlt:
            "Convento de Santo Antônio em Cairu, arquitetura barroca histórica",
        }),
        "stop-8": Object.freeze({
          title: "Retorno no Pôr do Sol",
          photoAlt: "Lancha retornando ao pôr do sol em Morro de São Paulo",
        }),
      }),
    }),
    en: Object.freeze({
      title: "Around the Island Tour",
      description:
        "Morro de São Paulo's most traditional boat tour. Discover the natural beauty of Tinharé and Boipeba islands.",
      duration: "Approx. 5 to 6 hours",
      transport: "Speedboat",
      stops: Object.freeze({
        "stop-1": Object.freeze({
          title: "Departure: Third Beach",
          photoAlt: "Speedboat at Third Beach in Morro de São Paulo",
        }),
        "stop-2": Object.freeze({
          title: "Garapuá Natural Pools",
          photoAlt: "Garapuá natural pools with crystal-clear water and boats",
        }),
        "stop-3": Object.freeze({
          title: "Moreré Natural Pools",
          photoAlt: "Moreré natural pools in Boipeba with colorful coral reefs",
        }),
        "stop-4": Object.freeze({
          title: "Cueira Beach (Boipeba)",
          photoAlt: "Cueira Beach in Boipeba with beach stalls and palm trees",
        }),
        "stop-5": Object.freeze({
          title: "Boca da Barra and Rio do Inferno",
          photoAlt: "Boat trip along Rio do Inferno surrounded by mangroves",
        }),
        "stop-6": Object.freeze({
          title: "Oysters in Canavieiras",
          photoAlt: "Oyster farm in Canavieiras with tasting experience",
        }),
        "stop-7": Object.freeze({
          title: "Cairu (Municipal Seat)",
          photoAlt:
            "Santo Antônio Convent in Cairu, with historic Baroque architecture",
        }),
        "stop-8": Object.freeze({
          title: "Sunset Return",
          photoAlt: "Speedboat returning to Morro de São Paulo at sunset",
        }),
      }),
    }),
    es: Object.freeze({
      title: "Paseo Vuelta a la Isla",
      description:
        "El paseo en barco más tradicional de Morro de São Paulo. Descubre las bellezas naturales de las islas de Tinharé y Boipeba.",
      duration: "Aprox. 5 a 6 horas",
      transport: "Lancha rápida",
      stops: Object.freeze({
        "stop-1": Object.freeze({
          title: "Salida: Tercera Playa",
          photoAlt: "Lancha rápida en la Tercera Playa de Morro de São Paulo",
        }),
        "stop-2": Object.freeze({
          title: "Piscinas Naturales de Garapuá",
          photoAlt:
            "Piscinas naturales de Garapuá con aguas cristalinas y barcos",
        }),
        "stop-3": Object.freeze({
          title: "Piscinas Naturales de Moreré",
          photoAlt:
            "Piscinas naturales de Moreré en Boipeba con corales coloridos",
        }),
        "stop-4": Object.freeze({
          title: "Playa de Cueira (Boipeba)",
          photoAlt:
            "Playa de Cueira en Boipeba con puestos de playa y palmeras",
        }),
        "stop-5": Object.freeze({
          title: "Boca da Barra y Rio do Inferno",
          photoAlt: "Paseo en barco por el Rio do Inferno rodeado de manglares",
        }),
        "stop-6": Object.freeze({
          title: "Ostras en Canavieiras",
          photoAlt: "Cultivo de ostras en Canavieiras con degustación",
        }),
        "stop-7": Object.freeze({
          title: "Cairu (Sede Municipal)",
          photoAlt:
            "Convento de Santo Antônio en Cairu, con arquitectura barroca histórica",
        }),
        "stop-8": Object.freeze({
          title: "Regreso al Atardecer",
          photoAlt: "Lancha regresando a Morro de São Paulo al atardecer",
        }),
      }),
    }),
  }),
  "trilha-gamboa": Object.freeze({
    "pt-BR": Object.freeze({
      title: "Trilha Ecológica para a Gamboa",
      description:
        "Uma caminhada leve e cênica que mistura praias, banho de argila e vila de pescadores.",
      duration: "Aprox. 45 minutos de caminhada (só ida)",
      transport: "A pé (retorno opcional de barco)",
      stops: Object.freeze({
        "stop-1": Object.freeze({
          title: "Início: Fonte Grande",
          photoAlt:
            "Fonte Grande de Morro de São Paulo, início da trilha para Gamboa",
        }),
        "stop-2": Object.freeze({
          title: "Praia do Porto de Cima",
          photoAlt: "Praia do Porto de Cima com pedras e águas calmas",
        }),
        "stop-3": Object.freeze({
          title: "Praia da Ponta da Pedra",
          photoAlt:
            "Vista panorâmica da Praia da Ponta da Pedra com mata atlântica",
        }),
        "stop-4": Object.freeze({
          title: "Paredão de Argila",
          photoAlt: "Paredão de argila rosa e amarela na trilha para Gamboa",
        }),
        "stop-5": Object.freeze({
          title: "Praia da Gamboa do Morro",
          photoAlt: "Praia da Gamboa com barracas de pescadores e águas calmas",
        }),
      }),
    }),
    en: Object.freeze({
      title: "Ecological Trail to Gamboa",
      description:
        "A light and scenic walk combining beaches, a natural clay stop and the atmosphere of a fishing village.",
      duration: "Approx. 45-minute walk (one way)",
      transport: "On foot (optional boat return)",
      stops: Object.freeze({
        "stop-1": Object.freeze({
          title: "Start: Fonte Grande",
          photoAlt:
            "Fonte Grande in Morro de São Paulo, starting point of the trail to Gamboa",
        }),
        "stop-2": Object.freeze({
          title: "Porto de Cima Beach",
          photoAlt: "Porto de Cima Beach with rocks and calm water",
        }),
        "stop-3": Object.freeze({
          title: "Ponta da Pedra Beach",
          photoAlt:
            "Panoramic view of Ponta da Pedra Beach and the Atlantic Forest",
        }),
        "stop-4": Object.freeze({
          title: "Clay Cliff",
          photoAlt: "Pink and yellow clay cliff along the trail to Gamboa",
        }),
        "stop-5": Object.freeze({
          title: "Gamboa do Morro Beach",
          photoAlt: "Gamboa Beach with fishermen's stalls and calm water",
        }),
      }),
    }),
    es: Object.freeze({
      title: "Sendero Ecológico a Gamboa",
      description:
        "Una caminata ligera y escénica que combina playas, una parada de arcilla natural y el ambiente de un pueblo de pescadores.",
      duration: "Aprox. 45 minutos a pie (solo ida)",
      transport: "A pie (regreso opcional en barco)",
      stops: Object.freeze({
        "stop-1": Object.freeze({
          title: "Inicio: Fonte Grande",
          photoAlt:
            "Fonte Grande en Morro de São Paulo, inicio del sendero hacia Gamboa",
        }),
        "stop-2": Object.freeze({
          title: "Playa de Porto de Cima",
          photoAlt: "Playa de Porto de Cima con rocas y aguas tranquilas",
        }),
        "stop-3": Object.freeze({
          title: "Playa de Ponta da Pedra",
          photoAlt:
            "Vista panorámica de la Playa de Ponta da Pedra y la Mata Atlántica",
        }),
        "stop-4": Object.freeze({
          title: "Paredón de Arcilla",
          photoAlt:
            "Paredón de arcilla rosa y amarilla en el sendero hacia Gamboa",
        }),
        "stop-5": Object.freeze({
          title: "Playa de Gamboa do Morro",
          photoAlt:
            "Playa de Gamboa con puestos de pescadores y aguas tranquilas",
        }),
      }),
    }),
  }),
  "passeio-quadriciclo": Object.freeze({
    "pt-BR": Object.freeze({
      title: "Expedição de Quadriciclo",
      description:
        "Aventura pelas trilhas e praias mais distantes e preservadas da ilha.",
      duration: "Aprox. 2 a 3 horas",
      transport: "Quadriciclo (ATV)",
      stops: Object.freeze({
        "stop-1": Object.freeze({
          title: "Base e Instruções",
          photoAlt:
            "Grupo de quadriciclos prontos para a expedição em Morro de São Paulo",
        }),
        "stop-2": Object.freeze({
          title: "Quarta Praia e Quinta Praia (Encanto)",
          photoAlt:
            "Quarta Praia de Morro de São Paulo com coqueirais e areia branca",
        }),
        "stop-3": Object.freeze({
          title: "Trilhas da Mata Atlântica",
          photoAlt:
            "Quadriciclos percorrendo trilhas de terra na Mata Atlântica",
        }),
        "stop-4": Object.freeze({
          title: "Mirante do Zimbo",
          photoAlt:
            "Vista panorâmica do Mirante do Zimbo com oceano e floresta",
        }),
        "stop-5": Object.freeze({
          title: "Praia de Garapuá",
          photoAlt: "Praia de Garapuá em formato de ferradura com águas calmas",
        }),
      }),
    }),
    en: Object.freeze({
      title: "ATV Expedition",
      description:
        "An adventure through some of the island's most remote and preserved trails and beaches.",
      duration: "Approx. 2 to 3 hours",
      transport: "ATV",
      stops: Object.freeze({
        "stop-1": Object.freeze({
          title: "Base and Safety Briefing",
          photoAlt:
            "Group of ATVs ready for an expedition in Morro de São Paulo",
        }),
        "stop-2": Object.freeze({
          title: "Fourth Beach and Fifth Beach (Encanto)",
          photoAlt:
            "Fourth Beach in Morro de São Paulo with palm groves and white sand",
        }),
        "stop-3": Object.freeze({
          title: "Atlantic Forest Trails",
          photoAlt:
            "ATVs traveling along dirt trails through the Atlantic Forest",
        }),
        "stop-4": Object.freeze({
          title: "Zimbo Viewpoint",
          photoAlt:
            "Panoramic view from Zimbo Viewpoint over the ocean and forest",
        }),
        "stop-5": Object.freeze({
          title: "Garapuá Beach",
          photoAlt: "Horseshoe-shaped Garapuá Beach with calm water",
        }),
      }),
    }),
    es: Object.freeze({
      title: "Expedición en Cuatriciclo",
      description:
        "Una aventura por algunos de los senderos y playas más alejados y preservados de la isla.",
      duration: "Aprox. 2 a 3 horas",
      transport: "Cuatriciclo (ATV)",
      stops: Object.freeze({
        "stop-1": Object.freeze({
          title: "Base e Instrucciones de Seguridad",
          photoAlt:
            "Grupo de cuatriciclos listos para una expedición en Morro de São Paulo",
        }),
        "stop-2": Object.freeze({
          title: "Cuarta Playa y Quinta Playa (Encanto)",
          photoAlt:
            "Cuarta Playa de Morro de São Paulo con palmeras y arena blanca",
        }),
        "stop-3": Object.freeze({
          title: "Senderos de la Mata Atlántica",
          photoAlt:
            "Cuatriciclos recorriendo senderos de tierra en la Mata Atlántica",
        }),
        "stop-4": Object.freeze({
          title: "Mirador de Zimbo",
          photoAlt:
            "Vista panorámica desde el Mirador de Zimbo sobre el océano y el bosque",
        }),
        "stop-5": Object.freeze({
          title: "Playa de Garapuá",
          photoAlt:
            "Playa de Garapuá en forma de herradura con aguas tranquilas",
        }),
      }),
    }),
  }),
});

export function normalizeTourLocale(locale?: string): TourLocale {
  const normalized = locale?.trim().toLowerCase();
  if (normalized?.startsWith("en")) return "en";
  if (normalized?.startsWith("es")) return "es";
  return "pt-BR";
}

function getLocalizedContent(
  tourId: string,
  locale: TourLocale,
): LocalizedRouteContent | undefined {
  return translations[tourId]?.[locale];
}

export function localizeMorroTour(
  tourId: string,
  localeInput?: string,
): LocalizedTourRouteContract | undefined {
  const route = getMorroTourById(tourId);
  if (!route) return undefined;

  const locale = normalizeTourLocale(localeInput);
  const content = getLocalizedContent(tourId, locale);
  if (!content) return undefined;

  const stops = route.stops.map((stop) => {
    const stopContent = content.stops[stop.id];
    if (!stopContent) {
      throw new Error(
        `Missing ${locale} content for tour ${tourId} stop ${stop.id}.`,
      );
    }

    return Object.freeze({
      ...stop,
      locale,
      title: stopContent.title,
      photoAlt: stopContent.photoAlt,
    });
  });

  return Object.freeze({
    ...route,
    locale,
    title: content.title,
    description: content.description,
    duration: content.duration,
    transport: content.transport,
    stops: Object.freeze(stops),
  });
}

export function getLocalizedMorroTourCatalog(
  localeInput?: string,
): readonly LocalizedTourRouteContract[] {
  const locale = normalizeTourLocale(localeInput);
  return Object.freeze(
    morroTourCatalog.map((tour) => {
      const localized = localizeMorroTour(tour.id, locale);
      if (!localized) {
        throw new Error(`Missing ${locale} content for tour ${tour.id}.`);
      }
      return localized;
    }),
  );
}
