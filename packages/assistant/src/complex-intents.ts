export type AssistantComplexIntent =
  "cultural_history" | "practical_tips" | "transport" | "accessibility";

export interface AssistantComplexIntentMatch {
  intent: AssistantComplexIntent;
  confidence: number;
}

const COMPLEX_INTENT_PATTERNS: ReadonlyArray<{
  intent: AssistantComplexIntent;
  confidence: number;
  patterns: readonly RegExp[];
}> = [
  {
    intent: "cultural_history",
    confidence: 0.95,
    patterns: [
      /(historia|história|origem|fundacao|fundação|quando foi|quem criou|fundado|construido|construído|colonial|patrimonio|patrimônio)/i,
      /(lenda|mito|folclore|tradicao|tradição|cultura|cultural|indigena|indígena|quilombo)/i,
      /(por que se chama|por que o nome|significado do nome|nome vem de)/i,
    ],
  },
  {
    intent: "practical_tips",
    confidence: 0.9,
    patterns: [
      /(dica|dicas|conselho|conselhos|tip|tips|advice|o que levar|o que trazer|preciso saber|antes de ir)/i,
      /(seguro|segura|perigoso|perigosa|safe|danger|cuidado|atencao|atenção)/i,
      /(melhor epoca|melhor mes|melhor período|quando ir|quando visitar|best time)/i,
      /(como chegar em morro|como ir para morro|acesso|ferry|catamarao|catamarão|lancha|barco para morro)/i,
    ],
  },
  {
    intent: "transport",
    confidence: 0.95,
    patterns: [
      /(ferry|catamarao|catamarão|lancha|barco.*morro|morro.*barco|como chegar em morro|acesso a morro)/i,
      /(valenca|valença|salvador.*morro|morro.*salvador|itacare|itacaré)/i,
      /(buggy|quadriciclo|bicicleta|mototaxi|moto taxi|a pe|a pé|caminhando|andando)/i,
    ],
  },
  {
    intent: "accessibility",
    confidence: 0.9,
    patterns: [
      /(acessivel|acessível|cadeirante|cadeira de rodas|wheelchair|deficiente|deficiência|mobilidade reduzida)/i,
      /(crianca|criança|bebe|bebê|baby|kids|children).*(praia|piscina|segura|calma)/i,
    ],
  },
];

export function classifyAssistantComplexIntent(
  input: string,
): AssistantComplexIntentMatch | null {
  for (const definition of COMPLEX_INTENT_PATTERNS) {
    if (definition.patterns.some((pattern) => pattern.test(input))) {
      return {
        intent: definition.intent,
        confidence: definition.confidence,
      };
    }
  }

  return null;
}
