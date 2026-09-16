import { createAssistantMessageDom } from "./assistant-message-dom.js";
import { clearAssistantDomOptions } from "./assistant-dom-view.js";

export interface AssistantNavigationFeedback {
  destroy(): void;
}

type FeedbackLanguage = "pt" | "en" | "es" | "he";
type FeedbackReason = "arrived" | "cancelled";

const V1_POST_NAVIGATION_MENU_DELAY_MS = 600;
const CATEGORY_FLOW_RESULTS_ID = "assistant-category-results";
const CATEGORY_FLOW_MESSAGE_ID = "assistant-category-results-message";

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

function resetCategorySurface(document: Document): void {
  document.getElementById(CATEGORY_FLOW_RESULTS_ID)?.remove();
  document.getElementById(CATEGORY_FLOW_MESSAGE_ID)?.remove();

  const categoryButtons = Array.from(
    document.querySelectorAll<HTMLElement>(
      ".assistant-option-btn[data-explore-category]",
    ),
  );
  for (const button of categoryButtons) {
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-pressed", "false");
  }
}

function destinationFromDetail(detail: unknown): string {
  if (!detail || typeof detail !== "object") return "";
  const candidate: unknown = Reflect.get(detail, "destination");
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

  const arrived = {
    pt: `✅ Você chegou a <b>${destination}</b>! Como posso ajudar agora?`,
    en: `✅ You arrived at <b>${destination}</b>! How can I help now?`,
    es: `✅ ¡Has llegado a <b>${destination}</b>! ¿Cómo puedo ayudarte ahora?`,
    he: `✅ הגעת אל <b>${destination}</b>! איך אפשר לעזור עכשיו?`,
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

  const preparePostNavigationSurface = (): void => {
    ensureAssistantVisible(document);
    resetCategorySurface(document);
    clearAssistantDomOptions(document);
  };

  const showNavigationFeedback = (
    reason: FeedbackReason,
    destination: string,
    messageType: "navigation-status" | "navigation-feedback",
  ): void => {
    messages.append({
      sender: "assistant",
      html: feedbackText(document, reason, destination),
      messageType,
    });
  };

  const restoreMainMenu = (
    reason: FeedbackReason,
    destination: string,
  ): void => {
    if (destroyed) return;

    preparePostNavigationSurface();
    showNavigationFeedback(reason, destination, "navigation-feedback");
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

    // Preserve V2's immediate completion feedback while matching V1's delayed
    // menu restoration. This also clears any stale detail/category surface
    // before the final main menu is exposed again.
    preparePostNavigationSurface();
    showNavigationFeedback(reason, destination, "navigation-status");

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
