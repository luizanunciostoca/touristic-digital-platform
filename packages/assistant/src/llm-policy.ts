import {
  LLM_FALLBACK_CONFIDENCE,
  LONG_INPUT_THRESHOLD_CHARS,
} from "./intent-engine.js";
import type { AssistantIntentResult } from "./intent-engine.js";

const ALWAYS_LLM_INTENTS = new Set<AssistantIntentResult["intent"]>([
  "cultural_history",
  "practical_tips",
  "transport",
  "accessibility",
  "unknown",
]);

const COMPLEX_PATTERNS: readonly RegExp[] = [
  /\b(e|que|com|sem|mas|porem|porém|além|alem)\b.*\b(e|que|com|sem)\b/i,
  /\b(melhor|mais|menos|maior|menor|pior)\b.*\b(para|pra|pro)\b/i,
  /(por que|porque|como funciona|como e|como é|me explica|explique)/i,
  /(historia|história|origem|fundacao|fundação|quando foi|quem criou)/i,
  /(dica|conselho|recomenda).*(para|pra|pro).*(familia|casal|crianca|aventura)/i,
  /(diferenca|diferença|comparar|versus|vs|ou o|ou a).*(praia|restaurante|pousada)/i,
  /(vale a pena|compensa|recomenda|vale ir|devo ir|preciso ir)/i,
  /(o que fazer|o que tem|o que ver|o que visitar).*(quando|se|caso|dia de chuva)/i,
  /(como e|como é|me conta|me fale|me explica).*(morro|ilha|lugar|local)/i,
];

export function countAssistantSemanticDimensions(input: string): number {
  const dimensionChecks = [
    /restaurante|praia|pousada|loja|passeio|atracao/i.test(input),
    /barato|caro|romantico|familia|luxo|vegetariano/i.test(input),
    /perto|longe|na praia|na vila|beira mar/i.test(input),
    /agora|hoje|amanha|fim de semana|manha|tarde|noite/i.test(input),
    /para|com|sem|mas|alem|tambem/i.test(input),
  ];

  return dimensionChecks.filter(Boolean).length;
}

export function assistantRequiresLLM(
  input: string,
  intentResult: Pick<
    AssistantIntentResult,
    "intent" | "confidence" | "requiresLLM"
  >,
): boolean {
  if (ALWAYS_LLM_INTENTS.has(intentResult.intent)) return true;
  if (intentResult.confidence < LLM_FALLBACK_CONFIDENCE) return true;
  if (intentResult.requiresLLM) return true;

  if (countAssistantSemanticDimensions(input) >= 3) return true;
  if (COMPLEX_PATTERNS.some((pattern) => pattern.test(input))) return true;
  if (input.length > LONG_INPUT_THRESHOLD_CHARS) return true;

  return false;
}
