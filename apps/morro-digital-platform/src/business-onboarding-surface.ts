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

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function routeSummary(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const result = value as {
    readonly success?: unknown;
    readonly distanceMeters?: unknown;
    readonly durationSeconds?: unknown;
    readonly code?: unknown;
  };
  if (result.success !== true) {
    return typeof result.code === "string"
      ? `Rota indisponível: ${result.code}.`
      : "Rota indisponível.";
  }
  const distance =
    typeof result.distanceMeters === "number" &&
    Number.isFinite(result.distanceMeters)
      ? `${Math.round(result.distanceMeters)} m`
      : "distância calculada";
  const duration =
    typeof result.durationSeconds === "number" &&
    Number.isFinite(result.durationSeconds)
      ? `${Math.max(1, Math.round(result.durationSeconds / 60))} min`
      : "tempo calculado";
  return `Rota confirmada: ${distance} · ${duration}.`;
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
      const inputValue =
        target.closest<HTMLElement>("[data-input-value]")?.dataset.inputValue;
      if (inputValue !== undefined) {
        this.handleInput(inputValue);
        return;
      }
      const runtimeAction = target.closest<HTMLElement>("[data-runtime-action]")
        ?.dataset.runtimeAction;
      if (runtimeAction) {
        void this.handleRuntimeAction(runtimeAction);
        return;
      }
      const action =
        target.closest<HTMLElement>("[data-action]")?.dataset.action;
      if (action) void this.handleAction(action);
    });
    root.addEventListener("submit", (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      if (form.dataset.workspacePromotion === "true") {
        event.preventDefault();
        const data = new FormData(form);
        const payload = {
          title: data.get("title"),
          description: data.get("description"),
          cta: data.get("cta"),
          validUntil: data.get("validUntil"),
        };
        void this.handleRuntimeAction(
          `workspace-promotion-save:${encodeURIComponent(JSON.stringify(payload))}`,
        );
        return;
      }
      if (form.dataset.commercialConversion === "true") {
        event.preventDefault();
        const data = new FormData(form);
        const payload = {
          selectedPlanId: data.get("planId"),
          contractor: {
            name: data.get("name"),
            email: data.get("email"),
            phone: data.get("phone"),
            document: data.get("document"),
          },
          acceptTerms: data.get("terms") === "on",
          acceptPrivacy: data.get("privacy") === "on",
          marketingConsent: data.get("marketing") === "on",
        };
        void this.handleRuntimeAction(
          `commercial-prepare-checkout:${encodeURIComponent(JSON.stringify(payload))}`,
        );
      }
    });
    root.addEventListener("input", (event) => {
      const target = event.target;
      if (
        !(target instanceof HTMLInputElement) ||
        target.dataset.onboardingInput !== "true"
      )
        return;
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
    const status = this.root?.querySelector<HTMLElement>(
      "#businessOnboardingStatus",
    );
    if (status) status.textContent = message;
  }

  private setBusy(busy: boolean, label = ""): void {
    this.busy = busy;
    this.root?.setAttribute("aria-busy", String(busy));
    this.root
      ?.querySelectorAll<HTMLButtonElement>("button")
      .forEach((button) => {
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
      this.setStatus(
        completed ? "Ação concluída." : "Não foi possível concluir esta ação.",
      );
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

  private renderProfilePreview(
    container: HTMLElement,
    profile: Record<string, unknown>,
  ): void {
    const preview = this.document.createElement("article");
    preview.className = "business-onboarding-profile-preview";
    preview.setAttribute("aria-label", "Prévia do perfil da empresa");

    const title = this.document.createElement("h2");
    title.textContent = stringValue(profile.name) || "Sua empresa";
    const meta = this.document.createElement("p");
    meta.textContent = [
      stringValue(profile.categoryLabel),
      stringValue(profile.specialty),
    ]
      .filter(Boolean)
      .join(" · ");
    const description = this.document.createElement("p");
    description.textContent = stringValue(profile.description);
    const location = this.document.createElement("p");
    location.textContent = `${profile.locationIsExample === true ? "Localização demonstrativa" : "Localização"}: ${stringValue(profile.locationLabel) || "Morro de São Paulo"}`;

    preview.append(title, meta, description, location);

    const promotion = objectValue(profile.promotion);
    if (promotion) {
      const offer = this.document.createElement("p");
      offer.className = "business-onboarding-profile-promotion";
      offer.textContent = `${stringValue(promotion.title)} — ${stringValue(promotion.description)}`;
      preview.append(offer);
    }

    container.append(preview);
  }

  private renderWorkspaceSummary(
    container: HTMLElement,
    workspace: Record<string, unknown>,
  ): void {
    const panel = this.document.createElement("article");
    panel.className = "business-onboarding-workspace-preview";
    panel.setAttribute("aria-label", "Resumo da sessão demonstrativa");
    const title = this.document.createElement("h2");
    title.textContent = `Resultados de ${stringValue(workspace.businessName) || "Sua empresa"}`;
    const note = this.document.createElement("p");
    note.textContent =
      "Estes números pertencem somente a esta demonstração e não alimentam métricas comerciais.";
    panel.append(title, note);
    const metrics = Array.isArray(workspace.metrics) ? workspace.metrics : [];
    const list = this.document.createElement("dl");
    list.className = "business-onboarding-workspace-metrics";
    for (const metricValue of metrics) {
      const metric = objectValue(metricValue);
      if (!metric) continue;
      const row = this.document.createElement("div");
      const label = this.document.createElement("dt");
      label.textContent = stringValue(metric.label);
      const value = this.document.createElement("dd");
      value.textContent = String(
        typeof metric.value === "number" ? metric.value : 0,
      );
      row.append(label, value);
      list.append(row);
    }
    panel.append(list);
    container.append(panel);
  }

  private renderPromotionForm(
    container: HTMLElement,
    context: Readonly<Record<string, unknown>>,
  ): void {
    const defaults: Record<string, readonly [string, string, string]> = {
      restaurant: [
        "Oferta especial de hoje",
        "Condição exclusiva para quem encontrou a empresa pelo Morro Digital.",
        "Ver oferta",
      ],
      lodging: [
        "Benefício na reserva",
        "Consulte uma condição especial para sua hospedagem.",
        "Consultar",
      ],
      tour: [
        "Condição especial no passeio",
        "Garanta uma vantagem ao reservar pelo Morro Digital.",
        "Reservar",
      ],
      events: [
        "Ingresso ou benefício especial",
        "Confira a condição disponível para este evento.",
        "Ver evento",
      ],
    };
    const [defaultTitle, defaultDescription, defaultCta] = defaults[
      stringValue(context.category)
    ] ?? [
      "Oferta especial",
      "Confira uma condição exclusiva disponível agora.",
      "Ver oferta",
    ];
    const form = this.document.createElement("form");
    form.dataset.workspacePromotion = "true";
    form.className = "business-onboarding-promotion-form";
    form.innerHTML = `<label>Título<input name="title" maxlength="90" required></label><label>Descrição<textarea name="description" maxlength="220" required></textarea></label><label>Botão<input name="cta" maxlength="50" required></label><label>Validade<input name="validUntil" type="date"></label><button type="submit" class="business-onboarding-runtime-action is-primary">Salvar promoção demonstrativa</button>`;
    const title = form.querySelector<HTMLInputElement>('input[name="title"]');
    const description = form.querySelector<HTMLTextAreaElement>(
      'textarea[name="description"]',
    );
    const cta = form.querySelector<HTMLInputElement>('input[name="cta"]');
    if (title) title.value = defaultTitle;
    if (description) description.value = defaultDescription;
    if (cta) cta.value = defaultCta;
    container.append(form);
  }

  private renderCommercialForm(
    container: HTMLElement,
    snapshot: BusinessOnboardingHostSnapshot,
  ): void {
    const context = snapshot.session.conversationDraft.context;
    const existing = objectValue(context.businessCheckoutHandoff);
    if (existing) {
      const notice = this.document.createElement("p");
      notice.className = "business-onboarding-runtime-note";
      notice.textContent =
        "Cadastro comercial preparado. O pagamento só poderá ser confirmado pelo serviço seguro de Payments.";
      container.append(notice);
      return;
    }
    const objective = stringValue(context.objective);
    const recommended =
      objective === "events"
        ? "performance"
        : objective === "brand"
          ? "essential"
          : "growth";
    const form = this.document.createElement("form");
    form.dataset.commercialConversion = "true";
    form.className = "business-onboarding-commercial-form";
    form.innerHTML = `<fieldset><legend>Plano</legend><label><input type="radio" name="planId" value="essential" ${recommended === "essential" ? "checked" : ""}> Essencial</label><label><input type="radio" name="planId" value="growth" ${recommended === "growth" ? "checked" : ""}> Crescimento</label><label><input type="radio" name="planId" value="performance" ${recommended === "performance" ? "checked" : ""}> Performance</label></fieldset><label>Nome completo<input name="name" autocomplete="name" maxlength="120" required></label><label>E-mail<input name="email" type="email" autocomplete="email" maxlength="160" required></label><label>Telefone/WhatsApp<input name="phone" autocomplete="tel" maxlength="80" required></label><label>CPF ou CNPJ<input name="document" maxlength="80" required></label><label><input type="checkbox" name="terms" required> Li e aceito os Termos de Parceria.</label><label><input type="checkbox" name="privacy" required> Li e aceito a Política de Privacidade.</label><label><input type="checkbox" name="marketing"> Autorizo comunicações comerciais (opcional).</label><p class="business-onboarding-runtime-note">Nenhum pagamento é executado nesta tela. Ao continuar, o Business prepara apenas um handoff para o serviço de Payments.</p><button type="submit" class="business-onboarding-runtime-action is-primary">Preparar pagamento seguro</button>`;
    container.append(form);
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
        this.appendRuntimeButton(
          actions,
          "location-confirm",
          "É este local",
          true,
        );
      }
      this.appendRuntimeButton(
        actions,
        "location-search-again",
        "Procurar novamente",
      );
      this.appendRuntimeButton(
        actions,
        "location-use-device",
        "Usar minha localização",
      );
    } else if (snapshot.stepId === "voice-discovery") {
      this.appendRuntimeButton(
        actions,
        "voice-simulate",
        "Simular busca por voz",
        true,
      );
    } else if (snapshot.stepId === "profile") {
      const profile = objectValue(context.tutorialBusinessProfile);
      if (profile) {
        this.renderProfilePreview(container, profile);
        this.appendRuntimeButton(actions, "profile-map", "Ver no mapa");
        this.appendRuntimeButton(
          actions,
          "profile-primary",
          stringValue(profile.cta) || "Ver empresa",
          true,
        );
        if (objectValue(profile.promotion)) {
          this.appendRuntimeButton(
            actions,
            "profile-promotion",
            "Ver promoção",
          );
        }
      }
    } else if (snapshot.stepId === "promotions") {
      this.renderPromotionForm(container, context);
    } else if (snapshot.stepId === "partner-panel") {
      const workspace = objectValue(context.businessTutorialWorkspace);
      if (workspace) this.renderWorkspaceSummary(container, workspace);
      this.appendRuntimeButton(
        actions,
        "workspace-open-dashboard",
        "Abrir dashboard protegido",
        true,
      );
    } else if (snapshot.stepId === "finish") {
      this.renderCommercialForm(container, snapshot);
    } else if (snapshot.stepId === "route") {
      const note = this.document.createElement("p");
      note.className = "business-onboarding-runtime-note";
      note.textContent =
        routeSummary(context.businessRouteResult) ||
        "Calculando uma rota demonstrativa com o serviço real de navegação...";
      actions.append(note);
      if (context.businessTutorialRouteReady !== true) {
        this.appendRuntimeButton(
          actions,
          "route-retry",
          "Tentar rota novamente",
          true,
        );
      }
    }

    if (actions.childElementCount > 0) container.append(actions);
  }

  private renderOptions(
    container: HTMLElement,
    snapshot: BusinessOnboardingHostSnapshot,
    options: readonly Readonly<{
      value: string;
      label: string;
      icon?: string;
    }>[],
    field: string,
  ): void {
    const selected = stringValue(
      snapshot.session.conversationDraft.context[field],
    );
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
      this.renderOptions(
        container,
        snapshot,
        definition.options,
        definition.field,
      );
    }

    if (definition.type === "text" && definition.field) {
      const input = this.document.createElement("input");
      input.type = "text";
      input.dataset.onboardingInput = "true";
      input.className = "business-onboarding-input";
      input.value = stringValue(context[definition.field]);
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
    const progress = this.root.querySelector<HTMLElement>(
      "#businessOnboardingProgress",
    );
    const eyebrow = this.root.querySelector<HTMLElement>(
      "#businessOnboardingEyebrow",
    );
    const title = this.root.querySelector<HTMLElement>(
      "#businessOnboardingTitle",
    );
    const description = this.root.querySelector<HTMLElement>(
      "#businessOnboardingDescription",
    );
    const content = this.root.querySelector<HTMLElement>(
      "#businessOnboardingContent",
    );
    const back = this.root.querySelector<HTMLButtonElement>(
      '[data-action="back"]',
    );
    const next = this.root.querySelector<HTMLButtonElement>(
      '[data-action="next"]',
    );

    if (progress) progress.textContent = renderProgress(snapshot);
    if (eyebrow) eyebrow.textContent = definition.eyebrow;
    if (title) title.textContent = definition.title;
    if (description) description.textContent = definition.description;
    if (content) this.renderContent(content, snapshot);
    if (back) back.hidden = !snapshot.canGoBack;
    if (next)
      next.textContent = snapshot.canGoForward
        ? (definition.primary ?? "Continuar")
        : (definition.primary ?? "Concluir");
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
