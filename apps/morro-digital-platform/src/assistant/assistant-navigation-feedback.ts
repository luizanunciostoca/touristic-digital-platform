import { createAssistantMessageDom } from "./assistant-message-dom.js";

export interface AssistantNavigationFeedback {
  destroy(): void;
}

type FeedbackLanguage = "pt" | "en" | "es" | "he";

const FEEDBACK = Object.freeze({
  pt: Object.freeze({
    arrived: "Você chegou ao destino.",
    cancelled: "Navegação encerrada.",
  }),
  en: Object.freeze({
    arrived: "You have arrived at your destination.",
    cancelled: "Navigation ended.",
  }),
  es: Object.freeze({
    arrived: "Has llegado a tu destino.",
    cancelled: "Navegación finalizada.",
  }),
  he: Object.freeze({
    arrived: "הגעת ליעד.",
    cancelled: "הניווט הסתיים.",
  }),
});

function languageFor(document: Document): FeedbackLanguage {
  const language = document.documentElement.lang.trim().toLowerCase();
  if (language === "en" || language.startsWith("en-")) return "en";
  if (language === "es" || language.startsWith("es-")) return "es";
  if (language === "he" || language.startsWith("he-")) return "he";
  return "pt";
}

export function installAssistantNavigationFeedback(
  document: Document,
): AssistantNavigationFeedback {
  const view = document.defaultView;
  const messages = createAssistantMessageDom({ document });
  let destroyed = false;

  const onNavigationEnded = (event: Event): void => {
    if (destroyed || !(event instanceof CustomEvent)) return;
    const detail = event.detail as { readonly reason?: unknown } | null;
    const reason = detail?.reason;
    if (reason !== "arrived" && reason !== "cancelled") return;
    const text = FEEDBACK[languageFor(document)][reason];
    messages.append({
      sender: "assistant",
      html: text,
      messageType: "navigation-feedback",
    });
  };

  view?.addEventListener("navigationEnded", onNavigationEnded);

  return Object.freeze({
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      view?.removeEventListener("navigationEnded", onNavigationEnded);
    },
  });
}
