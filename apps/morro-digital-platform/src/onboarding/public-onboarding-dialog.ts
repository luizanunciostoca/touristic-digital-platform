import { getPublicOnboardingCopy } from "./public-onboarding-i18n.js";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export interface PublicOnboardingDialogHostSnapshot {
  readonly previousBodyOverflow: string;
  readonly previousDocumentOverflow: string;
  readonly previouslyFocusedElement: HTMLElement | null;
  readonly backgroundInertState: ReadonlyMap<HTMLElement, boolean>;
}

export function createPublicOnboardingDialog(document: Document): HTMLElement {
  const copy = getPublicOnboardingCopy(document.documentElement.lang);
  const overlay = document.createElement("section");
  overlay.id = "onboarding-overlay";
  overlay.className = "onboarding-overlay";
  overlay.tabIndex = -1;
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

export function activatePublicOnboardingDialogHost(
  document: Document,
): PublicOnboardingDialogHostSnapshot {
  const backgroundInertState = new Map<HTMLElement, boolean>();
  for (const child of Array.from(document.body.children)) {
    if (!(child instanceof HTMLElement)) continue;
    backgroundInertState.set(child, child.inert);
    child.inert = true;
  }

  const snapshot = Object.freeze({
    previousBodyOverflow: document.body.style.overflow,
    previousDocumentOverflow: document.documentElement.style.overflow,
    previouslyFocusedElement:
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null,
    backgroundInertState,
  });

  document.body.classList.add("public-onboarding-open");
  document.body.style.overflow = "hidden";
  document.documentElement.style.overflow = "hidden";
  return snapshot;
}

export function restorePublicOnboardingDialogHost(
  document: Document,
  snapshot: PublicOnboardingDialogHostSnapshot,
): void {
  document.body.classList.remove("public-onboarding-open");
  document.body.style.overflow = snapshot.previousBodyOverflow;
  document.documentElement.style.overflow = snapshot.previousDocumentOverflow;
  for (const [element, wasInert] of snapshot.backgroundInertState) {
    element.inert = wasInert;
  }
  if (snapshot.previouslyFocusedElement?.isConnected) {
    snapshot.previouslyFocusedElement.focus();
  }
}

export function trapPublicOnboardingDialogFocus(input: {
  readonly event: KeyboardEvent;
  readonly overlay: HTMLElement;
  readonly onEscape: () => void;
}): void {
  const { event, overlay, onEscape } = input;
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    onEscape();
    return;
  }

  if (event.key !== "Tab") return;
  const focusable = Array.from(
    overlay.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  );
  if (focusable.length === 0) {
    event.preventDefault();
    overlay.focus();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const activeElement = overlay.ownerDocument.activeElement;
  if (!first || !last) return;

  if (
    event.shiftKey &&
    (activeElement === first || !overlay.contains(activeElement))
  ) {
    event.preventDefault();
    last.focus();
  } else if (
    !event.shiftKey &&
    (activeElement === last || !overlay.contains(activeElement))
  ) {
    event.preventDefault();
    first.focus();
  }
}
