export interface TourStopEditorialSource {
  readonly descriptionKey: string;
  readonly description: string;
  readonly narrationKey: string;
  readonly narration: string;
  readonly tipKeys: readonly string[];
  readonly tips: readonly string[];
}

export interface TourRouteEditorialSource {
  readonly stops: Readonly<Record<string, TourStopEditorialSource>>;
}

function freezeStop(
  stop: TourStopEditorialSource,
): TourStopEditorialSource {
  if (stop.tipKeys.length !== stop.tips.length) {
    throw new Error("Tour stop tip keys and fallback tips must have the same length.");
  }

  return Object.freeze({
    ...stop,
    tipKeys: Object.freeze([...stop.tipKeys]),
    tips: Object.freeze([...stop.tips]),
  });
}

function freezeRoute(
  stops: Record<string, TourStopEditorialSource>,
): TourRouteEditorialSource {
  return Object.freeze({
    stops: Object.freeze(
      Object.fromEntries(
        Object.entries(stops).map(([id, stop]) => [id, freezeStop(stop)]),
      ),
    ),
  });
}

/**
 * Frozen editorial fallback copied from V1 `js/tours/tour-data.js` at
 * 60746fd7fed97b805758b37adfdbe3bad2582bfe.
 *
 * Geometry, media and photoAlt intentionally remain owned by tour-catalog.ts.
 */
export const v1TourEditorialSource: Readonly<
  Record<string, TourRouteEditorialSource>
