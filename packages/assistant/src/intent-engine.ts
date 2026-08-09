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
  | "unknown";

export interface AssistantIntentResult {
  intent: AssistantIntent;
  confidence: number;
  normalized: string;
  modifiers: string[];
  requiresLLM?: boolean;
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
    .replace(/[áàãâäéèêëíìîïóòõôöúùûüçñ]/g, (character) =>
      ACCENTS_MAP[character] ?? character,
    )
    .replace(/[^\w\s\u0590-\u05FF\u0600-\u06FF]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

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
    patterns: [/^(nao|não|no|nope|nunca|jamais|negativo|cancel|cancelar|desistir|voltar)$/i],
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

function detectModifiers(normalized: string): string[] {
  const modifiers: string[] = [];

  if (/\b(agora|now|hoje|today)\b/.test(normalized)) modifiers.push("now");
  if (/\b(barato|economico|budget|cheap)\b/.test(normalized)) modifiers.push("cheap");
  if (/\b(perto|proximo|nearby|close)\b/.test(normalized)) modifiers.push("near");

  return modifiers;
}

export function analyzeAssistantIntent(input: string): AssistantIntentResult {
  const normalized = normalizeAssistantText(input);
  const modifiers = detectModifiers(normalized);

  if (!normalized) {
    return { intent: "unknown", confidence: 0, normalized, modifiers };
  }

  for (const definition of INTENT_PATTERNS) {
    if (definition.patterns.some((pattern) => pattern.test(input) || pattern.test(normalized))) {
      return {
        intent: definition.intent,
        confidence: definition.confidence,
        normalized,
        modifiers,
      };
    }
  }

  return {
    intent: "unknown",
    confidence: 0,
    normalized,
    modifiers,
    requiresLLM: true,
  };
}
