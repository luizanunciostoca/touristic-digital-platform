import type {
  AssistantDialogResponse,
  AssistantHistoryEntry,
} from "@touristic/assistant";
import { normalizeSearchText } from "@touristic/search";

export type AssistantV1HistoryLanguage = "pt" | "en" | "es" | "he";

const COPY = Object.freeze({
  pt: {
    empty: "Seu histórico está vazio. Gostaria de começar uma nova busca?",
    recent: "Seu histórico recente:",
    askMore: "Deseja saber mais sobre algum desses locais?",
  },
  en: {
    empty: "Your history is empty. Would you like to start a new search?",
    recent: "Your recent history:",
    askMore: "Would you like to know more about any of these places?",
  },
  es: {
    empty: "Tu historial está vacío. ¿Te gustaría comenzar una nueva búsqueda?",
    recent: "Tu historial reciente:",
    askMore: "¿Te gustaría saber más sobre alguno de estos lugares?",
  },
  he: {
    empty: "ההיסטוריה שלך ריקה. האם תרצה להתחיל חיפוש חדש?",
    recent: "ההיסטוריה האחרונה שלך:",
    askMore: "האם תרצה לדעת יותר על אחד מהמקומות האלה?",
  },
} as const);

export function isAssistantV1HistoryCommand(input: string): boolean {
  const normalized = normalizeSearchText(input);
  return normalized === "historico" || normalized === "meu historico";
}

export function resolveAssistantV1History(
  input: string,
  history: readonly AssistantHistoryEntry[],
  language: AssistantV1HistoryLanguage = "pt",
): AssistantDialogResponse | null {
  if (!isAssistantV1HistoryCommand(input)) return null;
  const copy = COPY[language];
  if (history.length === 0) {
    return {
      text: copy.empty,
      metadata: {
        domain: "history",
        state: "empty",
        deterministic: true,
      },
    };
  }

  // Canonical V1 intentionally keeps the conversation role labels in PT even
  // when the surrounding history copy is localized.
  const recent = history
    .slice(-5)
    .map((entry) => `Você: ${entry.input}\nAssistente: ${entry.response || ""}`)
    .join("\n\n");
  return {
    text: `${copy.recent}\n${recent}\n${copy.askMore}`,
    metadata: {
      domain: "history",
      state: "resolved",
      deterministic: true,
      count: Math.min(history.length, 5),
    },
  };
}
