import type { AssistantInputSource, AssistantLocale, Result } from "../core/contracts.js";
import { err, ok } from "../core/contracts.js";

export interface NormalizedAssistantInput {
  readonly text: string;
  readonly locale: AssistantLocale;
  readonly source: AssistantInputSource;
  readonly receivedAt: string;
}

export class AssistantInputNormalizer {
  normalize(
    input: Readonly<{
      text: unknown;
      locale: AssistantLocale;
      source: AssistantInputSource;
      receivedAt: string;
    }>,
  ): Result<NormalizedAssistantInput> {
    if (typeof input.text !== "string")
      return err("VALIDATION_FAILED", "Input text must be a string");
    const text = Array.from(input.text)
      .map((character) => {
        const code = character.charCodeAt(0);
        return code < 32 || code === 127 ? " " : character;
      })
      .join("")
      .replace(/\s+/gu, " ")
      .trim();
    if (!text) return err("VALIDATION_FAILED", "Input text is empty");
    if (text.length > 4000) return err("VALIDATION_FAILED", "Input text exceeds size limit");
    return ok({ text, locale: input.locale, source: input.source, receivedAt: input.receivedAt });
  }
}
