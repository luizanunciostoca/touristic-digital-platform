import {
  type BusinessOnboardingHostController,
  type BusinessOnboardingHostSnapshot,
} from "@touristic/business/onboarding-host";

import type { BusinessOnboardingSurface } from "./business-onboarding-surface.js";

export interface BusinessOnboardingBrowserLifecycleOptions {
  readonly document?: Document;
  readonly host: BusinessOnboardingHostController;
  readonly surface: BusinessOnboardingSurface;
  readonly onPause?: (snapshot: BusinessOnboardingHostSnapshot) => void;
  readonly onRestart?: (snapshot: BusinessOnboardingHostSnapshot) => void;
  readonly onStepEnter?: (
    snapshot: BusinessOnboardingHostSnapshot,
  ) => void | Promise<void>;
}

const FOCUSABLE_SELECTOR = [
  "button:not([disabled]):not([hidden])",
  "input:not([disabled]):not([hidden])",
  "select:not([disabled]):not([hidden])",
  "textarea:not([disabled]):not([hidden])",
  "a[href]",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function isFocusable(element: HTMLElement): boolean {
  return !element.hidden && element.getAttribute("aria-hidden") !== "true";
}

export class BusinessOnboardingBrowserLifecycle {
  private readonly document: Document;
  private readonly host: BusinessOnboardingHostController;
  private readonly surface: BusinessOnboardingSurface;
  private readonly onPause?: BusinessOnboardingBrowserLifecycleOptions["onPause"];
  private readonly onRestart?: BusinessOnboardingBrowserLifecycleOptions["onRestart"];
  private readonly onStepEnter?: BusinessOnboardingBrowserLifecycleOptions["onStepEnter"];
  private readonly previousFocus: HTMLElement | null;
  private root: HTMLElement | null = null;
  private titleObserver: MutationObserver | null = null;
  private disposed = false;

  constructor(options: BusinessOnboardingBrowserLifecycleOptions) {
    this.document = options.document ?? document;
    this.host = options.host;
    this.surface = options.surface;
    this.onPause = options.onPause;
    this.onRestart = options.onRestart;
    this.onStepEnter = options.onStepEnter;
    this.previousFocus =
      this.document.activeElement instanceof HTMLElement
        ? this.document.activeElement
        : null;
  }

  install(): void {
    const root = this.document.querySelector<HTMLElement>(
      "#businessOnboardingSurface",
    );
    if (!root || this.root === root) return;
    this.root = root;
    root.setAttribute("aria-describedby", "businessOnboardingDescription");
    root.setAttribute("aria-busy", "false");

    const title = root.querySelector<HTMLElement>("#businessOnboardingTitle");
    title?.setAttribute("tabindex", "-1");
    const status = root.querySelector<HTMLElement>("#businessOnboardingStatus");
    status?.setAttribute("aria-live", "polite");
    status?.setAttribute("aria-atomic", "true");

    const skip = root.querySelector<HTMLButtonElement>('[data-action="skip"]');
    skip?.setAttribute("aria-label", "Pular tutorial por agora");

    const actions = root.querySelector<HTMLElement>(
      ".business-onboarding-actions",
    );
    const back = actions?.querySelector<HTMLElement>('[data-action="back"]');
    if (actions && back) {
      const pause = this.createLifecycleButton("pause", "Pausar e sair");
      const restart = this.createLifecycleButton("restart", "Reiniciar");
      actions.insertBefore(pause, back);
      actions.insertBefore(restart, back);
    }

    root.addEventListener("click", this.handleClick);
    root.addEventListener("keydown", this.handleKeyDown);
    this.document.defaultView?.addEventListener(
      "businessTutorialActivityChanged",
      this.handleActivityChanged,
    );

    if (title && this.document.defaultView?.MutationObserver) {
      this.titleObserver = new this.document.defaultView.MutationObserver(() => {
        this.focusTitle();
      });
      this.titleObserver.observe(title, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    }
    this.focusTitle();
  }

  private createLifecycleButton(
    action: "pause" | "restart",
    label: string,
  ): HTMLButtonElement {
    const button = this.document.createElement("button");
    button.type = "button";
    button.dataset.browserLifecycleAction = action;
    button.className = "business-onboarding-lifecycle-action";
    button.textContent = label;
    return button;
  }

  private readonly handleClick = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest<HTMLButtonElement>(
      "[data-browser-lifecycle-action]",
    );
    if (!button || button.disabled) return;
    const action = button.dataset.browserLifecycleAction;
    if (action === "pause") {
      this.pause();
    } else if (action === "restart") {
      void this.restart();
    }
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (!this.root || this.disposed) return;
    if (event.key === "Escape") {
      event.preventDefault();
      this.pause();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = Array.from(
      this.root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    ).filter(isFocusable);
    if (focusable.length === 0) {
      event.preventDefault();
      this.focusTitle();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = this.document.activeElement;
    if (!first || !last) return;
    if (event.shiftKey && (active === first || !this.root.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  private readonly handleActivityChanged = (event: Event): void => {
    if (!(event instanceof CustomEvent) || event.detail?.active !== false) return;
    this.dispose(true);
  };

  private pause(): void {
    if (this.disposed || !this.root?.isConnected) return;
    const snapshot = this.host.pause("user_pause");
    this.onPause?.(snapshot);
    this.surface.destroy();
  }

  private async restart(): Promise<void> {
    if (this.disposed || !this.root?.isConnected) return;
    const snapshot = this.host.restart();
    this.surface.render();
    this.onRestart?.(snapshot);
    await this.onStepEnter?.(snapshot);
    this.surface.render();
    this.focusTitle();
  }

  private focusTitle(): void {
    if (this.disposed || !this.root?.isConnected) return;
    this.root
      .querySelector<HTMLElement>("#businessOnboardingTitle")
      ?.focus({ preventScroll: true });
  }

  dispose(restoreFocus = false): void {
    if (this.disposed) return;
    this.disposed = true;
    this.titleObserver?.disconnect();
    this.titleObserver = null;
    this.root?.removeEventListener("click", this.handleClick);
    this.root?.removeEventListener("keydown", this.handleKeyDown);
    this.document.defaultView?.removeEventListener(
      "businessTutorialActivityChanged",
      this.handleActivityChanged,
    );
    this.root = null;

    if (restoreFocus && this.previousFocus?.isConnected) {
      this.previousFocus.focus({ preventScroll: true });
    }
  }
}
