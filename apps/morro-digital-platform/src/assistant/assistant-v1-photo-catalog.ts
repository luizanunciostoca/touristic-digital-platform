const V1_PHOTO_BASE_PATH = "/images/fotos/";

const V1_PHOTO_ENTRIES = [
  ["Farol do Morro", "farol_do_morro"],
  ["Toca do Morcego", "toca_do_morcego"],
  ["Mirante da Tirolesa", "mirante_da_tirolesa"],
  ["Fortaleza de Morro de São Paulo", "fortaleza_de_morro"],
  ["Paredão da Argila", "paredao_da_argila"],
  ["Passeio de lancha Volta a Ilha de Tinharé", "passeio_lancha_ilha_tinhare"],
  ["Passeio de Quadriciclo para Garapuá", "passeio_quadriciclo_garapua"],
  ["Passeio 4X4 para Garapuá", "passeio_4x4_garapua"],
  ["Passeio de Barco para Gamboa", "passeio_barco_gamboa"],
  ["Primeira Praia", "primeira_praia"],
  ["Segunda Praia", "segunda_praia"],
  ["Terceira Praia", "terceira_praia"],
  ["Quarta Praia", "quarta_praia"],
  ["Praia do Encanto", "praia_do_encanto"],
  ["Praia do Pôrto", "praia_do_porto"],
  ["Praia da Gamboa", "praia_da_gamboa"],
  ["Toca do Morcego Festas", "toca_do_morcego_festas"],
  ["One Love", "one_love"],
  ["Pulsar", "pulsar"],
  ["Mama Iate", "mama_iate"],
  ["Teatro do Morro", "teatro_do_morro"],
  ["Morena Bela", "morena_bela"],
  ["Basílico", "basilico"],
  ["Ki Massa", "ki_massa"],
  ["Tempeiro Caseiro", "tempeiro_caseiro"],
  ["Bizu", "bizu"],
  ["Pedra Sobre Pedra", "pedra_sobre_pedra"],
  ["Forno a Lenha de Mercedes", "forno_a_lenha"],
  ["Ponto G", "ponto_g"],
  ["Ponto 9,99", "ponto_999"],
  ["Patricia", "patricia"],
  ["dizi 10", "dizi_10"],
  ["Papoula", "papoula"],
  ["Sabor da terra", "sabor_da_terra"],
  ["Branco&Negro", "branco_negro"],
  ["Six Club", "six_club"],
  ["Santa Villa", "santa_villa"],
  ["Recanto do Aviador", "recanto_do_aviador"],
  ["Sambass", "sambass"],
  ["Bar e Restaurante da Morena", "bar_restaurante_morena"],
  ["Restaurante Alecrim", "restaurante_alecrim"],
  ["Andina Cozinha Latina", "andina_cozinha_latina"],
  ["Papoula Culinária Artesanal", "papoula_culinaria_artesanal"],
  ["Minha Louca Paixão", "minha_louca_paixao"],
  ["Café das Artes", "cafe_das_artes"],
  ["Canoa", "canoa"],
  ["Restaurante do Francisco", "restaurante_francisco"],
  ["La Tabla", "la_tabla"],
  ["Santa Luzia", "santa_luzia"],
  ["Chez Max", "chez_max"],
  ["Barraca da Miriam", "barraca_miriam"],
  ["O Casarão restaurante", "casarao_restaurante"],
  ["Hotel Fazenda Parque Vila", "hotel_fazenda_parque_vila"],
  ["Guaiamu", "guaiamu"],
  ["Pousada Fazenda Caeiras", "pousada_fazenda_caeiras"],
  ["Amendoeira Hotel", "amendoeira_hotel"],
  ["Pousada Natureza", "pousada_natureza"],
  ["Pousada dos Pássaros", "pousada_dos_passaros"],
  ["Hotel Morro de São Paulo", "hotel_morro_sao_paulo"],
  ["Uma Janela para o Sol", "uma_janela_para_sol"],
  ["Portaló", "portalo"],
  ["Pérola do Morro", "perola_do_morro"],
  ["Safira do Morro", "safira_do_morro"],
  ["Xerife Hotel", "xerife_hotel"],
  ["Ilha da Saudade", "ilha_da_saudade"],
  ["Porto dos Milagres", "porto_dos_milagres"],
  ["Passarte", "passarte"],
  ["Pousada da Praça", "pousada_da_praca"],
  ["Pousada Colibri", "pousada_colibri"],
  ["Pousada Porto de Cima", "pousada_porto_de_cima"],
  ["Vila Guaiamu", "vila_guaiamu"],
  ["Villa dos Corais pousada", "villa_dos_corais"],
  ["Hotel Anima", "hotel_anima"],
  ["Vila dos Orixás Boutique Hotel & Spa", "vila_dos_orixas"],
  ["Hotel Karapitangui", "hotel_karapitangui"],
  ["Pousada Timbalada", "pousada_timbalada"],
  ["Casa Celestino Residence", "casa_celestino_residence"],
  ["Bahia Bacana Pousada", "bahia_bacana_pousada"],
  ["Hotel Morro da Saudade", "hotel_morro_da_saudade"],
  ["Bangalô dos sonhos", "bangalo_dos_sonhos"],
  ["Cantinho da Josete", "cantinho_da_josete"],
  ["Vila Morro do Sao Paulo", "vila_morro_sao_paulo"],
  ["Casa Rossa", "casa_rossa"],
  ["Village Paraíso Tropical", "village_paraiso_tropical"],
  ["Absolute", "absolute"],
  ["Local Brasil", "local_brasil"],
  ["Super Zimbo", "super_zimbo"],
  ["Mateus Esquadrais", "mateus_esquadrais"],
  ["São Pedro Imobiliária", "sao_pedro_imobiliaria"],
  ["Imóveis Brasil Bahia", "imoveis_brasil_bahia"],
  ["Coruja", "coruja"],
  ["Zimbo Dive", "zimbo_dive"],
  ["Havaianas", "havaianas"],
  ["Ambulância", "ambulancia"],
  ["Unidade de Saúde", "unidade_de_saude"],
  ["Polícia Civil", "policia_civil"],
  ["Polícia Militar", "policia_militar"],
  ["Melhores Pontos Turísticos", "melhores_pontos_turisticos"],
  ["Melhores Passeios", "melhores_passeios"],
  ["Melhores Praias", "melhores_praias"],
  ["Melhores Restaurantes", "melhores_restaurantes"],
  ["Melhores Pousadas", "melhores_pousadas"],
  ["Melhores Lojas", "melhores_lojas"],
  ["Missão", "missao"],
  ["Serviços", "servicos"],
  ["Benefícios para Turistas", "beneficios_turistas"],
  ["Benefícios para Moradores", "beneficios_moradores"],
  ["Benefícios para Pousadas", "beneficios_pousadas"],
  ["Benefícios para Restaurantes", "beneficios_restaurantes"],
  ["Benefícios para Agências de Turismo", "beneficios_agencias_turismo"],
  ["Benefícios para Lojas e Comércios", "beneficios_lojas_comercios"],
  ["Benefícios para Transportes", "beneficios_transportes"],
  ["Impacto em MSP", "impacto_msp"],
  ["Iniciar Tutorial", "iniciar_tutorial"],
  ["Planejar Viagem com IA", "planejar_viagem_ia"],
  ["Falar com IA", "falar_com_ia"],
  ["Falar com Suporte", "falar_com_suporte"],
  ["Configurações", "configuracoes"],
] as const satisfies readonly (readonly [name: string, stem: string])[];

