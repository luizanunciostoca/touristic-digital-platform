export const PUBLIC_ONBOARDING_STORAGE_KEY = "morro-digital-onboarded";
export const PUBLIC_ONBOARDING_START_EVENT = "morro:public-onboarding-start";
export const PUBLIC_ONBOARDING_COMPLETE_EVENT =
  "morro:public-onboarding-complete";
export const PUBLIC_ONBOARDING_SKIP_EVENT = "morro:public-onboarding-skip";

export type PublicOnboardingState =
  | "not_started"
  | "in_progress"
  | "skipped"
  | "completed";

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

function createOnboardingMarkup(document: Document): HTMLElement {
  const overlay = document.createElement("section");
  overlay.id = "onboarding-overlay";
  overlay.className = "onboarding-overlay";
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
          <h1 id="public-onboarding-title" class="onboarding-headline">Bem-vindo ao Morro Digital</h1>
          <p id="public-onboarding-description" class="onboarding-subheadline">
            Seu guia inteligente para descobrir Morro de São Paulo.
          </p>
        </div>
      </div>
      <div class="onboarding-profile-section">
        <h2 class="profile-section-title">Pronto para explorar?</h2>
        <p class="profile-section-subtitle">
          Conheça rapidamente o aplicativo ou vá direto para o mapa.
        </p>
        <div class="profile-cards profile-cards--single">
          <button
            id="ob-profile-tourist"
            class="profile-card profile-card-single"
            type="button"
            data-public-onboarding-action="start"
          >
            <span class="profile-card-icon" aria-hidden="true">🌴</span>
            <span class="profile-card-title">Conhecer o App</span>
            <span class="profile-card-desc">
              Veja como usar o mapa, o assistente e os principais recursos.
            </span>
          </button>
        </div>
        <button
          class="biz-setup-back"
          type="button"
          data-public-onboarding-action="skip"
        >
          Pular por agora
        </button>
      </div>
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
  let destroyed = false;

  const unlockBackground = (): void => {
    options.document.body.classList.remove("public-onboarding-open");
    options.document.body.style.overflow = previousBodyOverflow;
    options.document.documentElement.style.overflow = previousDocumentOverflow;
  };

  const removeOverlay = (): void => {
    if (!overlay) return;
    const currentOverlay = overlay;
    overlay = null;
    currentOverlay.classList.add("onboarding-exit");
    options.document.defaultView?.setTimeout(() => currentOverlay.remove(), 620);
    unlockBackground();
  };

  const dispatch = (name: string): void => {
    options.document.dispatchEvent(
      new CustomEvent(name, {
        bubbles: false,
        detail: Object.freeze({ state }),
      }),
    );
  };

  const complete = (): void => {
    if (destroyed) return;
    state = "completed";
    persistPublicOnboardingCompletion(storage);
    removeOverlay();
  };

  const skip = (): void => {
    if (destroyed) return;
    state = "skipped";
    persistPublicOnboardingCompletion(storage);
    removeOverlay();
    dispatch(PUBLIC_ONBOARDING_SKIP_EVENT);
  };

  const start = (): void => {
    if (destroyed) return;
    state = "in_progress";
    removeOverlay();
    dispatch(PUBLIC_ONBOARDING_START_EVENT);
  };

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
      if (destroyed || state !== "not_started" || overlay) return false;
      if (hasCompletedPublicOnboarding(storage)) {
        state = "completed";
        return false;
      }

      overlay = createOnboardingMarkup(options.document);
      previousBodyOverflow = options.document.body.style.overflow;
      previousDocumentOverflow = options.document.documentElement.style.overflow;
      options.document.body.classList.add("public-onboarding-open");
      options.document.body.style.overflow = "hidden";
      options.document.documentElement.style.overflow = "hidden";
      options.document.body.appendChild(overlay);

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
      removeOverlay();
      options.document.removeEventListener(
        PUBLIC_ONBOARDING_COMPLETE_EVENT,
        onDocumentComplete,
      );
    },
  });
}
