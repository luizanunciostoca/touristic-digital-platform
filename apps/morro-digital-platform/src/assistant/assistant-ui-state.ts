export const ASSISTANT_UI_STATE_EVENT = "morro:assistant-ui-state";

export type AssistantUiState = "idle" | "loading" | "success" | "error";

export interface AssistantUiStateDetail {
  readonly state: AssistantUiState;
}

export function dispatchAssistantUiState(
  document: Document,
  state: AssistantUiState,
): void {
  document.dispatchEvent(
    new CustomEvent<AssistantUiStateDetail>(ASSISTANT_UI_STATE_EVENT, {
      detail: Object.freeze({ state }),
    }),
  );
}

export function assistantUiStateStatus(
  state: AssistantUiState,
  language: string,
): string {
  const locale = language.toLowerCase();
  const key = locale.startsWith("he")
    ? "he"
    : locale.startsWith("es")
      ? "es"
      : locale.startsWith("en")
        ? "en"
        : "pt";
  const copy = {
    pt: {
      idle: "Assistente pronto.",
      loading: "Preparando resposta…",
      success: "Resposta pronta.",
      error: "Não foi possível concluir a resposta.",
    },
    en: {
      idle: "Assistant ready.",
      loading: "Preparing response…",
      success: "Response ready.",
      error: "The response could not be completed.",
    },
    es: {
      idle: "Asistente listo.",
      loading: "Preparando respuesta…",
      success: "Respuesta lista.",
      error: "No se pudo completar la respuesta.",
    },
    he: {
      idle: "העוזר מוכן.",
      loading: "מכין תשובה…",
      success: "התשובה מוכנה.",
      error: "לא ניתן היה להשלים את התשובה.",
    },
  } as const;
  return copy[key][state];
}
