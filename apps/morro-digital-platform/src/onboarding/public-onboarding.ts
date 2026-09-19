import { getPublicOnboardingCopy } from "./public-onboarding-i18n.js";
import {
  ensureV1AssistantWelcomeVisible,
  installPublicInteractiveTour,
  type PublicInteractiveTourController,
} from "./public-interactive-tour.js";

export const PUBLIC_ONBOARDING_STORAGE_KEY = "morro-digital-onboarded";
export const PUBLIC_ONBOARDING_START_EVENT = "morro:public-onboarding-start";
export const PUBLIC_ONBOARDING_COMPLETE_EVENT =
  "morro:public-onboarding-complete";
export const PUBLIC_ONBOARDING_SKIP_EVENT = "morro:public-onboarding-skip";

export type PublicOnboardingState =
  "not_started" | "in_progress" | "skipped" | "completed";

export interface PublicOnboardingStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface PublicOnboardingController {
  readonly state: PublicOnboardingState;
  showIfNeeded(): boolean;
  complete(): void;
  skip(): void;
  destroy(): void;
}

export interface InstallPublicOnboardingOptions {
  readonly document: Document;
  readonly storage?: PublicOnboardingStorage | null;
}

const ONBOARDING_EXIT_MS = 620;
const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function hasCompletedPublicOnboarding(
  storage: PublicOnboardingStorage | null | undefined,
): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(PUBLIC_ONBOARDING_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function persistPublicOnboardingCompletion(
  storage: PublicOnboardingStorage | null | undefined,
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(PUBLIC_ONBOARDING_STORAGE_KEY, "1");
    return true;
  } catch {
    return false;
  }
}

function resolveStorage(document: Document): PublicOnboardingStorage | null {
  try {
    return document.defaultView?.localStorage ?? null;
  } catch {
    return null;
  }
}

function setOnboardingSettled(document: Document, settled: boolean): void {
  if (settled) {
    document.body.setAttribute("data-public-onboarding-settled", "true");
  } else {
    document.body.removeAttribute("data-public-onboarding-settled");
  }
}

function createOnboardingMarkup(document: Document): HTMLElement {
  const copy = getPublicOnboardingCopy(document.documentElement.lang);
  const overlay = document.createElement("section");
  overlay.id = "onboarding-overlay";
  overlay.className = "onboarding-overlay";
  overlay.style.pointerEvents = "auto";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "public-onboarding-title");
  overlay.setAttribute("aria-describedby", "public-onboarding-description");

  overlay.innerHTML = `
    <div class="onboarding-bg" aria-hidden="true"></div>
    <div class="onboarding-container">
      <div class="onboarding-header">
        <div class="onboarding-logo-overlay" aria-hidden="true"></div>
        <div class="onboarding-title-block">
          <h1 id="public-onboarding-title" class="onboarding-headline">${copy.title}</h1>
          <p id="public-onboarding-description" class="onboarding-subheadline">
            ${copy.description}
          </p>
        </div>
      </div>

      <section class="onboarding-profile-section">
        <h2 class="profile-section-title">${copy.readyTitle}</h2>
        <p class="profile-section-subtitle">
          ${copy.readyDescription}
        </p>
        <div class="profile-cards profile-cards--single">
          <button
            id="ob-profile-tourist"
            class="profile-card profile-card-single profile-card-tutorial"
            type="button"
            data-public-onboarding-action="start"
          >
            <span class="profile-card-icon" aria-hidden="true">🌴</span>
            <span class="profile-card-title">${copy.startTitle}</span>
            <span class="profile-card-desc">
              ${copy.startDescription}
            </span>
          </button>
        </div>
        <button
          class="biz-setup-back"
          type="button"
          data-public-onboarding-action="skip"
        >
          ${copy.skip}
        </button>
      </section>
    </div>
  `;

  return overlay;
}

