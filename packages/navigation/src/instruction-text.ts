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

function decodeKnownHtmlEntities(value: string): string {
  return value.replace(
    /&(nbsp|amp|quot|#39|apos|lt|gt);/giu,
    (entity) => HTML_ENTITIES[entity.toLowerCase()] ?? entity,
  );
}

/**
 * Applies only semantics-preserving cleanup shared by PT/EN/ES/HE route text.
 * The exact semantic simplifier from V1 ZIP 55acb639... is intentionally not
 * guessed while that source cannot be read by the live repository connection.
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
