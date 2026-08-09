export type AssistantIntent =
  | "navigate"
  | "cancel_navigation"
  | "open_now"
  | "weather"
  | "my_location"
  | "photos"
  | "price"
  | "hours"
  | "more_info"
  | "nearby"
  | "favorites"
  | "help"
  | "confirm"
  | "deny"
  | "greeting"
  | "thanks"
  | "category_beaches"
  | "category_restaurants"
  | "category_hotels"
  | "category_shops"
  | "category_attractions"
  | "category_nightlife"
  | "category_tours"
  | "category_emergencies"
  | "category_filtered"
  | "show_all"
  | "show_map"
  | "select_option"
  | "place_search"
  | "cultural_history"
  | "practical_tips"
  | "transport"
  | "accessibility"
  | "unknown";

export interface AssistantIntentEntities {
  place?: string;
  searchQuery?: string;
  area?: string;
  mealType?: string;
  priceQualifier?: string;
  distanceQualifier?: string;
  timeQualifier?: string;
  groupSize?: number;
  category?: string;
  language?: "pt" | "en" | "es" | "he";
  urgency?: "high";
}

export interface AssistantIntentContext {
  lastIntent?: string | null;
  lastPlace?: string | null;
  lastCategory?: string | null;
  awaiting?: {
    type?: string | null;
  } | null;
}

export interface AssistantIntentResult {
  intent: AssistantIntent;
  confidence: number;
  entities: AssistantIntentEntities;
  normalized: string;
  modifiers: string[];
  requiresLLM?: boolean;
  contextual?: boolean;
  filter?: string;
  optionIndex?: number;
  matchedSynonym?: string;
}

const ACCENTS_MAP: Record<string, string> = {
  á: "a",
  à: "a",
  ã: "a",
  â: "a",
  ä: "a",
  é: "e",
  è: "e",
  ê: "e",
  ë: "e",
  í: "i",
  ì: "i",
  î: "i",
  ï: "i",
  ó: "o",
  ò: "o",
  õ: "o",
  ô: "o",
  ö: "o",
  ú: "u",
  ù: "u",
  û: "u",
  ü: "u",
  ç: "c",
  ñ: "n",
};

export const LLM_FALLBACK_CONFIDENCE = 0.5;
export const LONG_INPUT_THRESHOLD_CHARS = 90;