export function installPublicOnboarding(
  options: InstallPublicOnboardingOptions,
): PublicOnboardingController {
  const storage = options.storage ?? resolveStorage(options.document);
  let state: PublicOnboardingState = hasCompletedPublicOnboarding(storage)
    ? "completed"
    : "not_started";
  let overlay: HTMLElement | null = null;
  let previousBodyOverflow = "";
  let previousDocumentOverflow = "";
  let previouslyFocusedElement: HTMLElement | null = null;
  let backgroundInertState = new Map<HTMLElement, boolean>();
  let destroyed = false;
  let interactiveTour: PublicInteractiveTourController | null = null;

  setOnboardingSettled(options.document, false);

  const dispatch = (name: string): void => {
    options.document.dispatchEvent(
      new CustomEvent(name, {
        bubbles: false,
        detail: Object.freeze({ state }),
      }),
    );
  };

  const restoreBackground = (): void => {
    options.document.body.classList.remove("public-onboarding-open");
    options.document.body.style.overflow = previousBodyOverflow;
    options.document.documentElement.style.overflow = previousDocumentOverflow;
    for (const [element, wasInert] of backgroundInertState) {
      element.inert = wasInert;
    }
    backgroundInertState = new Map();
  };

  const restoreFocus = (): void => {
    if (previouslyFocusedElement?.isConnected) {
      previouslyFocusedElement.focus();
    }
    previouslyFocusedElement = null;
  };

  const finishOverlayRemoval = (currentOverlay: HTMLElement): void => {
    currentOverlay.remove();
    restoreBackground();
    restoreFocus();
  };

  const removeOverlay = (animate = true): void => {
    if (!overlay) return;
    const currentOverlay = overlay;
    overlay = null;
    options.document.removeEventListener("keydown", onOverlayKeyDown, true);

    if (!animate) {
      finishOverlayRemoval(currentOverlay);
      return;
    }

    currentOverlay.classList.add("onboarding-exit");
    options.document.defaultView?.setTimeout(
      () => finishOverlayRemoval(currentOverlay),
      ONBOARDING_EXIT_MS,
    );
  };

  const persistCompletedState = (nextState: "completed" | "skipped"): void => {
    state = nextState;
    persistPublicOnboardingCompletion(storage);
    ensureV1AssistantWelcomeVisible(options.document);
    setOnboardingSettled(options.document, true);
  };

  const completeFromTour = (): void => {
    if (destroyed) return;
    persistCompletedState("completed");
  };

  const skipFromTour = (): void => {
    if (destroyed) return;
    persistCompletedState("skipped");
    dispatch(PUBLIC_ONBOARDING_SKIP_EVENT);
  };

  interactiveTour = installPublicInteractiveTour({
    document: options.document,
    onComplete: completeFromTour,
    onSkip: skipFromTour,
  });

  const complete = (): void => {
    if (destroyed) return;
    interactiveTour?.destroy();
    removeOverlay();
    persistCompletedState("completed");
  };

  const skip = (): void => {
    if (destroyed) return;
    interactiveTour?.destroy();
    removeOverlay();
    persistCompletedState("skipped");
    dispatch(PUBLIC_ONBOARDING_SKIP_EVENT);
  };

  const start = (): void => {
    if (destroyed || !overlay) return;
    state = "in_progress";
    setOnboardingSettled(options.document, false);
    removeOverlay(false);
    dispatch(PUBLIC_ONBOARDING_START_EVENT);
    interactiveTour?.start();
  };

  function onOverlayKeyDown(event: KeyboardEvent): void {
    const currentOverlay = overlay;
    if (!currentOverlay) return;

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      skip();
      return;
    }

    if (event.key !== "Tab") return;
    const focusable = Array.from(
      currentOverlay.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    );
    if (focusable.length === 0) {
      event.preventDefault();
      currentOverlay.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const activeElement = options.document.activeElement;
    if (!first || !last) return;

    if (
      event.shiftKey &&
      (activeElement === first || !currentOverlay.contains(activeElement))
    ) {
      event.preventDefault();
      last.focus();
    } else if (
      !event.shiftKey &&
      (activeElement === last || !currentOverlay.contains(activeElement))
    ) {
      event.preventDefault();
      first.focus();
    }
  }

  const onDocumentComplete = (): void => {
    complete();
  };

  options.document.addEventListener(
    PUBLIC_ONBOARDING_COMPLETE_EVENT,
    onDocumentComplete,
  );

  return Object.freeze({
    get state(): PublicOnboardingState {
      return state;
    },

    showIfNeeded(): boolean {
      if (destroyed || overlay || interactiveTour?.active) return false;
      if (hasCompletedPublicOnboarding(storage)) {
        state = "completed";
        ensureV1AssistantWelcomeVisible(options.document);
        setOnboardingSettled(options.document, true);
        return false;
      }
      if (state !== "not_started") return false;

      overlay = createOnboardingMarkup(options.document);
      previouslyFocusedElement =
        options.document.activeElement instanceof HTMLElement
          ? options.document.activeElement
          : null;
      previousBodyOverflow = options.document.body.style.overflow;
      previousDocumentOverflow =
        options.document.documentElement.style.overflow;
      backgroundInertState = new Map();
      for (const child of Array.from(options.document.body.children)) {
        if (child instanceof HTMLElement) {
          backgroundInertState.set(child, child.inert);
          child.inert = true;
        }
      }

      options.document.body.classList.add("public-onboarding-open");
      options.document.body.style.overflow = "hidden";
      options.document.documentElement.style.overflow = "hidden";
      options.document.body.appendChild(overlay);
      options.document.addEventListener("keydown", onOverlayKeyDown, true);

      overlay
        .querySelector<HTMLElement>('[data-public-onboarding-action="start"]')
        ?.addEventListener("click", start, { once: true });
      overlay
        .querySelector<HTMLElement>('[data-public-onboarding-action="skip"]')
        ?.addEventListener("click", skip, { once: true });
      overlay
        .querySelector<HTMLElement>('[data-public-onboarding-action="start"]')
        ?.focus();
      return true;
    },

    complete,
    skip,

    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      interactiveTour?.destroy();
      removeOverlay(false);
      setOnboardingSettled(options.document, false);
      options.document.removeEventListener(
        PUBLIC_ONBOARDING_COMPLETE_EVENT,
        onDocumentComplete,
      );
    },
  });
}
