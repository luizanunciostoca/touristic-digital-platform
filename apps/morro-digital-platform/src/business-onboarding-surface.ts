import {
  BusinessOnboardingHostController,
  type BusinessOnboardingHostSnapshot,
} from "@touristic/business/onboarding-host";
import { resolveBusinessOnboardingStep } from "@touristic/business/onboarding-presentation";
import { validateBusinessOnboardingStepInput } from "@touristic/business/onboarding-steps";

export interface BusinessOnboardingSurfaceOptions {
  readonly document?: Document;
  readonly host?: BusinessOnboardingHostController;
  readonly onSkip?: (snapshot: BusinessOnboardingHostSnapshot) => void;
  readonly onComplete?: (snapshot: BusinessOnboardingHostSnapshot) => void;
  readonly onStepEnter?: (
    snapshot: BusinessOnboardingHostSnapshot,
  ) => void | Promise<void>;
  readonly onRuntimeAction?: (action: string) => boolean | Promise<boolean>;
}

function renderProgress(snapshot: BusinessOnboardingHostSnapshot): string {
  const chapter = snapshot.chapter;
  if (!chapter) return `Etapa ${snapshot.stepNumber} de ${snapshot.totalSteps}`;
  return `Capítulo ${chapter.chapterNumber} de ${chapter.totalChapters} · Etapa ${chapter.chapterStepNumber} de ${chapter.chapterStepTotal}`;
}

function contextValue(
  snapshot: BusinessOnboardingHostSnapshot,
  field: string | undefined,
): unknown {
  if (!field) return undefined;
  return snapshot.session.conversationDraft.context[field];
}

export class BusinessOnboardingSurface {
  private readonly document: Document;
  private readonly host: BusinessOnboardingHostController;
  private readonly onSkip?: BusinessOnboardingSurfaceOptions["onSkip"];
  private readonly onComplete?: BusinessOnboardingSurfaceOptions["onComplete"];
  private readonly onStepEnter?: BusinessOnboardingSurfaceOptions["onStepEnter"];
  private readonly onRuntimeAction?: BusinessOnboardingSurfaceOptions["onRuntimeAction"];
  private root: HTMLElement | null = null;
  private busy = false;
  private lastEnteredStepId: string | null = null;

