import {
  BusinessOnboardingHostController,
  type BusinessOnboardingHostSnapshot,
} from "@touristic/business/onboarding-host";

export interface BusinessOnboardingSurfaceOptions {
  readonly document?: Document;
  readonly host?: BusinessOnboardingHostController;
  readonly onSkip?: (snapshot: BusinessOnboardingHostSnapshot) => void;
  readonly onComplete?: (snapshot: BusinessOnboardingHostSnapshot) => void;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function renderProgress(snapshot: BusinessOnboardingHostSnapshot): string {
  const chapter = snapshot.chapter;
  if (!chapter) return `Etapa ${snapshot.stepNumber} de ${snapshot.totalSteps}`;
  return `Capítulo ${chapter.chapterNumber} de ${chapter.totalChapters} · Etapa ${chapter.chapterStepNumber} de ${chapter.chapterStepTotal}`;
}

export class BusinessOnboardingSurface {
  private readonly document: Document;
  private readonly host: BusinessOnboardingHostController;
  private readonly onSkip?: BusinessOnboardingSurfaceOptions["onSkip"];
  private readonly onComplete?: BusinessOnboardingSurfaceOptions["onComplete"];
  private root: HTMLElement | null = null;
  private busy = false;

  constructor(options: BusinessOnboardingSurfaceOptions = {}) {
    this.document = options.document ?? document;
    this.host = options.host ?? new BusinessOnboardingHostController();
    this.onSkip = options.onSkip;
    this.onComplete = options.onComplete;
  }

  mount(container: HTMLElement = this.document.body): HTMLElement {
    if (this.root?.isConnected) return this.root;

    const root = this.document.createElement("section");
    root.id = "businessOnboardingSurface";
    root.className = "business-onboarding-surface";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-labelledby", "businessOnboardingTitle");
    root.innerHTML = `
      <div class="business-onboarding-card">
        <div class="business-onboarding-header">
          <div>
            <p id="businessOnboardingProgress" class="business-onboarding-progress"></p>
            <h1 id="businessOnboardingTitle"></h1>
            <p id="businessOnboardingDescription"></p>
          </div>
          <button type="button" data-action="skip" aria-label="Pausar tutorial">×</button>
        </div>
        <div class="business-onboarding-body" aria-live="polite">
          <p id="businessOnboardingStep"></p>
          <div id="businessOnboardingStatus" role="status"></div>
        </div>
        <div class="business-onboarding-actions">
          <button type="button" data-action="back">Voltar</button>
          <button type="button" data-action="next">Continuar</button>
        </div>
      </div>
    `;
    root.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const action = target.dataset.action;
      if (!action || this.busy) return;
      void this.handleAction(action);
    });
    container.append(root);
    this.root = root;
    this.render();
    this.document.body.classList.add("md-business-tutorial-active");
    this.document.defaultView?.dispatchEvent(
      new CustomEvent("businessTutorialActivityChanged", {
        detail: { active: true },
      }),
    );
    return root;
  }

  snapshot(): BusinessOnboardingHostSnapshot {
    return this.host.snapshot();
  }

  setStatus(message: string): void {
    const status = this.root?.querySelector<HTMLElement>(
      "#businessOnboardingStatus",
    );
    if (status) status.textContent = message;
  }

  private setBusy(busy: boolean, label = ""): void {
    this.busy = busy;
    this.root?.setAttribute("aria-busy", String(busy));
    const buttons = this.root?.querySelectorAll<HTMLButtonElement>("button");
    buttons?.forEach((button) => {
      button.disabled = busy;
    });
    if (label) this.setStatus(label);
  }

  private async handleAction(action: string): Promise<void> {
    if (action === "skip") {
      const snapshot = this.host.pause("user_skip");
      this.onSkip?.(snapshot);
      this.destroy();
      return;
    }

    this.setBusy(true, action === "back" ? "Voltando..." : "Continuando...");
    try {
      if (action === "back") {
        await this.host.back();
      } else if (action === "next") {
        const before = this.host.snapshot();
        if (!before.canGoForward) {
          const completed = this.host.complete();
          this.onComplete?.(completed);
          this.destroy();
          return;
        }
        await this.host.next();
      }
      this.render();
    } finally {
      this.setBusy(false);
    }
  }

  render(): void {
    if (!this.root) return;
    const snapshot = this.host.snapshot();
    const chapter = snapshot.chapter;
    const progress = this.root.querySelector<HTMLElement>(
      "#businessOnboardingProgress",
    );
    const title = this.root.querySelector<HTMLElement>(
      "#businessOnboardingTitle",
    );
    const description = this.root.querySelector<HTMLElement>(
      "#businessOnboardingDescription",
    );
    const step = this.root.querySelector<HTMLElement>(
      "#businessOnboardingStep",
    );
    const back = this.root.querySelector<HTMLButtonElement>(
      '[data-action="back"]',
    );
    const next = this.root.querySelector<HTMLButtonElement>(
      '[data-action="next"]',
    );

    if (progress) progress.textContent = renderProgress(snapshot);
    if (title)
      title.textContent =
        text(chapter?.title) || "Seu negócio no Morro Digital";
    if (description) description.textContent = text(chapter?.description);
    if (step) step.textContent = `Etapa atual: ${snapshot.stepId}`;
    if (back) back.hidden = !snapshot.canGoBack;
    if (next)
      next.textContent = snapshot.canGoForward ? "Continuar" : "Concluir";
    this.setStatus("");
  }

  destroy(): void {
    this.root?.remove();
    this.root = null;
    this.document.body.classList.remove("md-business-tutorial-active");
    this.document.defaultView?.dispatchEvent(
      new CustomEvent("businessTutorialActivityChanged", {
        detail: { active: false },
      }),
    );
  }
}

export function mountBusinessOnboardingSurface(
  options: BusinessOnboardingSurfaceOptions = {},
): BusinessOnboardingSurface {
  const surface = new BusinessOnboardingSurface(options);
  surface.mount();
  return surface;
}