const V1_PHOTO_ALIASES: Readonly<Record<string, string>> = {
  toca: "Toca do Morcego",
  farol: "Farol do Morro",
  mirante: "Mirante da Tirolesa",
  fortaleza: "Fortaleza de Morro de São Paulo",
  paredao: "Paredão da Argila",
  primeira: "Primeira Praia",
  segunda: "Segunda Praia",
  terceira: "Terceira Praia",
  quarta: "Quarta Praia",
  encanto: "Praia do Encanto",
  porto: "Praia do Pôrto",
  gamboa: "Praia da Gamboa",
};

function normalizePhotoPlaceName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const NORMALIZED_PHOTO_CATALOG = V1_PHOTO_ENTRIES.map(([name, stem]) => ({
  name,
  normalized: normalizePhotoPlaceName(name),
  images: [1, 2, 3].map((index) => `${V1_PHOTO_BASE_PATH}${stem}${index}.jpg`),
}));

export interface AssistantPhotoSet {
  readonly place: string;
  readonly images: readonly string[];
}

export function resolveAssistantV1Photos(
  place: string,
): AssistantPhotoSet | null {
  const normalized = normalizePhotoPlaceName(place);
  if (!normalized) return null;

  let match = NORMALIZED_PHOTO_CATALOG.find(
    (entry) => entry.normalized === normalized,
  );
  match ??= NORMALIZED_PHOTO_CATALOG.find(
    (entry) =>
      entry.normalized.includes(normalized) ||
      normalized.includes(entry.normalized),
  );

  if (!match) {
    const alias = V1_PHOTO_ALIASES[normalized];
    if (alias) {
      match = NORMALIZED_PHOTO_CATALOG.find((entry) => entry.name === alias);
    }
  }

  match ??= NORMALIZED_PHOTO_CATALOG.find(
    (entry) =>
      entry.normalized.startsWith(normalized) ||
      normalized.startsWith(entry.normalized),
  );

  if (!match) {
    for (const word of normalized.split(" ")) {
      if (word.length < 3) continue;
      match = NORMALIZED_PHOTO_CATALOG.find((entry) =>
        entry.normalized.includes(word),
      );
      if (match) break;
    }
  }

  if (!match) return null;
  return { place: match.name, images: [...match.images] };
}

export const ASSISTANT_V1_PHOTO_ENTRY_COUNT = V1_PHOTO_ENTRIES.length;