> = Object.freeze({
  "volta-a-ilha": freezeRoute({
    "stop-1": {
      descriptionKey: "tour_volta_ilha_s1_desc",
      description:
        "O embarque é feito na Terceira Praia. Acomode-se na lancha e prepare-se para um dia incrível pelas águas cristalinas do arquipélago.",
      narrationKey: "tour_volta_ilha_s1_narration",
      narration:
        "Bem-vindo ao Passeio Volta à Ilha! O embarque é feito aqui na Terceira Praia. Acomode-se na lancha e prepare-se para um dia incrível pelas águas cristalinas do arquipélago de Tinharé e Boipeba.",
      tipKeys: ["tour_volta_ilha_s1_tip1", "tour_volta_ilha_s1_tip2"],
      tips: [
        "Leve protetor solar, óculos de sol e chapéu.",
        "Não esqueça a câmera ou celular com bateria cheia!",
      ],
    },
    "stop-2": {
      descriptionKey: "tour_volta_ilha_s2_desc",
      description:
        "A primeira parada é nas piscinas naturais de Garapuá. Aqui o mar forma um aquário natural de águas rasas e cristalinas, perfeito para um mergulho refrescante com os peixinhos.",
      narrationKey: "tour_volta_ilha_s2_narration",
      narration:
        "Chegamos às Piscinas Naturais de Garapuá! O mar forma aqui um verdadeiro aquário natural, com águas rasas e cristalinas. Você pode mergulhar e nadar entre os peixinhos coloridos. É um dos pontos mais bonitos de todo o arquipélago!",
      tipKeys: ["tour_volta_ilha_s2_tip1", "tour_volta_ilha_s2_tip2"],
      tips: [
        "Se tiver snorkel, essa é a hora de usar!",
        "Aproveite os bares flutuantes que costumam ficar na região.",
      ],
    },
    "stop-3": {
      descriptionKey: "tour_volta_ilha_s3_desc",
      description:
        "Seguindo para a ilha vizinha de Boipeba, paramos nas famosas piscinas de Moreré. O cenário é paradisíaco, com corais coloridos e muita vida marinha.",
      narrationKey: "tour_volta_ilha_s3_narration",
      narration:
        "Chegamos a Moreré, na ilha de Boipeba! Este é um dos lugares mais paradisíacos do Brasil. As piscinas naturais são formadas por recifes de coral, com águas de um azul e verde impressionantes. Prepare-se para um mergulho inesquecível!",
      tipKeys: ["tour_volta_ilha_s3_tip1"],
      tips: ["Cuidado para não pisar nos corais, eles são frágeis e vivos."],
    },
    "stop-4": {
      descriptionKey: "tour_volta_ilha_s4_desc",
      description:
        "Parada para almoço na Praia da Cueira, em Boipeba. O local é famoso pelas barracas que servem lagosta fresca preparada na manteiga ou no abacaxi.",
      narrationKey: "tour_volta_ilha_s4_narration",
      narration:
        "Hora do almoço na Praia da Cueira, em Boipeba! Este lugar é famoso pela lagosta fresca, preparada na manteiga ou no abacaxi. As barracas à beira-mar oferecem um ambiente perfeito para relaxar e saborear os frutos do mar locais.",
      tipKeys: ["tour_volta_ilha_s4_tip1"],
      tips: [
        "Experimente a famosa lagosta do Guido, é um prato clássico da região!",
      ],
    },
    "stop-5": {
      descriptionKey: "tour_volta_ilha_s5_desc",
      description:
        "A lancha entra no Rio do Inferno, que separa a ilha de Tinharé da ilha de Boipeba. O visual muda do mar aberto para os tranquilos manguezais.",
      narrationKey: "tour_volta_ilha_s5_narration",
      narration:
        "Agora entramos no Rio do Inferno, que separa as ilhas de Tinharé e Boipeba. O cenário muda completamente: do mar aberto para os tranquilos manguezais. Fique atento à rica fauna local, com garças, caranguejos e muito mais!",
      tipKeys: ["tour_volta_ilha_s5_tip1"],
      tips: ["Observe a rica fauna e flora do manguezal."],
    },
    "stop-6": {
      descriptionKey: "tour_volta_ilha_s6_desc",
      description:
        "Parada nos criatórios de ostras no povoado de Canavieiras. Você pode degustar ostras frescas tiradas na hora, gratinadas ou cruas com limão.",
      narrationKey: "tour_volta_ilha_s6_narration",
      narration:
        "Chegamos a Canavieiras, famosa pelos criatórios de ostras! Aqui você pode degustar ostras frescas, tiradas na hora, servidas cruas com limão ou gratinadas. Uma experiência gastronômica única que não pode ser perdida!",
      tipKeys: ["tour_volta_ilha_s6_tip1"],
      tips: ["Acompanhe as ostras com uma caipirinha local."],
    },
    "stop-7": {
      descriptionKey: "tour_volta_ilha_s7_desc",
      description:
        "Uma parada histórica na cidade de Cairu, a segunda vila mais antiga do Brasil. É possível visitar o Convento de Santo Antônio, uma joia da arquitetura barroca.",
      narrationKey: "tour_volta_ilha_s7_narration",
      narration:
        "Bem-vindos a Cairu, a segunda vila mais antiga do Brasil! Aqui fica o Convento de Santo Antônio, uma joia da arquitetura barroca colonial. O convento possui azulejos portugueses raros do século dezoito e uma história fascinante. Vale cada minuto!",
      tipKeys: ["tour_volta_ilha_s7_tip1"],
      tips: ["O convento possui azulejos portugueses raros e muita história."],
    },
    "stop-8": {
      descriptionKey: "tour_volta_ilha_s8_desc",
      description:
        "A viagem de volta contorna a ilha pelo rio, passando próximo à Fortaleza do Tapirandu, chegando ao cais no momento mágico do pôr do sol.",
      narrationKey: "tour_volta_ilha_s8_narration",
      narration:
        "E chegamos ao fim desta incrível jornada! A viagem de volta contorna a ilha pelo rio, passando próximo à Fortaleza do Tapirandu. Prepare sua câmera para o pôr do sol mais bonito que você já viu. Que passeio incrível foi esse!",
      tipKeys: ["tour_volta_ilha_s8_tip1"],
      tips: ["Prepare-se para tirar as melhores fotos do final do dia."],
    },
  }),
  "trilha-gamboa": freezeRoute({
    "stop-1": {
      descriptionKey: "tour_trilha_gamboa_s1_desc",
      description:
        "O caminho começa próximo à Fonte Grande, no centrinho da vila. Siga as placas em direção à Praia do Porto de Cima.",
      narrationKey: "tour_trilha_gamboa_s1_narration",
      narration:
        "Vamos começar a Trilha Ecológica para a Gamboa! O ponto de partida é aqui na Fonte Grande, no coração da vila de Morro de São Paulo. Esta trilha é uma das mais bonitas da ilha, combinando praias, mata atlântica e cultura local. Lembre-se: só é possível fazer a trilha na maré baixa!",
      tipKeys: [
        "tour_trilha_gamboa_s1_tip1",
        "tour_trilha_gamboa_s1_tip2",
      ],
      tips: [
        "Leve água, vá de chinelo ou descalço (boa parte é na areia).",
        "Importante: Verifique a tábua de marés! Só é possível fazer a trilha na maré baixa.",
      ],
    },
    "stop-2": {
      descriptionKey: "tour_trilha_gamboa_s2_desc",
      description:
        "A primeira praia do trajeto. Uma praia pequena, de águas calmas e com muitas pedras que aparecem na maré baixa.",
      narrationKey: "tour_trilha_gamboa_s2_narration",
      narration:
        "Chegamos à Praia do Porto de Cima! Esta praia pequena e tranquila tem águas muito calmas, perfeitas para uma pausa rápida. Na maré baixa, as pedras formam piscinas naturais. Cuidado ao caminhar pelas pedras, que podem ser escorregadias!",
      tipKeys: ["tour_trilha_gamboa_s2_tip1"],
      tips: ["Cuidado ao caminhar pelas pedras escorregadias."],
    },
    "stop-3": {
      descriptionKey: "tour_trilha_gamboa_s3_desc",
      description:
        "Continuando pela costa, você passa pela Ponta da Pedra. O visual do mar aberto à direita e a mata atlântica à esquerda é deslumbrante.",
      narrationKey: "tour_trilha_gamboa_s3_narration",
      narration:
        "Que vista incrível! Aqui na Ponta da Pedra, temos o mar aberto à direita e a exuberante Mata Atlântica à esquerda. Este é um dos pontos mais fotogênicos de toda a trilha. Pare um momento para apreciar e registrar esta paisagem deslumbrante!",
      tipKeys: ["tour_trilha_gamboa_s3_tip1"],
      tips: ["Excelente ponto para fotos panorâmicas."],
    },
    "stop-4": {
      descriptionKey: "tour_trilha_gamboa_s4_desc",
      description:
        "A atração principal do caminho! Uma encosta natural de argila rosa e amarela. A tradição é passar a argila no corpo inteiro, que dizem ter propriedades rejuvenescedoras.",
      narrationKey: "tour_trilha_gamboa_s4_narration",
      narration:
        "Chegamos ao Paredão de Argila, a grande atração da trilha! Esta encosta natural de argila rosa e amarela é simplesmente deslumbrante. A tradição local é passar a argila no corpo inteiro! Dizem que ela tem propriedades rejuvenescedoras para a pele. Experimente você também!",
      tipKeys: [
        "tour_trilha_gamboa_s4_tip1",
        "tour_trilha_gamboa_s4_tip2",
      ],
      tips: [
        "Passe a argila, espere secar ao sol e depois mergulhe no mar para tirar.",
        "A pele fica super macia!",
      ],
    },
    "stop-5": {
      descriptionKey: "tour_trilha_gamboa_s5_desc",
      description:
        "Chegada à vila da Gamboa! Uma praia de águas muito calmas, excelente infraestrutura de barracas e clima de vila de pescadores, mais tranquilo que Morro.",
      narrationKey: "tour_trilha_gamboa_s5_narration",
      narration:
        "Parabéns, chegamos à Gamboa! Esta vila de pescadores tem um charme todo especial, com praias de águas muito calmas e barracas deliciosas à beira-mar. O ritmo aqui é mais tranquilo que Morro de São Paulo. Aproveite para almoçar uma moqueca e relaxar. Para voltar, você pode pegar um barco no píer direto para o cais de Morro!",
      tipKeys: [
        "tour_trilha_gamboa_s5_tip1",
        "tour_trilha_gamboa_s5_tip2",
      ],
      tips: [
        "Aproveite para almoçar uma moqueca nas barracas da praia.",
        "Para voltar, você pode pegar um barco no píer da Gamboa direto para o cais de Morro.",
      ],
    },
  }),
  "passeio-quadriciclo": freezeRoute({
    "stop-1": {
      descriptionKey: "tour_quadriciclo_s1_desc",
      description:
        "O passeio começa no final da Terceira Praia ou início da Quarta Praia. Você recebe as instruções de segurança e aprende a pilotar o quadriciclo.",
      narrationKey: "tour_quadriciclo_s1_narration",
      narration:
        "Bem-vindo à Expedição de Quadriciclo! Aqui na base, você vai receber todas as instruções de segurança e aprender a pilotar o quadriciclo. Lembre-se: é necessário ter CNH categoria B e o uso de capacete é obrigatório. Prepare-se para uma aventura incrível pelas praias e trilhas mais selvagens da ilha!",
      tipKeys: [
        "tour_quadriciclo_s1_tip1",
        "tour_quadriciclo_s1_tip2",
      ],
      tips: [
        "É necessário ter CNH categoria B para pilotar.",
        "Uso de capacete é obrigatório.",
      ],
    },
    "stop-2": {
      descriptionKey: "tour_quadriciclo_s2_desc",
      description:
        "O trajeto segue pelas imensas faixas de areia da Quarta e Quinta praias, passando por coqueirais e áreas de preservação.",
      narrationKey: "tour_quadriciclo_s2_narration",
      narration:
        "Que sensação incrível! Estamos percorrendo as imensas faixas de areia da Quarta e Quinta Praias. Estas são as praias mais longas e preservadas de Morro de São Paulo, com coqueirais exuberantes e águas cristalinas. Aproveite a liberdade, mas respeite os banhistas e os limites de velocidade!",
      tipKeys: ["tour_quadriciclo_s2_tip1"],
      tips: [
        "Aproveite a sensação de liberdade, mas respeite os limites de velocidade e os banhistas.",
      ],
    },
    "stop-3": {
      descriptionKey: "tour_quadriciclo_s3_desc",
      description:
        "A rota entra para o interior da ilha, passando por estradas de terra batida, trechos de mata atlântica fechada e pequenos riachos.",
      narrationKey: "tour_quadriciclo_s3_narration",
      narration:
        "Agora a aventura fica mais intensa! Entramos no interior da ilha, com estradas de terra batida, trechos de Mata Atlântica fechada e pequenos riachos para atravessar. Prepare-se para um pouco de lama e poeira! Este é o trecho mais emocionante de toda a expedição!",
      tipKeys: ["tour_quadriciclo_s3_tip1"],
      tips: ["Prepare-se para um pouco de lama e poeira!"],
    },
    "stop-4": {
      descriptionKey: "tour_quadriciclo_s4_desc",
      description:
        "Parada em um ponto alto no povoado do Zimbo para apreciar a vista panorâmica do oceano e da floresta.",
      narrationKey: "tour_quadriciclo_s4_narration",
      narration:
        "Chegamos ao Mirante do Zimbo! Daqui de cima, temos uma vista panorâmica deslumbrante: o oceano Atlântico de um lado e a Mata Atlântica de outro. Este é o momento perfeito para tirar as melhores fotos do grupo e guardar para sempre esta memória incrível!",
      tipKeys: ["tour_quadriciclo_s4_tip1"],
      tips: ["Ótimo momento para fotos do grupo."],
    },
    "stop-5": {
      descriptionKey: "tour_quadriciclo_s5_desc",
      description:
        "O destino final do passeio! Uma praia em formato de ferradura, de águas calmas e areia branca.",
      narrationKey: "tour_quadriciclo_s5_narration",
      narration:
        "Chegamos ao destino final: a Praia de Garapuá! Esta praia em formato de ferradura tem águas calmas e areia branca. É o lugar perfeito para dar um mergulho refrescante antes de iniciar o trajeto de volta. Parabéns por completar a Expedição de Quadriciclo!",
      tipKeys: ["tour_quadriciclo_s5_tip1"],
      tips: [
        "Aproveite para dar um mergulho refrescante antes de iniciar o trajeto de volta.",
      ],
    },
  }),
});
