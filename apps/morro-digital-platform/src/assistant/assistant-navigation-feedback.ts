import { createAssistantMessageDom } from "./assistant-message-dom.js";
import { clearAssistantDomOptions } from "./assistant-dom-view.js";

export interface AssistantNavigationFeedback {
  destroy(): void;
}

type FeedbackLanguage = "pt" | "en" | "es" | "he";
type FeedbackReason = "arrived" | "cancelled";

const V1_POST_NAVIGATION_MENU_DELAY_MS = 600;
const MAIN_MENU_REQUEST_EVENT = "morro:assistant-main-menu-requested";

const FEEDBACK = Object.freeze({
  pt: Object.freeze({
    arrived: "✅ Você chegou ao destino! Como posso ajudar agora?",
    cancelled: "🛑 Navegação encerrada. Como posso ajudar?",
  }),
  en: Object.freeze({
    arrived: "✅ You arrived at your destination! How can I help now?",
    cancelled: "🛑 Navigation ended. How can I help?",
  }),
  es: Object.freeze({
    arrived: "✅ ¡Has llegado a tu destino! ¿Cómo puedo ayudarte ahora?",
    cancelled: "🛑 Navegación finalizada. ¿Cómo puedo ayudarte?",
  }),
  he: Object.freeze({
    arrived: "✅ הגעת ליעד! איך אפשר לעזור עכשיו?",
    cancelled: "🛑 הניווט הסתיים. איך אפשר לעזור?",
  }),
});

function languageFor(document: Document): FeedbackLanguage {
  const language = document.documentElement.lang.trim().toLowerCase();
  if (language === "en" || language.startsWith("en-")) return "en";
  if (language === "es" || language.startsWith("es-")) return "es";
  if (language === "he" || language.startsWith("he-")) return "he";
  return "pt";
}

function ensureAssistantVisible(document: Document): void {
  const assistant = document.getElementById("assistant-messages");
  if (!assistant?.classList.contains("hidden")) return;
  document.querySelector<HTMLButtonElement>(".mood-button")?.click();
}

function destinationFromDetail(detail: unknown): string {
  if (!detail || typeof detail !== "object") return "";
  const candidate = Reflect.get(detail, "destination");
  return typeof candidate === "string" ? candidate.trim() : "";
}

function feedbackText(
  document: Document,
  reason: FeedbackReason,
  destination: string,
): string {
  if (reason !== "arrived" || !destination) {
    return FEEDBACK[languageFor(document)][reason];
  }

  const escapedDestination = destination
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const arrived = {
    pt: `✅ Você chegou a <b>${escapedDestination}</b>! Como posso ajudar agora?`,
    en: `✅ You arrived at <b>${escapedDestination}</b>! How can I help now?`,
    es: `✅ ¡Has llegado a <b>${escapedDestination}</b>! ¿Cómo puedo ayudarte ahora?`,
    he: `✅ הגעת אל <b>${escapedDestination}</b>! איך אפשר לעזור עכשיו?`,
  } as const;

  return arrived[languageFor(document)];
}

export function installAssistantNavigationFeedback(
  document: Document,
): AssistantNavigationFeedback {
  const view = document.defaultView;
  const messages = createAssistantMessageDom({ document });
  let destroyed = false;
  let restoreTimer: number | undefined;

  const clearRestoreTimer = (): void => {
    if (restoreTimer === undefined) return;
    view?.clearTimeout(restoreTimer);
    restoreTimer = undefined;
  };

  const restoreMainMenu = (
    reason: FeedbackReason,
    destination: string,
  ): void => {
    if (destroyed) return;

    ensureAssistantVisible(document);
    document.dispatchEvent(new CustomEvent(MAIN_MENU_REQUEST_EVENT));
    clearAssistantDomOptions(document);

    messages.append({
      sender: "assistant",
      html: feedbackText(document, reason, destination),
      messageType: "navigation-feedback",
    });
  };

  const onNavigationStarted = (): void => {
    clearRestoreTimer();
  };

  const onNavigationEnded = (event: Event): void => {
    if (destroyed || !(event instanceof CustomEvent)) return;
    const detail = event.detail as { readonly reason?: unknown } | null;
    const reason = detail?.reason;
    if (reason !== "arrived" && reason !== "cancelled") return;

    clearRestoreTimer();
    const destination = destinationFromDetail(event.detail);
    if (view) {
      restoreTimer = view.setTimeout(() => {
        restoreTimer = undefined;
        restoreMainMenu(reason, destination);
      }, V1_POST_NAVIGATION_MENU_DELAY_MS);
      return;
    }

    restoreMainMenu(reason, destination);
  };

  view?.addEventListener("navigationStarted", onNavigationStarted);
  view?.addEventListener("navigationEnded", onNavigationEnded);

  return Object.freeze({
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      clearRestoreTimer();
      view?.removeEventListener("navigationStarted", onNavigationStarted);
      view?.removeEventListener("navigationEnded", onNavigationEnded);
    },
  });
}
