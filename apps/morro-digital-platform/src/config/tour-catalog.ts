export interface TourPosition {
  readonly latitude: number;
  readonly longitude: number;
}

export interface TourStopContract {
  readonly id: string;
  readonly order: number;
  readonly titleKey: string;
  readonly title: string;
  readonly position: TourPosition;
  readonly photoPath: string;
  readonly photoAlt: string;
}

export interface TourRouteContract {
  readonly id: string;
  readonly titleKey: string;
  readonly title: string;
  readonly descriptionKey: string;
  readonly description: string;
  readonly durationKey: string;
  readonly duration: string;
  readonly transportKey: string;
  readonly transport: string;
  readonly startPoint: TourPosition;
  readonly stops: readonly TourStopContract[];
}

function assertPosition(position: TourPosition, context: string): void {
  if (
    !Number.isFinite(position.latitude) ||
    position.latitude < -90 ||
    position.latitude > 90
  ) {
    throw new Error(`${context} latitude must be between -90 and 90.`);
  }

  if (
    !Number.isFinite(position.longitude) ||
    position.longitude < -180 ||
    position.longitude > 180
  ) {
    throw new Error(`${context} longitude must be between -180 and 180.`);
  }
}

function freezePosition(position: TourPosition): TourPosition {
  return Object.freeze({ ...position });
}

function freezeStop(stop: TourStopContract): TourStopContract {
  if (!stop.id.trim()) throw new Error("Tour stop id is required.");
  if (!stop.title.trim()) throw new Error("Tour stop title is required.");
  if (!Number.isInteger(stop.order) || stop.order < 1) {
    throw new Error("Tour stop order must be a positive integer.");
  }

  assertPosition(stop.position, `Tour stop ${stop.id}`);

  return Object.freeze({
    ...stop,
    position: freezePosition(stop.position),
  });
}

export function defineTourRoute(route: TourRouteContract): TourRouteContract {
  if (!route.id.trim()) throw new Error("Tour route id is required.");
  if (!route.title.trim()) throw new Error("Tour route title is required.");
  if (route.stops.length === 0) {
    throw new Error(`Tour route ${route.id} requires at least one stop.`);
  }

  assertPosition(route.startPoint, `Tour route ${route.id}`);

  const stops = route.stops.map(freezeStop);
  const stopIds = stops.map((stop) => stop.id);
  if (new Set(stopIds).size !== stopIds.length) {
    throw new Error(`Tour route ${route.id} contains duplicate stop ids.`);
  }

  stops.forEach((stop, index) => {
    if (stop.order !== index + 1) {
      throw new Error(`Tour route ${route.id} stop order must be sequential.`);
    }
  });

  return Object.freeze({
    ...route,
    startPoint: freezePosition(route.startPoint),
    stops: Object.freeze(stops),
  });
}