  constructor(options: BusinessOnboardingSurfaceOptions = {}) {
    this.document = options.document ?? document;
    this.host = options.host ?? new BusinessOnboardingHostController();
    this.onSkip = options.onSkip;
    this.onComplete = options.onComplete;
    this.onStepEnter = options.onStepEnter;
    this.onRuntimeAction = options.onRuntimeAction;
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
            <p id="businessOnboardingEyebrow" class="business-onboarding-eyebrow"></p>
            <h1 id="businessOnboardingTitle"></h1>
            <p id="businessOnboardingDescription"></p>
          </div>
          <button type="button" data-action="skip" aria-label="Pausar tutorial">×</button>
        </div>
        <div class="business-onboarding-body" aria-live="polite">
          <div id="businessOnboardingContent"></div>
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
      if (!(target instanceof HTMLElement) || this.busy) return;
      const inputValue = target.closest<HTMLElement>("[data-input-value]")?.dataset.inputValue;
      if (inputValue !== undefined) {
        this.handleInput(inputValue);
        return;
      }
      const runtimeAction = target.closest<HTMLElement>("[data-runtime-action]")?.dataset.runtimeAction;
      if (runtimeAction) {
        void this.handleRuntimeAction(runtimeAction);
        return;
      }
      const action = target.closest<HTMLElement>("[data-action]")?.dataset.action;
      if (action) void this.handleAction(action);
    });
    root.addEventListener("input", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || target.dataset.onboardingInput !== "true") return;
      this.host.updateStepInput(this.host.snapshot().stepId, target.value);
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
    void this.notifyStepEntered();
    return root;
  }

  snapshot(): BusinessOnboardingHostSnapshot {
    return this.host.snapshot();
  }

  setStatus(message: string): void {
    const status = this.root?.querySelector<HTMLElement>("#businessOnboardingStatus");
    if (status) status.textContent = message;
  }

  private setBusy(busy: boolean, label = ""): void {
    this.busy = busy;
    this.root?.setAttribute("aria-busy", String(busy));
    this.root?.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
      button.disabled = busy;
    });
    if (label) this.setStatus(label);
  }

  private handleInput(value: string): void {
    const snapshot = this.host.snapshot();
    this.host.updateStepInput(snapshot.stepId, value);
    this.render();
  }

  private async handleRuntimeAction(action: string): Promise<void> {
    if (!this.onRuntimeAction) return;
    this.setBusy(true, "Executando ação...");
    try {
      const completed = await this.onRuntimeAction(action);
      this.render();
      this.setStatus(completed ? "Ação concluída." : "Não foi possível concluir esta ação.");
    } finally {
      this.setBusy(false);
    }
  }

  private validateCurrentInput(): boolean {
    const snapshot = this.host.snapshot();
    const definition = resolveBusinessOnboardingStep(
      snapshot.stepId,
      snapshot.session.conversationDraft.context,
    );
    if (!definition.field) return true;
    const value = contextValue(snapshot, definition.field);
    const valid = validateBusinessOnboardingStepInput(
      snapshot.stepId,
      value,
      snapshot.session.conversationDraft.context,
    );
    if (!valid) {
      this.setStatus(
        definition.type === "text"
          ? "Preencha este campo antes de continuar."
          : "Escolha uma opção antes de continuar.",
      );
    }
    return valid;
  }

  private async handleAction(action: string): Promise<void> {
    if (action === "skip") {
      const snapshot = this.host.pause("user_skip");
      this.onSkip?.(snapshot);
      this.destroy();
      return;
    }

    if (action === "next" && !this.validateCurrentInput()) return;

    this.setBusy(true, action === "back" ? "Voltando..." : "Continuando...");
    try {
      const before = this.host.snapshot();
      if (action === "back") {
        await this.host.back();
      } else if (action === "next") {
        if (!before.canGoForward) {
          const completed = this.host.complete();
          this.onComplete?.(completed);
          this.destroy();
          return;
        }
        await this.host.next();
      }
      const after = this.host.snapshot();
      this.render();
      if (after.stepId === before.stepId && action === "next") {
        this.setStatus("Conclua a ação desta etapa para continuar.");
      } else {
        await this.notifyStepEntered();
      }
    } finally {
      this.setBusy(false);
    }
  }

  private appendRuntimeButton(
    container: HTMLElement,
    action: string,
    label: string,
    primary = false,
  ): void {
    const button = this.document.createElement("button");
    button.type = "button";
    button.dataset.runtimeAction = action;
    button.className = primary
      ? "business-onboarding-runtime-action is-primary"
      : "business-onboarding-runtime-action";
    button.textContent = label;
    container.append(button);
  }

  private renderRuntimeActions(
    container: HTMLElement,
    snapshot: BusinessOnboardingHostSnapshot,
  ): void {
    const context = snapshot.session.conversationDraft.context;
    const actions = this.document.createElement("div");
    actions.className = "business-onboarding-runtime-actions";

    if (snapshot.stepId === "ready") {
      if (context.businessLocationCandidate) {
        this.appendRuntimeButton(actions, "location-confirm", "É este local", true);
      }
      this.appendRuntimeButton(actions, "location-search-again", "Procurar novamente");
      this.appendRuntimeButton(actions, "location-use-device", "Usar minha localização");
    } else if (snapshot.stepId === "voice-discovery") {
      this.appendRuntimeButton(actions, "voice-simulate", "Simular busca por voz", true);
    } else if (snapshot.stepId === "route" && context.businessTutorialRouteReady !== true) {
      const note = this.document.createElement("p");
      note.className = "business-onboarding-runtime-note";
      note.textContent = "A rota permanece bloqueada até existir um port de rota equivalente ao fluxo V1.";
      actions.append(note);
    }

    if (actions.childElementCount > 0) container.append(actions);
  }

  private renderOptions(
    container: HTMLElement,
    snapshot: BusinessOnboardingHostSnapshot,
    options: readonly Readonly<{ value: string; label: string; icon?: string }>[],
    field: string,
  ): void {
    const selected = String(snapshot.session.conversationDraft.context[field] ?? "");
    const group = this.document.createElement("div");
    group.className = "business-onboarding-options";
    group.setAttribute("role", "group");
    options.forEach((option) => {
      const button = this.document.createElement("button");
      button.type = "button";
      button.className = "business-onboarding-option";
      button.dataset.inputValue = option.value;
      button.setAttribute("aria-pressed", String(selected === option.value));
      button.textContent = `${option.icon ? `${option.icon} ` : ""}${option.label}`;
      group.append(button);
    });
    container.append(group);
  }

  private renderContent(
    container: HTMLElement,
    snapshot: BusinessOnboardingHostSnapshot,
  ): void {
    container.replaceChildren();
    const context = snapshot.session.conversationDraft.context;
    const definition = resolveBusinessOnboardingStep(snapshot.stepId, context);

    if (definition.options && definition.field) {
      this.renderOptions(container, snapshot, definition.options, definition.field);
    }

    if (definition.type === "text" && definition.field) {
      const input = this.document.createElement("input");
      input.type = "text";
      input.dataset.onboardingInput = "true";
      input.className = "business-onboarding-input";
      input.value = String(context[definition.field] ?? "");
      input.placeholder = definition.placeholder ?? "";
      if (definition.maxLength) input.maxLength = definition.maxLength;
      input.setAttribute("aria-label", definition.title);
      container.append(input);
    }

    if (definition.response) {
      const response = this.document.createElement("p");
      response.className = "business-onboarding-response";
      response.textContent = definition.response;
      container.append(response);
    }

    if (definition.items?.length) {
      const list = this.document.createElement("ul");
      list.className = "business-onboarding-items";
      definition.items.forEach((item) => {
        const row = this.document.createElement("li");
        row.textContent = item;
        list.append(row);
      });
      container.append(list);
    }

    if (definition.metrics?.length) {
      const metrics = this.document.createElement("dl");
      metrics.className = "business-onboarding-metrics";
      definition.metrics.forEach((metric) => {
        const wrapper = this.document.createElement("div");
        const term = this.document.createElement("dt");
        const value = this.document.createElement("dd");
        term.textContent = metric.label;
        value.textContent = metric.value;
        wrapper.append(term, value);
        metrics.append(wrapper);
      });
      container.append(metrics);
    }

    this.renderRuntimeActions(container, snapshot);
  }

  render(): void {
    if (!this.root) return;
    const snapshot = this.host.snapshot();
    const definition = resolveBusinessOnboardingStep(
      snapshot.stepId,
      snapshot.session.conversationDraft.context,
    );
    const progress = this.root.querySelector<HTMLElement>("#businessOnboardingProgress");
    const eyebrow = this.root.querySelector<HTMLElement>("#businessOnboardingEyebrow");
    const title = this.root.querySelector<HTMLElement>("#businessOnboardingTitle");
    const description = this.root.querySelector<HTMLElement>("#businessOnboardingDescription");
    const content = this.root.querySelector<HTMLElement>("#businessOnboardingContent");
    const back = this.root.querySelector<HTMLButtonElement>('[data-action="back"]');
    const next = this.root.querySelector<HTMLButtonElement>('[data-action="next"]');

    if (progress) progress.textContent = renderProgress(snapshot);
    if (eyebrow) eyebrow.textContent = definition.eyebrow;
    if (title) title.textContent = definition.title;
    if (description) description.textContent = definition.description;
    if (content) this.renderContent(content, snapshot);
    if (back) back.hidden = !snapshot.canGoBack;
    if (next) next.textContent = snapshot.canGoForward ? definition.primary ?? "Continuar" : definition.primary ?? "Concluir";
    this.setStatus("");
  }

  private async notifyStepEntered(): Promise<void> {
    const snapshot = this.host.snapshot();
    if (!this.onStepEnter || snapshot.stepId === this.lastEnteredStepId) return;
    this.lastEnteredStepId = snapshot.stepId;
    await this.onStepEnter(snapshot);
    this.render();
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
