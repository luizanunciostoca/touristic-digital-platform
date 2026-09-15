const HTML_TAG_PATTERN = /<[^>]*>/gu;
const BIDI_CONTROL_PATTERN = /[\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu;
const MULTISPACE_PATTERN = /\s+/gu;
const SPACE_BEFORE_PUNCTUATION_PATTERN = /\s+([,.;:!?])/gu;

const HTML_ENTITIES: Readonly<Record<string, string>> = Object.freeze({
  "&nbsp;": " ",
  "&amp;": "&",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&lt;": "<",
  "&gt;": ">",
});

export type NavigationInstructionLanguage = "pt" | "en" | "es" | "he";

type NavigationSemanticAction =
  | "forward"
  | "turnLeft"
  | "turnRight"
  | "keepLeft"
  | "keepRight"
  | "slightLeft"
  | "slightRight"
  | "sharpLeft"
  | "sharpRight"
  | "uturn"
  | "arrived";

type NavigationSemanticCopy = Readonly<
  Record<NavigationSemanticAction, string>
>;

/**
 * Source-exact presentation strings used by the active V1 banner simplifier
 * from canonical ZIP sourceCommit 55acb639c1112a3c9a646dd103b01ad9cf5dd106.
 *
 * Note: V1 does not define the generic `navigation_turn_slight_right` key in
 * the loaded language files. `bannerUI.js` therefore falls through its own
 * literal fallback, `Slight right`, in every language. Keeping that behavior
 * here is deliberate source parity, not a translation omission in V2.
 */
const V1_SEMANTIC_COPY: Readonly<
  Record<NavigationInstructionLanguage, NavigationSemanticCopy>
> = Object.freeze({
  pt: Object.freeze({
    forward: "Siga em frente",
    turnLeft: "Vire à esquerda",
    turnRight: "Vire à direita",
    keepLeft: "Mantenha-se à esquerda",
    keepRight: "Mantenha-se à direita",
    slightLeft: "Faça uma leve curva à esquerda",
    slightRight: "Slight right",
    sharpLeft: "Faça uma curva acentuada à esquerda",
    sharpRight: "Faça uma curva acentuada à direita",
    uturn: "Faça o retorno",
    arrived: "Você chegou ao destino!",
  }),
  en: Object.freeze({
    forward: "Continue straight",
    turnLeft: "Turn left",
    turnRight: "Turn right",
    keepLeft: "Keep left",
    keepRight: "Keep right",
    slightLeft: "Turn slight left",
    slightRight: "Slight right",
    sharpLeft: "Turn sharp left",
    sharpRight: "Turn sharp right",
    uturn: "Make a U-turn",
    arrived: "You have arrived!",
  }),
  es: Object.freeze({
    forward: "Continúa recto",
    turnLeft: "Gira a la izquierda",
    turnRight: "Gira a la derecha",
    keepLeft: "Mantente a la izquierda",
    keepRight: "Mantente a la derecha",
    slightLeft: "Gira ligeramente a la izquierda",
    slightRight: "Slight right",
    sharpLeft: "Gira bruscamente a la izquierda",
    sharpRight: "Gira bruscamente a la derecha",
    uturn: "Dé la vuelta",
    arrived: "¡Has llegado a tu destino!",
  }),
  he: Object.freeze({
    forward: "המשך ישר",
    turnLeft: "פנה שמאלה",
    turnRight: "פנה ימינה",
    keepLeft: "הישאר שמאלה",
    keepRight: "הישאר ימינה",
    slightLeft: "פנה מעט שמאלה",
    slightRight: "Slight right",
    sharpLeft: "פנה חדות שמאלה",
    sharpRight: "פנה חדות ימינה",
    uturn: "עשה פנייה בניידה",
    arrived: "הגעת ליעד!",
  }),
});

const V1_TYPE_ACTIONS: Readonly<Record<string, NavigationSemanticAction>> =
  Object.freeze({
    "0": "forward",
    "1": "forward",
    "2": "slightRight",
    "3": "turnRight",
    "4": "sharpRight",
    "5": "uturn",
    "6": "sharpLeft",
    "7": "turnLeft",
    "8": "slightLeft",
    "9": "keepLeft",
    "10": "arrived",
    "11": "arrived",
    "12": "arrived",
    continue: "forward",
    straight: "forward",
    head: "forward",
    "turn-left": "turnLeft",
    "turn-right": "turnRight",
    "turn-slight-left": "slightLeft",
    "turn-slight-right": "slightRight",
    "turn-sharp-left": "sharpLeft",
    "turn-sharp-right": "sharpRight",
    "keep-left": "keepLeft",
    "keep-right": "keepRight",
    uturn: "uturn",
    arrive: "arrived",
    destination: "arrived",
  });

function decodeKnownHtmlEntities(value: string): string {
  return value.replace(
    /&(nbsp|amp|quot|#39|apos|lt|gt);/giu,
    (entity) => HTML_ENTITIES[entity.toLowerCase()] ?? entity,
  );
}

/**
 * Semantics-preserving provider cleanup shared by PT/EN/ES/HE route text.
 */
export function processNavigationInstructionText(
  value: unknown,
  fallback = "Continue pela rota",
): string {
  if (typeof value !== "string") return fallback;
  const processed = decodeKnownHtmlEntities(value)
    .replace(HTML_TAG_PATTERN, " ")
    .replace(BIDI_CONTROL_PATTERN, "")
    .replace(MULTISPACE_PATTERN, " ")
    .replace(SPACE_BEFORE_PUNCTUATION_PATTERN, "$1")
    .trim();
  return processed || fallback;
}

function normalizeManeuverType(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  if (typeof value !== "string") return "";
  return value.toLowerCase().replace(/[_\s]/gu, "-");
}

function actionFromManeuverType(
  value: unknown,
): NavigationSemanticAction | null {
  const normalized = normalizeManeuverType(value);
  if (!normalized) return null;
  for (const [key, action] of Object.entries(V1_TYPE_ACTIONS)) {
    if (normalized === key || normalized.includes(key)) return action;
  }
  return null;
}

function actionFromEnglishInstruction(
  instruction: string,
): NavigationSemanticAction {
  const lower = instruction.toLowerCase();
  if (lower.includes("arrive") || lower.includes("destination")) {
    return "arrived";
  }
  if (lower.includes("sharp left")) return "sharpLeft";
  if (lower.includes("sharp right")) return "sharpRight";
  if (lower.includes("slight left")) return "slightLeft";
  if (lower.includes("slight right")) return "slightRight";
  if (lower.includes("left")) return "turnLeft";
  if (lower.includes("right")) return "turnRight";
  if (lower.includes("uturn") || lower.includes("u-turn")) return "uturn";
  if (lower.includes("head") || lower.includes("continue")) return "forward";
  return "forward";
}

/**
 * Reproduces the active semantic simplifier from V1 `bannerUI.js`.
 *
 * V1 first resolves the maneuver type (numeric ORS type or compatible string),
 * then falls back to analysing the English provider text, and finally defaults
 * to the localized forward action. The original instruction is intentionally
 * not mutated; callers should keep it separately for street/details output.
 */
export function simplifyNavigationInstructionText(
  value: unknown,
  maneuverType: unknown,
  language: NavigationInstructionLanguage = "pt",
): string {
  const normalizedLanguage = V1_SEMANTIC_COPY[language] ? language : "pt";
  const copy = V1_SEMANTIC_COPY[normalizedLanguage];
  const processed = processNavigationInstructionText(value, "");
  const action =
    actionFromManeuverType(maneuverType) ??
    actionFromEnglishInstruction(processed);
  return copy[action];
}