const voltaAIlha = defineTourRoute({
  id: "volta-a-ilha",
  titleKey: "tour_volta_ilha_title",
  title: "Passeio Volta à Ilha",
  descriptionKey: "tour_volta_ilha_desc",
  description:
    "O passeio mais tradicional de Morro de São Paulo. Conheça as belezas da ilha de Tinharé e Boipeba.",
  durationKey: "tour_volta_ilha_duration",
  duration: "Aprox. 5 a 6 horas",
  transportKey: "tour_volta_ilha_transport",
  transport: "Lancha rápida",
  startPoint: { latitude: -13.3839443, longitude: -38.9084472 },
  stops: [
    {
      id: "stop-1",
      order: 1,
      titleKey: "tour_volta_ilha_s1_title",
      title: "Partida: Terceira Praia",
      position: { latitude: -13.3839443, longitude: -38.9084472 },
      photoPath: "./images/tours/volta_ilha_stop1_terceira_praia.jpg",
      photoAlt: "Lancha rápida na Terceira Praia de Morro de São Paulo",
    },
    {
      id: "stop-2",
      order: 2,
      titleKey: "tour_volta_ilha_s2_title",
      title: "Piscinas Naturais de Garapuá",
      position: { latitude: -13.4769538, longitude: -38.9165457 },
      photoPath: "./images/tours/volta_ilha_stop2_garapua.jpg",
      photoAlt: "Piscinas naturais de Garapuá com águas cristalinas e barcos",
    },
    {
      id: "stop-3",
      order: 3,
      titleKey: "tour_volta_ilha_s3_title",
      title: "Piscinas Naturais de Moreré",
      position: { latitude: -13.5815787, longitude: -38.9859057 },
      photoPath: "./images/tours/volta_ilha_stop3_morere.jpg",
      photoAlt: "Piscinas naturais de Moreré em Boipeba com corais coloridos",
    },
    {
      id: "stop-4",
      order: 4,
      titleKey: "tour_volta_ilha_s4_title",
      title: "Praia de Cueira (Boipeba)",
      position: { latitude: -13.585223, longitude: -38.932845 },
      photoPath: "./images/tours/volta_ilha_stop4_cueira_boipeba.jpg",
      photoAlt: "Praia da Cueira em Boipeba com barracas e coqueiros",
    },
    {
      id: "stop-5",
      order: 5,
      titleKey: "tour_volta_ilha_s5_title",
      title: "Boca da Barra e Rio do Inferno",
      position: { latitude: -13.565432, longitude: -38.924567 },
      photoPath: "./images/tours/volta_ilha_stop5_rio_inferno.jpg",
      photoAlt: "Passeio de barco pelo Rio do Inferno com manguezais",
    },
    {
      id: "stop-6",
      order: 6,
      titleKey: "tour_volta_ilha_s6_title",
      title: "Ostras em Canavieiras",
      position: { latitude: -13.542198, longitude: -38.954321 },
      photoPath: "./images/tours/volta_ilha_stop6_ostras.jpg",
      photoAlt: "Criatório de ostras em Canavieiras com degustação",
    },
    {
      id: "stop-7",
      order: 7,
      titleKey: "tour_volta_ilha_s7_title",
      title: "Cairu (Sede do Município)",
      position: { latitude: -13.471562, longitude: -39.043215 },
      photoPath: "./images/tours/volta_ilha_stop7_cairu.jpg",
      photoAlt:
        "Convento de Santo Antônio em Cairu, arquitetura barroca histórica",
    },
    {
      id: "stop-8",
      order: 8,
      titleKey: "tour_volta_ilha_s8_title",
      title: "Retorno no Pôr do Sol",
      position: { latitude: -13.376845, longitude: -38.917543 },
      photoPath: "./images/tours/volta_ilha_stop8_por_do_sol.jpg",
      photoAlt: "Lancha retornando ao pôr do sol em Morro de São Paulo",
    },
  ],
});

const trilhaGamboa = defineTourRoute({
  id: "trilha-gamboa",
  titleKey: "tour_trilha_gamboa_title",
  title: "Trilha Ecológica para a Gamboa",
  descriptionKey: "tour_trilha_gamboa_desc",
  description:
    "Uma caminhada leve e cênica que mistura praias, banho de argila e vila de pescadores.",
  durationKey: "tour_trilha_gamboa_duration",
  duration: "Aprox. 45 minutos de caminhada (só ida)",
  transportKey: "tour_trilha_gamboa_transport",
  transport: "A pé (retorno opcional de barco)",
  startPoint: { latitude: -13.376543, longitude: -38.918765 },
  stops: [
    {
      id: "stop-1",
      order: 1,
      titleKey: "tour_trilha_gamboa_s1_title",
      title: "Início: Fonte Grande",
      position: { latitude: -13.376543, longitude: -38.918765 },
      photoPath: "./images/tours/trilha_gamboa_stop1_fonte_grande.jpg",
      photoAlt:
        "Fonte Grande de Morro de São Paulo, início da trilha para Gamboa",
    },
    {
      id: "stop-2",
      order: 2,
      titleKey: "tour_trilha_gamboa_s2_title",
      title: "Praia do Porto de Cima",
      position: { latitude: -13.378912, longitude: -38.924567 },
      photoPath: "./images/tours/trilha_gamboa_stop2_porto_cima.jpg",
      photoAlt: "Praia do Porto de Cima com pedras e águas calmas",
    },
    {
      id: "stop-3",
      order: 3,
      titleKey: "tour_trilha_gamboa_s3_title",
      title: "Praia da Ponta da Pedra",
      position: { latitude: -13.382145, longitude: -38.930123 },
      photoPath: "./images/tours/trilha_gamboa_stop3_ponta_pedra.jpg",
      photoAlt:
        "Vista panorâmica da Praia da Ponta da Pedra com mata atlântica",
    },
    {
      id: "stop-4",
      order: 4,
      titleKey: "tour_trilha_gamboa_s4_title",
      title: "Paredão de Argila",
      position: { latitude: -13.388765, longitude: -38.934567 },
      photoPath: "./images/tours/trilha_gamboa_stop4_paredao_argila.jpg",
      photoAlt: "Paredão de argila rosa e amarela na trilha para Gamboa",
    },
    {
      id: "stop-5",
      order: 5,
      titleKey: "tour_trilha_gamboa_s5_title",
      title: "Praia da Gamboa do Morro",
      position: { latitude: -13.3933118, longitude: -38.9367387 },
      photoPath: "./images/tours/trilha_gamboa_stop5_gamboa.jpg",
      photoAlt: "Praia da Gamboa com barracas de pescadores e águas calmas",
    },
  ],
});