export function normalizeAssistantText(text: string): string {
  if (!text) return "";

  return text
    .toLowerCase()
    .replace(
      /[áàãâäéèêëíìîïóòõôöúùûüçñ]/g,
      (character) => ACCENTS_MAP[character] ?? character,
    )
    .replace(/[^\w\s\u0590-\u05FF\u0600-\u06FF]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const SYNONYMS = {
  praia: [
    "praia",
    "beach",
    "playa",
    "playas",
    "mar",
    "litoral",
    "orla",
    "costa",
    "areia",
    "banho",
    "nadar",
    "mergulhar",
    "surf",
    "onda",
    "חופים",
    "חוף",
  ],
  restaurante: [
    "restaurante",
    "restaurants",
    "restaurant",
    "comida",
    "comer",
    "food",
    "eat",
    "almoco",
    "jantar",
    "lanche",
    "cafe",
    "gastronomia",
    "culinaria",
    "prato",
    "refeicao",
    "fome",
    "onde comer",
    "lugar para comer",
    "מסעדות",
    "מסעדה",
  ],
  pousada: [
    "pousada",
    "hotel",
    "hoteles",
    "hostel",
    "hospedagem",
    "dormir",
    "ficar",
    "acomodacao",
    "quarto",
    "suite",
    "inn",
    "stay",
    "accommodation",
    "lodging",
    "alojamento",
    "מלונות",
    "לינה",
  ],
  loja: [
    "loja",
    "compras",
    "shopping",
    "store",
    "shop",
    "mercado",
    "souvenir",
    "artesanato",
    "roupa",
    "farmacia",
    "comprar",
    "presente",
    "lembranca",
    "tiendas",
    "tienda",
    "חנויות",
    "חנות",
  ],
  atracao: [
    "atracao",
    "atracoes",
    "attractions",
    "turismo",
    "ponto turistico",
    "visitar",
    "conhecer",
    "monumento",
    "historico",
    "cultural",
    "museu",
    "forte",
    "farol",
    "mirante",
    "tirolesa",
    "sightseeing",
    "atracciones",
    "atraccion",
    "אטרקציות",
    "אטרקציה",
  ],
  noturno: [
    "balada",
    "noite",
    "noitada",
    "nightlife",
    "club",
    "festa",
    "bar",
    "pub",
    "luau",
    "show",
    "musica",
    "danca",
    "beber",
    "drink",
    "cerveja",
    "coqueteis",
    "vida nocturna",
    "discoteca",
    "חיי לילה",
  ],
  passeio: [
    "passeio",
    "tour",
    "excursao",
    "barco",
    "trilha",
    "hiking",
    "caiaque",
    "quadriciclo",
    "aventura",
    "snorkel",
    "mergulho",
    "observacao",
    "fauna",
    "natureza",
    "paseo",
    "paseos",
    "סיורים",
    "סיור",
  ],
  emergencia: [
    "emergencia",
    "emergencias",
    "emergencies",
    "socorro",
    "hospital",
    "medico",
    "policia",
    "bombeiro",
    "ambulancia",
    "farmacia",
    "saude",
    "urgencia",
    "emergency",
    "חירום",
    "מקרי חירום",
  ],
  navegar: [
    "navegar",
    "rota",
    "caminho",
    "como chegar",
    "ir para",
    "me leve",
    "directions",
    "route",
    "navigate",
    "chegar",
    "ir ate",
    "levar",
  ],
  clima: [
    "clima",
    "tempo",
    "previsao",
    "chuva",
    "sol",
    "temperatura",
    "weather",
    "forecast",
    "vento",
    "mare",
    "tide",
  ],
  localizacao: [
    "onde estou",
    "minha localizacao",
    "me encontre",
    "where am i",
    "location",
    "gps",
    "posicao",
  ],
  preco: [
    "quanto custa",
    "preco",
    "valor",
    "custo",
    "price",
    "cost",
    "how much",
    "barato",
    "caro",
    "gratis",
    "free",
  ],
  horario: [
    "horario",
    "abre",
    "fecha",
    "funcionamento",
    "quando abre",
    "hours",
    "open",
    "close",
    "schedule",
  ],
  fotos: [
    "foto",
    "fotos",
    "imagem",
    "imagens",
    "ver fotos",
    "photo",
    "photos",
    "picture",
    "galeria",
  ],
  ajuda: [
    "ajuda",
    "help",
    "como usar",
    "o que voce faz",
    "comandos",
    "tutorial",
    "instrucoes",
    "guia",
  ],
} as const;

const INTENT_PATTERNS: ReadonlyArray<{
  intent: AssistantIntent;
  confidence: number;
  patterns: readonly RegExp[];
}> = [
  {
    intent: "navigate",
    confidence: 1,
    patterns: [
      /^(como chego|como chegar|como vou|como ir|quero ir|me leve|leve-me|me leva|navegar ate|navegar até|ir ate|ir até|rota para|criar rota|tracar rota|route to|directions to|take me to|navigate to|llévame a|como llego)/i,
    ],
  },
  {
    intent: "navigate",
    confidence: 0.9,
    patterns: [
      /^[A-ZÁÀÃÂÉÈÊÍÌÎÓÒÕÔÚÙÛÇ].{3,40}[,\s]+(como chego|como ir|como chegar|rota|navegar|directions|how to get)/i,
    ],
  },
  {
    intent: "navigate",
    confidence: 0.85,
    patterns: [
      /(quero (ir|chegar|visitar)|preciso (ir|chegar)|como (chego|chegar|ir)|me (leve|leva|leva até)|vai até|vou até)/i,
    ],
  },
  {
    intent: "cancel_navigation",
    confidence: 1,
    patterns: [
      /^(parar|cancelar|stop|cancel|encerrar|finalizar|sair da rota|sair da navegacao|parar navegacao|cancelar navegacao)$/i,
    ],
  },
  {
    intent: "open_now",
    confidence: 1,
    patterns: [
      /(aberto agora|aberto hoje|open now|está aberto|ta aberto|funcionando agora|abierto ahora|פתוח עכשיו|está funcionando|tá funcionando)/i,
    ],
  },
  {
    intent: "weather",
    confidence: 1,
    patterns: [
      /(clima|tempo|previsao|previsão|temperatura|chuva|vai chover|vai fazer sol|weather|forecast|como esta o tempo|como está o tempo|mare|maré|tide)/i,
    ],
  },
  {
    intent: "my_location",
    confidence: 1,
    patterns: [
      /(onde estou|minha localizacao|minha localização|me encontre|where am i|find me|my location|minha posicao|minha posição)/i,
    ],
  },
  {
    intent: "photos",
    confidence: 1,
    patterns: [
      /^(ver fotos|fotos|photos|galeria|imagens|mostrar fotos|show photos|📸)$/i,
      /(ver fotos de|fotos de|photos of|imagens de)/i,
    ],
  },
  {
    intent: "price",
    confidence: 1,
    patterns: [
      /(quanto custa|qual o preco|qual o preço|qual o valor|how much|price|cost|entrada|ingresso|taxa|gratis|gratuito|free)/i,
    ],
  },
  {
    intent: "hours",
    confidence: 1,
    patterns: [
      /(horario|horário|que horas|quando abre|quando fecha|aberto|fechado|funcionamento|hours|open|close|schedule)/i,
    ],
  },
  {
    intent: "more_info",
    confidence: 1,
    patterns: [
      /(mais informacoes|mais informações|mais info|detalhes|tell me more|more info|more details|sobre o|sobre a|me fale sobre|fale sobre|o que e|o que é|what is)/i,
    ],
  },
  {
    intent: "nearby",
    confidence: 1,
    patterns: [
      /(perto de mim|proximo a mim|próximo a mim|o que tem perto|nearby|what's near|que hay cerca|mais proximo|mais próximo|perto daqui)/i,
    ],
  },
  {
    intent: "favorites",
    confidence: 1,
    patterns: [
      /(favorito|favoritos|meus lugares|lugares salvos|saved places|my favorites)/i,
    ],
  },
  {
    intent: "help",
    confidence: 1,
    patterns: [
      /(ajuda|help|ayuda|o que voce faz|o que você faz|como usar|comandos|funcionalidades|what can you do|tutorial)/i,
    ],
  },
  {
    intent: "confirm",
    confidence: 1,
    patterns: [
      /^(sim|yes|si|ok|confirmar|iniciar navegacao|iniciar navegação|comecar|começar|vamos|bora|let's go|claro|com certeza|pode ser|beleza|tudo bem|ótimo|otimo)$/i,
    ],
  },
  {
    intent: "deny",
    confidence: 1,
    patterns: [
      /^(nao|não|no|nope|nunca|jamais|negativo|cancel|cancelar|desistir|voltar)$/i,
    ],
  },
  {
    intent: "greeting",
    confidence: 1,
    patterns: [
      /^(oi|ola|olá|hey|hi|hello|bom dia|boa tarde|boa noite|e ai|e aí|salve|tudo bem|tudo bom|como vai)[\s!?]*$/i,
    ],
  },
  {
    intent: "thanks",
    confidence: 1,
    patterns: [
      /^(obrigado|obrigada|valeu|thanks|thank you|gracias|merci|danke|muito obrigado|muito obrigada)[\s!]*$/i,
    ],
  },
];

const PLACE_NAMES = [
  "primeira praia",
  "segunda praia",
  "terceira praia",
  "quarta praia",
  "quinta praia",
  "toca do morcego",
  "farol do morro",
  "forte de tapirandu",
  "mirante da tirolesa",
  "vila do morro",
  "porto de morro",
  "gamboa",
  "cairu",
  "boipeba",
  "piscinas naturais",
  "ponta do humaita",
  "teatro do morro",
  "morro de sao paulo",
  "morro de são paulo",
  "garapua",
  "garapuá",
  "caminho da praia",
  "trilha da tirolesa",
] as const;

const AREA_PATTERNS = {
  praia:
    /(na praia|na segunda|na terceira|na quarta|na primeira|na quinta|beach side|beira mar|frente ao mar)/i,
  vila: /(na vila|no centro|vila do morro|centro historico|centro histórico)/i,
  garapua: /(garapua|garapuá)/i,
} as const;

const MEAL_PATTERNS = {
  breakfast: /(cafe da manha|café da manhã|breakfast|desjejum|manha)/i,
  lunch: /(almoco|almoço|lunch|meio dia|ao meio dia)/i,
  dinner: /(jantar|dinner|noite|a noite)/i,
  snack: /(lanche|snack|petisco|tira-gosto)/i,
} as const;

const PRICE_PATTERNS = {
  cheap:
    /(barato|economico|econômico|em conta|acessivel|acessível|budget|cheap|low cost)/i,
  expensive: /(caro|luxo|luxury|premium|top|exclusivo|vip|sofisticado)/i,
  free: /(gratis|gratuito|free|sem cobrar|sem custo)/i,
} as const;

const DISTANCE_PATTERNS = {
  near: /(perto|proximo|próximo|pertinho|ao lado|vizinho|nearby|close)/i,
  far: /(longe|distante|far|afastado)/i,
} as const;

const TIME_PATTERNS = {
  now: /(agora|now|hoje|today|neste momento|aberto agora)/i,
  morning: /(manha|manhã|morning|cafe da manha|café da manhã)/i,
  afternoon: /(tarde|afternoon|almoco|almoço|lunch)/i,
  evening: /(entardecer|por do sol|pôr do sol|sunset|anoitecer)/i,
  night: /(noite|night|jantar|dinner|balada)/i,
} as const;

const CATEGORY_KEYWORDS = {
  beaches: [
    "beaches",
    "praia",
    "praias",
    "beach",
    "mar",
    "litoral",
    "areia",
    "playas",
    "playa",
    "חופים",
    "חוף",
  ],
  restaurants: [
    "restaurants",
    "restaurante",
    "restaurantes",
    "comida",
    "comer",
    "food",
    "almoco",
    "jantar",
    "cafe",
    "café",
    "מסעדות",
    "מסעדה",
  ],
  hotels: [
    "hotels",
    "pousada",
    "hotel",
    "hospedagem",
    "dormir",
    "ficar",
    "hoteles",
    "לינה",
    "מלונות",
  ],
  shops: [
    "shops",
    "loja",
    "compras",
    "shopping",
    "mercado",
    "souvenir",
    "artesanato",
    "tiendas",
    "חנויות",
    "חנות",
  ],
  attractions: [
    "attractions",
    "atracao",
    "turismo",
    "visitar",
    "monumento",
    "farol",
    "forte",
    "mirante",
    "tirolesa",
    "atracciones",
    "אטרקציות",
  ],
  nightlife: [
    "nightlife",
    "balada",
    "noite",
    "festa",
    "bar",
    "luau",
    "show",
    "musica",
    "vida nocturna",
    "חיי לילה",
  ],
  tours: [
    "tours",
    "passeio",
    "tour",
    "excursao",
    "barco",
    "trilha",
    "mergulho",
    "snorkel",
    "caiaque",
    "paseos",
    "paseo",
    "סיורים",
    "סיור",
  ],
  emergencies: [
    "emergencies",
    "emergencia",
    "emergencias",
    "hospital",
    "medico",
    "policia",
    "bombeiro",
    "farmacia",
    "חירום",
    "מקרי חירום",
  ],
  transport: ["transport", "transporte", "transfer", "תחבורה"],
} as const;

const SYNONYM_INTENTS: Record<
  keyof typeof SYNONYMS,
  { intent: AssistantIntent; confidence: number }
> = {
  praia: { intent: "category_beaches", confidence: 0.9 },
  restaurante: { intent: "category_restaurants", confidence: 0.9 },
  pousada: { intent: "category_hotels", confidence: 0.9 },
  loja: { intent: "category_shops", confidence: 0.9 },
  atracao: { intent: "category_attractions", confidence: 0.9 },
  noturno: { intent: "category_nightlife", confidence: 0.9 },
  passeio: { intent: "category_tours", confidence: 0.9 },
  emergencia: { intent: "category_emergencies", confidence: 0.9 },
  navegar: { intent: "navigate", confidence: 0.8 },
  clima: { intent: "weather", confidence: 0.95 },
  localizacao: { intent: "my_location", confidence: 0.95 },
  preco: { intent: "price", confidence: 0.9 },
  horario: { intent: "hours", confidence: 0.9 },
  fotos: { intent: "photos", confidence: 0.95 },
  ajuda: { intent: "help", confidence: 0.95 },
};

export function extractAssistantEntities(
  input: string,
  normalized = normalizeAssistantText(input),
): AssistantIntentEntities {
  const entities: AssistantIntentEntities = {};

  for (const place of PLACE_NAMES) {
    if (normalized.includes(normalizeAssistantText(place))) {
      entities.place = place;
      break;
    }
  }

  for (const [key, pattern] of Object.entries(PRICE_PATTERNS)) {
    if (pattern.test(input)) {
      entities.priceQualifier = key;
      break;
    }
  }

  for (const [key, pattern] of Object.entries(DISTANCE_PATTERNS)) {
    if (pattern.test(input)) {
      entities.distanceQualifier = key;
      break;
    }
  }

  for (const [key, pattern] of Object.entries(TIME_PATTERNS)) {
    if (pattern.test(input)) {
      entities.timeQualifier = key;
      break;
    }
  }

  const groupMatch = input.match(
    /(\d+)\s*(pessoa|pessoas|person|people|adulto|adultos|crianca|criancas)/i,
  );
  if (groupMatch?.[1]) entities.groupSize = Number.parseInt(groupMatch[1], 10);

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((keyword) => normalized.includes(normalizeAssistantText(keyword)))) {
      entities.category = category;
      break;
    }
  }

  for (const [area, pattern] of Object.entries(AREA_PATTERNS)) {
    if (pattern.test(input)) {
      entities.area = area;
      break;
    }
  }

  for (const [meal, pattern] of Object.entries(MEAL_PATTERNS)) {
    if (pattern.test(input)) {
      entities.mealType = meal;
      break;
    }
  }

  if (/[\u0590-\u05FF]/.test(input)) {
    entities.language = "he";
  } else if (/(the|is|are|what|where|how|can|i\b|you\b|me\b|my\b)/i.test(input)) {
    entities.language = "en";
  } else if (/(el|la|los|las|que|donde|como|es\b|son|hay|quiero)/i.test(input)) {
    entities.language = "es";
  } else {
    entities.language = "pt";
  }

  if (/(urgente|rapido|rápido|agora|imediato|emergency|urgent|quick)/i.test(input)) {
    entities.urgency = "high";
  }

  return entities;
}

export function detectAssistantModifiers(normalized: string): string[] {
  const modifiers: string[] = [];

  const checks: Array<[string, RegExp]> = [
    [
      "nearby",
      /(perto de mim|proximo a mim|proximo|nearby|mais perto|close to me|cerca de mi|ליד)/i,
    ],
    ["cheap", /(barato|economico|em conta|budget|cheap|זול)/i],
    ["luxury", /(caro|luxo|luxury|premium|exclusivo|vip|יוקרה)/i],
    ["romantic", /(romantico|casal|couple|romántico|para dois|רומנטי)/i],
    ["family", /(familia|crianca|criancas|kids|children|bebe|família|משפחה)/i],
    ["open_now", /(aberto agora|open now|funcionando agora|abierto ahora|פתוח עכשיו)/i],
    ["beachside", /(na praia|beira mar|frente ao mar|beach side|playa|חוף)/i],
    ["village_center", /(na vila|no centro|centro historico|village center|מרכז)/i],
    ["vegetarian", /(vegetariano|vegano|vegan|vegetarian|sem carne|צמחוני|טבעוני)/i],
    ["scenic_view", /(vista|view|panoramica|por do sol|sunset|נוף)/i],
    ["now", /(agora|hoje|neste momento|right now|ahora|עכשיו)/i],
  ];

  for (const [modifier, pattern] of checks) {
    if (pattern.test(normalized)) modifiers.push(modifier);
  }

  return modifiers;
}

function matchBySynonyms(normalized: string): {
  intent: AssistantIntent;
  confidence: number;
  synonym: string;
} | null {
  for (const [key, synonymList] of Object.entries(SYNONYMS) as Array<
    [keyof typeof SYNONYMS, readonly string[]]
  >) {
    for (const synonym of synonymList) {
      if (normalized.includes(normalizeAssistantText(synonym))) {
        return { ...SYNONYM_INTENTS[key], synonym };
      }
    }
  }

  return null;
}

function matchByContext(
  normalized: string,
  context: AssistantIntentContext,
): Omit<AssistantIntentResult, "entities" | "normalized" | "modifiers"> | null {
  const { lastIntent, lastPlace, lastCategory, awaiting } = context;

  if (awaiting?.type === "confirmar_navegacao") {
    if (/(sim|yes|ok|bora|vamos|claro|pode|beleza|confirmar|si\b|sí\b|כן)/i.test(normalized)) {
      return { intent: "confirm", confidence: 0.95 };
    }
    if (/(nao|não|no\b|cancel|cancelar|desistir|לא)/i.test(normalized)) {
      return { intent: "deny", confidence: 0.95 };
    }
  }

  if (awaiting?.type === "selecionar_subcategoria") {
    if (/(proximo|próximo|perto|perto de mim|nearby|mais perto|cerca de mi|más cercano|ליד|קרוב)/i.test(normalized)) {
      return { intent: "nearby", confidence: 0.9 };
    }
    if (/(barato|economico|em conta|budget|cheap|económico|asequible|זול)/i.test(normalized)) {
      return { intent: "category_filtered", confidence: 0.85, filter: "cheap" };
    }
    if (/(praia|na praia|beira mar|beach|playa|beira-mar|חוף|ים)/i.test(normalized)) {
      return { intent: "category_filtered", confidence: 0.85, filter: "praia" };
    }
    if (/(vila|na vila|centro|village|pueblo|כפר|מרכז)/i.test(normalized)) {
      return { intent: "category_filtered", confidence: 0.85, filter: "vila" };
    }
    if (/(familia|crianca|kids|children|niños|משפחה)/i.test(normalized)) {
      return { intent: "category_filtered", confidence: 0.85, filter: "family" };
    }
    if (/(romantico|casal|romantic|couple|romántico|pareja|רומנטי)/i.test(normalized)) {
      return { intent: "category_filtered", confidence: 0.85, filter: "romantic" };
    }
    if (/(luxo|luxury|premium|exclusivo|יוקרה)/i.test(normalized)) {
      return { intent: "category_filtered", confidence: 0.85, filter: "luxury" };
    }
  }

  if (lastIntent === "detalhes" && lastPlace && normalized.length < 30) {
    const detailMatches: Array<[RegExp, AssistantIntent, number]> = [
      [/(foto|imagem|ver|mostrar|photo|תמונה)/i, "photos", 0.85],
      [/(rota|ir|chegar|navegar|como chego|directions|route|ניווט)/i, "navigate", 0.85],
      [/(preco|custa|valor|quanto|ingresso|entrada|price|cost|מחיר)/i, "price", 0.85],
      [/(horario|abre|fecha|funciona|hours|open|פתוח)/i, "hours", 0.85],
      [/(historia|origem|sobre|fale|conte|history|origin|היסטוריה)/i, "cultural_history", 0.8],
      [/(dica|conselho|recomenda|tip|advice|טיפ)/i, "practical_tips", 0.8],
      [/(favorito|salvar|guardar|save|favorite|מועדף)/i, "favorites", 0.8],
    ];

    for (const [pattern, intent, confidence] of detailMatches) {
      if (pattern.test(normalized)) return { intent, confidence };
    }
  }

  if (lastCategory && normalized.length < 25) {
    if (/(ver todos|mostrar todos|show all|todos|הצג הכול)/i.test(normalized)) {
      return { intent: "show_all", confidence: 0.9 };
    }
    if (/(mapa|ver no mapa|show map|מפה)/i.test(normalized)) {
      return { intent: "show_map", confidence: 0.9 };
    }
  }

  if (/^\d+$/.test(normalized.trim())) {
    return {
      intent: "select_option",
      confidence: 0.85,
      optionIndex: Number.parseInt(normalized, 10) - 1,
    };
  }

  if (normalized.length <= 5 && lastPlace && /^(ok|sim|vai|bora|vamos|כן)$/i.test(normalized)) {
    return { intent: "confirm", confidence: 0.75 };
  }

  return null;
}

function isLikelyPlaceName(
  normalized: string,
  original: string,
): { likely: boolean; confidence: number } {
  const notPlaceWords = /^(como|quanto|qual|quando|onde|por que|porque|o que|quem|voce|me|meu|minha|tem|ha|existe|existem|quero|preciso|gostaria|pode|poderia|seria|e|a|o|os|as|de|do|da|dos|das|em|no|na|nos|nas|para|por|com|sem|mas|ou|se|que|nao|sim)/i;
  const notPlaceAdjectives = /^(bom|boa|ruim|caro|barato|longe|perto|legal|bonito|feio|grande|pequeno|novo|velho|aberto|fechado|cheio|vazio|rapido|lento|facil|dificil|seguro|perigoso|tranquilo|agitado|limpo|sujo|quente|frio|ok|sim|nao|talvez|claro|certo|errado)$/i;
  const firstWord = normalized.split(" ")[0] ?? "";

  if (notPlaceWords.test(firstWord) || notPlaceAdjectives.test(firstWord) || normalized.length < 4) {
    return { likely: false, confidence: 0 };
  }

  const startsWithCapital = /^[A-ZÁÀÃÂÉÈÊÍÌÎÓÒÕÔÚÙÛÇ]/.test(original.trim());
  const hasPlaceWords = /(praia|restaurante|pousada|hotel|bar|cafe|café|loja|mercado|farmacia|posto|hospital|escola|igreja|museu|parque|trilha|mirante|farol|forte|vila|rua|avenida|travessa|beco)/i.test(normalized);

  return {
    likely: true,
    confidence: startsWithCapital ? 0.7 : hasPlaceWords ? 0.65 : 0.5,
  };
}

export function analyzeAssistantIntent(
  input: string,
  context: AssistantIntentContext = {},
): AssistantIntentResult {
  const normalized = normalizeAssistantText(input);
  const entities = extractAssistantEntities(input, normalized);
  const modifiers = detectAssistantModifiers(normalized);

  if (!input || typeof input !== "string") {
    return { intent: "unknown", confidence: 0, entities: {}, normalized: "", modifiers: [] };
  }

  if (context.awaiting?.type) {
    const earlyContextMatch = matchByContext(normalized, context);
    if (earlyContextMatch) {
      return {
        ...earlyContextMatch,
        entities,
        normalized,
        modifiers,
        contextual: true,
      };
    }
  }

  for (const definition of INTENT_PATTERNS) {
    if (
      definition.patterns.some(
        (pattern) => pattern.test(input) || pattern.test(normalized),
      )
    ) {
      return {
        intent: definition.intent,
        confidence: definition.confidence,
        entities,
        normalized,
        modifiers,
      };
    }
  }

  const synonymMatch = matchBySynonyms(normalized);
  if (synonymMatch) {
    return {
      intent: synonymMatch.intent,
      confidence: synonymMatch.confidence,
      entities,
      normalized,
      modifiers,
      matchedSynonym: synonymMatch.synonym,
    };
  }

  const contextualMatch = matchByContext(normalized, context);
  if (contextualMatch) {
    return {
      ...contextualMatch,
      entities,
      normalized,
      modifiers,
      contextual: true,
    };
  }

  const likelyPlace = isLikelyPlaceName(normalized, input);
  if (likelyPlace.likely) {
    return {
      intent: "place_search",
      confidence: likelyPlace.confidence,
      entities: { ...entities, searchQuery: input },
      normalized,
      modifiers,
    };
  }

  return {
    intent: "unknown",
    confidence: 0,
    entities,
    normalized,
    modifiers,
    requiresLLM: true,
  };
}
