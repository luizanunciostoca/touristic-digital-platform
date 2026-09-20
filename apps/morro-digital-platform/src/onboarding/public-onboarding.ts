import {
  ensureV1AssistantWelcomeVisible,
  installPublicInteractiveTour,
  type PublicInteractiveTourController,
} from "./public-interactive-tour.js";
import {
  activatePublicOnboardingDialogHost,
  createPublicOnboardingDialog,
  restorePublicOnboardingDialogHost,
  trapPublicOnboardingDialogFocus,
  type PublicOnboardingDialogHostSnapshot,
} from "./public-onboarding-dialog.js";
import {
  hasCompletedPublicOnboarding,
  persistPublicOnboardingCompletion,
  resolvePublicOnboardingStorage,
  type PublicOnboardingStorage,
} from "./public-onboarding-storage.js";

export {
  hasCompletedPublicOnboarding,
  persistPublicOnboardingCompletion,
  PUBLIC_ONBOARDING_STORAGE_KEY,
} from "./public-onboarding-storage.js";
export type { PublicOnboardingStorage } from "./public-onboarding-storage.js";

export const PUBLIC_ONBOARDING_START_EVENT = "morro:public-onboarding-start";
export const PUBLIC_ONBOARDING_COMPLETE_EVENT =
  "morro:public-onboarding-complete";
export const PUBLIC_ONBOARDING_SKIP_EVENT = "morro:public-onboarding-skip";

export type PublicOnboardingState =
  "not_started" | "in_progress" | "skipped" | "completed";

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

function setOnboardingSettled(document: Document, settled: boolean): void {
  if (settled) {
    document.body.setAttribute("data-public-onboarding-settled", "true");
  } else {
    document.body.removeAttribute("data-public-onboarding-settled");
  }
}

export function installPublicOnboarding(
  options: InstallPublicOnboardingOptions,
): PublicOnboardingController {
  const storage =
    options.storage ?? resolvePublicOnboardingStorage(options.document);
  let state: PublicOnboardingState = hasCompletedPublicOnboarding(storage)
    ? "completed"
    : "not_started";
  let overlay: HTMLElement | null = null;
  let dialogHostSnapshot: PublicOnboardingDialogHostSnapshot | null = null;
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

  const restoreDialogHost = (): void => {
    if (!dialogHostSnapshot) return;
    restorePublicOnboardingDialogHost(options.document, dialogHostSnapshot);
    dialogHostSnapshot = null;
  };

  const finishOverlayRemoval = (currentOverlay: HTMLElement): void => {
    currentOverlay.remove();
    restoreDialogHost();
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
    trapPublicOnboardingDialogFocus({
      event,
      overlay: currentOverlay,
      onEscape: skip,
    });
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

      overlay = createPublicOnboardingDialog(options.document);
      dialogHostSnapshot = activatePublicOnboardingDialogHost(options.document);
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