const passeioQuadriciclo = defineTourRoute({
  id: "passeio-quadriciclo",
  titleKey: "tour_quadriciclo_title",
  title: "Expedição de Quadriciclo",
  descriptionKey: "tour_quadriciclo_desc",
  description:
    "Aventura pelas trilhas e praias mais distantes e preservadas da ilha.",
  durationKey: "tour_quadriciclo_duration",
  duration: "Aprox. 2 a 3 horas",
  transportKey: "tour_quadriciclo_transport",
  transport: "Quadriciclo (ATV)",
  startPoint: { latitude: -13.3872014, longitude: -38.9052792 },
  stops: [
    {
      id: "stop-1",
      order: 1,
      titleKey: "tour_quadriciclo_s1_title",
      title: "Base e Instruções",
      position: { latitude: -13.3872014, longitude: -38.9052792 },
      photoPath: "./images/tours/quadriciclo_stop1_base.jpg",
      photoAlt:
        "Grupo de quadriciclos prontos para a expedição em Morro de São Paulo",
    },
    {
      id: "stop-2",
      order: 2,
      titleKey: "tour_quadriciclo_s2_title",
      title: "Quarta Praia e Quinta Praia (Encanto)",
      position: { latitude: -13.401234, longitude: -38.901234 },
      photoPath: "./images/tours/quadriciclo_stop2_quarta_quinta_praia.jpg",
      photoAlt:
        "Quarta Praia de Morro de São Paulo com coqueirais e areia branca",
    },
    {
      id: "stop-3",
      order: 3,
      titleKey: "tour_quadriciclo_s3_title",
      title: "Trilhas da Mata Atlântica",
      position: { latitude: -13.425678, longitude: -38.910123 },
      photoPath: "./images/tours/quadriciclo_stop3_mata_atlantica.jpg",
      photoAlt: "Quadriciclos percorrendo trilhas de terra na Mata Atlântica",
    },
    {
      id: "stop-4",
      order: 4,
      titleKey: "tour_quadriciclo_s4_title",
      title: "Mirante do Zimbo",
      position: { latitude: -13.418765, longitude: -38.915432 },
      photoPath: "./images/tours/quadriciclo_stop4_mirante_zimbo.jpg",
      photoAlt: "Vista panorâmica do Mirante do Zimbo com oceano e floresta",
    },
    {
      id: "stop-5",
      order: 5,
      titleKey: "tour_quadriciclo_s5_title",
      title: "Praia de Garapuá",
      position: { latitude: -13.4769538, longitude: -38.9165457 },
      photoPath: "./images/tours/quadriciclo_stop5_garapua.jpg",
      photoAlt: "Praia de Garapuá em formato de ferradura com águas calmas",
    },
  ],
});

export const morroTourCatalog: readonly TourRouteContract[] = Object.freeze([
  voltaAIlha,
  trilhaGamboa,
  passeioQuadriciclo,
]);

export function getMorroTourById(
  tourId: string,
): TourRouteContract | undefined {
  return morroTourCatalog.find((tour) => tour.id === tourId);
}
