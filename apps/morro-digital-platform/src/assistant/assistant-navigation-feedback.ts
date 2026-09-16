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
const NAVIGATION_REQUEST_EVENT = "morro:navigation-requested";
const EXPLORE_RESET_REQUEST_EVENT = "morro:explore-reset-requested";
const COORDINATE_DESTINATION_PATTERN =
  /^-?\d{1,2}(?:\.\d+)?\s*,\s*-?\d{1,3}(?:\.\d+)?$/u;

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

function mainCategoryMenu(document: Document): HTMLElement | null {
  const containers = Array.from(
    document.querySelectorAll<HTMLElement>(
      "#assistant-messages .messages-area > .assistant-options",
    ),
  );
  return (
    containers.find((container) =>
      container.querySelector("[data-explore-category]"),
    ) ?? null
  );
}

function showMainCategoryMenu(document: Document): void {
  const menu = mainCategoryMenu(document);
  if (!menu) return;

  // Keep the V1 modal reading order deterministic: the active assistant text
  // is always the first surface, followed by the available action/category
  // options. Re-appending the persistent shell menu moves it below the latest
  // feedback without recreating listeners or changing button identity/state.
  const area = menu.parentElement;
  if (area?.classList.contains("messages-area")) area.appendChild(menu);

  delete menu.dataset.singleMessageHidden;
  menu.classList.remove("hidden");
  menu.setAttribute("aria-hidden", "false");
}

function dispatchExploreReset(document: Document): void {
  if (typeof document.dispatchEvent !== "function") return;
  const CustomEventConstructor =
    document.defaultView?.CustomEvent ?? globalThis.CustomEvent;
  if (typeof CustomEventConstructor !== "function") return;
  document.dispatchEvent(
    new CustomEventConstructor(EXPLORE_RESET_REQUEST_EVENT),
  );
}

function resetCategorySurface(document: Document): void {
  // Route the reset through the owning Explore controller rather than through
  // the assistant option pipeline. This invalidates pending async Explore work
  // without creating an artificial user command or fallback assistant reply.
  dispatchExploreReset(document);
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
  if (typeof candidate !== "string") return "";
  const normalized = candidate.trim();
  if (!normalized || COORDINATE_DESTINATION_PATTERN.test(normalized)) return "";
  return normalized;
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
  const canListenToNavigationRequests =
    typeof document.addEventListener === "function" &&
    typeof document.removeEventListener === "function";
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

  const restoreMainMenuSurface = (): void => {
    if (destroyed) return;
    preparePostNavigationSurface();
    showMainCategoryMenu(document);
  };

  const onNavigationStarting = (): void => {
    clearRestoreTimer();
  };

  const onNavigationEnded = (event: Event): void => {
    if (destroyed || !(event instanceof CustomEvent)) return;
    const detail = event.detail as { readonly reason?: unknown } | null;
    const reason = detail?.reason;
    if (reason !== "arrived" && reason !== "cancelled") return;

    clearRestoreTimer();
    const destination = destinationFromDetail(event.detail);

    // V1 restores the category menu after navigation teardown. V2 also needs
    // completion feedback synchronously because existing arrival/cancellation
    // consumers read it as soon as `navigationEnded` fires. High priority
    // bypasses duplicate suppression so every completed navigation can restore
    // the canonical assistant surface.
    preparePostNavigationSurface();
    messages.append({
      sender: "assistant",
      html: feedbackText(document, reason, destination),
      messageType: "navigation-feedback",
      priority: "high",
    });
    showMainCategoryMenu(document);

    if (view) {
      restoreTimer = view.setTimeout(() => {
        restoreTimer = undefined;
        restoreMainMenuSurface();
      }, V1_POST_NAVIGATION_MENU_DELAY_MS);
      return;
    }

    restoreMainMenuSurface();
  };

  if (canListenToNavigationRequests) {
    document.addEventListener(NAVIGATION_REQUEST_EVENT, onNavigationStarting);
  }
  view?.addEventListener("navigationStarted", onNavigationStarting);
  view?.addEventListener("navigationEnded", onNavigationEnded);

  return Object.freeze({
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      clearRestoreTimer();
      if (canListenToNavigationRequests) {
        document.removeEventListener(
          NAVIGATION_REQUEST_EVENT,
          onNavigationStarting,
        );
      }
      view?.removeEventListener("navigationStarted", onNavigationStarting);
      view?.removeEventListener("navigationEnded", onNavigationEnded);
    },
  });
}
