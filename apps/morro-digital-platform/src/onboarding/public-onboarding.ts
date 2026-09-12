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

function createOnboardingMarkup(document: Document): HTMLElement {
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
          <h1 id="public-onboarding-title" class="onboarding-headline">Bem-vindo ao Morro Digital</h1>
          <p id="public-onboarding-description" class="onboarding-subheadline">
            Seu guia inteligente para descobrir Morro de São Paulo.
          </p>
        </div>
      </div>

      <section data-public-onboarding-step="intro" class="onboarding-profile-section">
        <h2 class="profile-section-title">Pronto para explorar?</h2>
        <p class="profile-section-subtitle">
          Conheça rapidamente os principais recursos ou vá direto para o mapa.
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
              Veja como usar o mapa, o assistente e a navegação.
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
      </section>

      <section
        data-public-onboarding-step="tutorial"
        class="onboarding-profile-section"
        hidden
      >
        <h2 class="profile-section-title">Tudo em um só lugar</h2>
        <p class="profile-section-subtitle">
          Explore Morro de São Paulo no seu ritmo. Nenhum roteiro é iniciado automaticamente.
        </p>
        <div class="profile-cards">
          <div class="profile-card" aria-label="Mapa interativo">
            <span class="profile-card-icon" aria-hidden="true">🗺️</span>
            <span class="profile-card-title">Mapa</span>
            <span class="profile-card-desc">Descubra lugares e escolha o que quer explorar.</span>
          </div>
          <div class="profile-card" aria-label="Assistente digital">
            <span class="profile-card-icon" aria-hidden="true">✨</span>
            <span class="profile-card-title">Assistente</span>
            <span class="profile-card-desc">Peça sugestões quando quiser, sem bloquear o mapa.</span>
          </div>
          <div class="profile-card" aria-label="Rotas e navegação">
            <span class="profile-card-icon" aria-hidden="true">🧭</span>
            <span class="profile-card-title">Rotas</span>
            <span class="profile-card-desc">Inicie navegação e roteiros somente quando escolher.</span>
          </div>
        </div>
        <button
          id="public-onboarding-finish"
          class="profile-card profile-card-single"
          type="button"
          data-public-onboarding-action="complete"
        >
          <span class="profile-card-title">Começar a explorar</span>
        </button>
        <button
          class="biz-setup-back"
          type="button"
          data-public-onboarding-action="back"
        >
          Voltar
        </button>
      </section>
    </div>
  `;

  return overlay;
}

function isFocusableInActiveStep(element: HTMLElement): boolean {
  return !element.closest<HTMLElement>("[hidden]") && !element.hidden;
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
    options.document.removeEventListener("keydown", onKeyDown, true);

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

  const setStep = (step: "intro" | "tutorial"): void => {
    if (!overlay) return;
    overlay
      .querySelectorAll<HTMLElement>("[data-public-onboarding-step]")
      .forEach((element) => {
        element.hidden = element.dataset.publicOnboardingStep !== step;
      });
    overlay
      .querySelector<HTMLElement>(
        step === "intro"
          ? '[data-public-onboarding-action="start"]'
          : '[data-public-onboarding-action="complete"]',
      )
      ?.focus();
  };

  const start = (): void => {
    if (destroyed || !overlay) return;
    state = "in_progress";
    setStep("tutorial");
    dispatch(PUBLIC_ONBOARDING_START_EVENT);
  };

  const back = (): void => {
    if (destroyed || !overlay) return;
    state = "not_started";
    setStep("intro");
  };

  function onKeyDown(event: KeyboardEvent): void {
    const currentOverlay = overlay;
    if (!currentOverlay) return;

    if (event.key === "Escape") {
      event.preventDefault();
      skip();
      return;
    }

    if (event.key !== "Tab") return;

    const focusable = Array.from(
      currentOverlay.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    ).filter(isFocusableInActiveStep);
    if (focusable.length === 0) {
      event.preventDefault();
      currentOverlay.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = options.document.activeElement;
    if (!first || !last) return;

    if (
      event.shiftKey &&
      (active === first || !currentOverlay.contains(active))
    ) {
      event.preventDefault();
      last.focus();
      return;
    }

    if (
      !event.shiftKey &&
      (active === last || !currentOverlay.contains(active))
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
      if (destroyed || state !== "not_started" || overlay) return false;
      if (hasCompletedPublicOnboarding(storage)) {
        state = "completed";
        return false;
      }

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
      options.document.addEventListener("keydown", onKeyDown, true);

      overlay
        .querySelector<HTMLElement>('[data-public-onboarding-action="start"]')
        ?.addEventListener("click", start);
      overlay
        .querySelector<HTMLElement>('[data-public-onboarding-action="skip"]')
        ?.addEventListener("click", skip, { once: true });
      overlay
        .querySelector<HTMLElement>(
          '[data-public-onboarding-action="complete"]',
        )
        ?.addEventListener("click", complete, { once: true });
      overlay
        .querySelector<HTMLElement>('[data-public-onboarding-action="back"]')
        ?.addEventListener("click", back);

      setStep("intro");
      return true;
    },

    complete,
    skip,

    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      removeOverlay(false);
      options.document.removeEventListener(
        PUBLIC_ONBOARDING_COMPLETE_EVENT,
        onDocumentComplete,
      );
    },
  });
}
