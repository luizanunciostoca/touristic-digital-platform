export interface PublicInteractiveTourController {
  readonly active: boolean;
  readonly stepIndex: number;
  start(): boolean;
  destroy(): void;
}

export interface InstallPublicInteractiveTourOptions {
  readonly document: Document;
  readonly onComplete: () => void;
  readonly onSkip: () => void;
}

interface TutorialWindow extends Window {
  __tourActive?: boolean;
}

interface TutorialStep {
  readonly selectors: readonly string[];
  readonly title: string;
  readonly description: string;
  readonly hint: string;
}

const TOUR_FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

const STEPS: readonly TutorialStep[] = Object.freeze([
  {
    selectors: ["#map-container", "#map"],
    title: "Explore Morro pelo mapa",
    description:
      "O mapa interativo é o centro da experiência. Navegue por Morro de São Paulo e descubra lugares próximos.",
    hint: "Arraste e aproxime o mapa quando quiser.",
  },
  {
    selectors: ["#weather-widget"],
    title: "Veja o clima antes de sair",
    description:
      "O clima acompanha a sua exploração para ajudar a planejar praias, passeios e deslocamentos.",
    hint: "Toque no clima para consultar os detalhes.",
  },
  {
    selectors: [".quick-actions .action-button.primary.mood-button"],
    title: "Seu assistente está sempre por perto",
    description:
      "Este botão abre o guia virtual do Morro Digital sempre que você precisar de ajuda.",
    hint: "Use o assistente para descobrir o que fazer agora.",
  },
  {
    selectors: ["#assistant-messages"],
    title: "Bem-vindo ao seu guia virtual",
    description:
      "Aqui você recebe sugestões de praias, restaurantes, hospedagens, festas, passeios e serviços.",
    hint: "A mensagem de boas-vindas fica disponível ao iniciar o aplicativo.",
  },
  {
    selectors: ["#assistant-messages .assistant-options", ".assistant-options"],
    title: "Escolha um atalho",
    description:
      "Use as opções rápidas para explorar categorias sem precisar digitar uma pergunta.",
    hint: "Você também pode conversar livremente com o assistente.",
  },
  {
    selectors: ["#assistant-input-area"],
    title: "Pergunte do seu jeito",
    description:
      "Digite uma pergunta, envie por voz ou abra as configurações do assistente diretamente nesta área.",
    hint: "Experimente perguntar o que fazer hoje em Morro de São Paulo.",
  },
  {
    selectors: ["#globe-map-control", "#toggle-globe-view"],
    title: "Pronto para explorar",
    description:
      "Agora você conhece os principais controles. Continue pelo mapa e use o assistente sempre que precisar.",
    hint: "Você pode rever os recursos enquanto navega pelo aplicativo.",
  },
]);

function firstVisibleTarget(
  document: Document,
  selectors: readonly string[],
): HTMLElement | null {
  for (const selector of selectors) {
    const candidate = document.querySelector<HTMLElement>(selector);
    if (!candidate) continue;
    const rect = candidate.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return candidate;
  }
  return null;
}

function revealAssistantWelcome(document: Document): void {
  const assistant = document.getElementById("assistant-messages");
  const quickAction = document.querySelector<HTMLElement>(
    ".quick-actions .action-button.primary",
  );
  if (assistant instanceof HTMLElement) {
    assistant.classList.remove("hidden");
    assistant.setAttribute("aria-hidden", "false");
  }
  document.body.classList.add("assistant-modal-open");
  quickAction?.classList.add("active");
  quickAction?.setAttribute("aria-expanded", "true");
}

export function ensureV1AssistantWelcomeVisible(document: Document): void {
  revealAssistantWelcome(document);
}

export function installPublicInteractiveTour(
  options: InstallPublicInteractiveTourOptions,
): PublicInteractiveTourController {
  const view = options.document.defaultView as TutorialWindow | null;
  let active = false;
  let stepIndex = 0;
  let target: HTMLElement | null = null;
  let targetInlinePosition = "";
  let backdrop: HTMLElement | null = null;
  let blocker: HTMLElement | null = null;
  let highlight: HTMLElement | null = null;
  let proxy: HTMLElement | null = null;
  let tooltip: HTMLElement | null = null;
  let resizeFrame = 0;
  let previouslyFocusedElement: HTMLElement | null = null;

  const clearTarget = (): void => {
    if (target) {
      target.classList.remove("tour-target-active", "tour-pulse");
      target.style.position = targetInlinePosition;
    }
    target = null;
    targetInlinePosition = "";
    if (backdrop) backdrop.style.clipPath = "";
  };

  const removeTourNodes = (): void => {
    if (backdrop) backdrop.style.clipPath = "";
    backdrop?.remove();
    blocker?.remove();
    highlight?.remove();
    proxy?.remove();
    tooltip?.remove();
    backdrop = null;
    blocker = null;
    highlight = null;
    proxy = null;
    tooltip = null;
  };

  const restoreFocus = (): void => {
    if (previouslyFocusedElement?.isConnected) {
      previouslyFocusedElement.focus();
    }
    previouslyFocusedElement = null;
  };

  const cleanup = (): void => {
    clearTarget();
    removeTourNodes();
    options.document.body.classList.remove(
      "tour-active",
      "tour-show-assistant-modal-step",
      "tour-hide-assistant-modal-step",
    );
    if (view) {
      view.__tourActive = false;
      view.removeEventListener("resize", onViewportChanged);
      view.removeEventListener("scroll", onViewportChanged, true);
      if (resizeFrame) view.cancelAnimationFrame(resizeFrame);
    }
    options.document.removeEventListener("keydown", onKeyDown, true);
    resizeFrame = 0;
    active = false;
  };

  const finish = (result: "complete" | "skip"): void => {
    if (!active) return;
    cleanup();
    revealAssistantWelcome(options.document);
    restoreFocus();
    if (result === "complete") {
      const toast = options.document.createElement("div");
      toast.id = "tour-finish-toast";
      toast.innerHTML =
        '<span class="tour-finish-toast-icon" aria-hidden="true">✓</span><span>Pronto! Agora é só explorar o Morro Digital.</span>';
      options.document.body.appendChild(toast);
      view?.requestAnimationFrame(() => toast.classList.add("visible"));
      view?.setTimeout(() => toast.remove(), 2600);
      options.onComplete();
    } else {
      options.onSkip();
    }
  };

  const updateBackdropCutout = (rect: DOMRect, margin: number): void => {
    if (!backdrop) return;
    const viewportWidth =
      view?.innerWidth ?? options.document.documentElement.clientWidth;
    const viewportHeight =
      view?.innerHeight ?? options.document.documentElement.clientHeight;
    const left = Math.max(0, rect.left - margin);
    const top = Math.max(0, rect.top - margin);
    const right = Math.min(viewportWidth, rect.right + margin);
    const bottom = Math.min(viewportHeight, rect.bottom + margin);
    backdrop.style.clipPath = `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${left}px ${top}px, ${left}px ${bottom}px, ${right}px ${bottom}px, ${right}px ${top}px, ${left}px ${top}px)`;
  };

  const positionStep = (): void => {
    if (!active || !target || !highlight || !tooltip) return;
    const rect = target.getBoundingClientRect();
    const margin = 7;
    highlight.style.top = `${Math.max(4, rect.top - margin)}px`;
    highlight.style.left = `${Math.max(4, rect.left - margin)}px`;
    highlight.style.width = `${Math.max(28, rect.width + margin * 2)}px`;
    highlight.style.height = `${Math.max(28, rect.height + margin * 2)}px`;
    updateBackdropCutout(rect, margin);

    const viewportWidth = view?.innerWidth ?? 390;
    const viewportHeight = view?.innerHeight ?? 844;
    const tooltipRect = tooltip.getBoundingClientRect();
    const fallbackTooltipWidth = Math.min(340, viewportWidth - 24);
    const tooltipWidth = Math.min(
      tooltipRect.width || fallbackTooltipWidth,
      viewportWidth - 24,
    );
    let left = rect.left + rect.width / 2 - tooltipWidth / 2;
    left = Math.max(12, Math.min(left, viewportWidth - tooltipWidth - 12));
    const estimatedHeight = Math.max(190, tooltipRect.height || 190);
    const roomBelow = viewportHeight - rect.bottom;
    const top =
      roomBelow >= estimatedHeight + 24
        ? rect.bottom + 16
        : Math.max(12, rect.top - estimatedHeight - 16);
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  };

  function onViewportChanged(): void {
    if (!view || !active) return;
    if (resizeFrame) view.cancelAnimationFrame(resizeFrame);
    resizeFrame = view.requestAnimationFrame(positionStep);
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (!active) return;

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      finish("skip");
      return;
    }

    if (event.key === "Tab" && tooltip) {
      const focusable = Array.from(
        tooltip.querySelectorAll<HTMLElement>(TOUR_FOCUSABLE_SELECTOR),
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const focused = options.document.activeElement;
      if (!first || !last) {
        event.preventDefault();
        tooltip.focus();
        return;
      }
      if (event.shiftKey && (focused === first || !tooltip.contains(focused))) {
        event.preventDefault();
        last.focus();
        return;
      }
      if (!event.shiftKey && (focused === last || !tooltip.contains(focused))) {
        event.preventDefault();
        first.focus();
        return;
      }
    }

    if (event.key === "ArrowRight" && stepIndex < STEPS.length - 1) {
      event.preventDefault();
      event.stopPropagation();
      renderStep(stepIndex + 1);
    }
    if (event.key === "ArrowLeft" && stepIndex > 0) {
      event.preventDefault();
      event.stopPropagation();
      renderStep(stepIndex - 1);
    }
  }

  const createChrome = (): void => {
    backdrop = options.document.createElement("div");
    backdrop.id = "tour-backdrop";
    blocker = options.document.createElement("div");
    blocker.id = "tour-click-blocker";
    highlight = options.document.createElement("div");
    highlight.id = "tour-highlight";
    proxy = options.document.createElement("div");
    proxy.id = "tour-target-proxy";
    tooltip = options.document.createElement("section");
    tooltip.id = "tour-tooltip";
    tooltip.tabIndex = -1;
    tooltip.setAttribute("role", "dialog");
    tooltip.setAttribute("aria-modal", "true");
    tooltip.setAttribute("aria-live", "polite");
    options.document.body.append(backdrop, blocker, highlight, proxy, tooltip);
  };

  const renderTooltip = (step: TutorialStep): void => {
    if (!tooltip) return;
    const isLast = stepIndex === STEPS.length - 1;
    const progress = ((stepIndex + 1) / STEPS.length) * 100;
    tooltip.innerHTML = `
      <div class="tour-tooltip-inner">
        <div class="tour-header">
          <span class="tour-step-label">Passo ${stepIndex + 1} de ${STEPS.length}</span>
          <button type="button" class="tour-skip-btn">Pular tour</button>
        </div>
        <div class="tour-progress-bar" aria-hidden="true">
          <div class="tour-progress-fill" style="width:${progress}%"></div>
        </div>
        <h2 class="tour-step-title">${step.title}</h2>
        <p class="tour-step-desc">${step.description}</p>
        <div class="tour-action-hint"><span class="tour-hint-arrow">↑</span><span>${step.hint}</span></div>
        <div class="tour-footer">
          ${stepIndex > 0 ? '<button type="button" class="tour-btn-back">Voltar</button>' : ""}
          ${
            isLast
              ? '<button type="button" class="tour-btn-finish">Começar a explorar</button>'
              : '<button type="button" class="tour-btn-next">Próximo</button>'
          }
        </div>
      </div>
    `;
    tooltip
      .querySelector<HTMLButtonElement>(".tour-skip-btn")
      ?.addEventListener("click", () => finish("skip"), { once: true });
    tooltip
      .querySelector<HTMLButtonElement>(".tour-btn-back")
      ?.addEventListener("click", () => renderStep(stepIndex - 1), {
        once: true,
      });
    tooltip
      .querySelector<HTMLButtonElement>(".tour-btn-next")
      ?.addEventListener("click", () => renderStep(stepIndex + 1), {
        once: true,
      });
    tooltip
      .querySelector<HTMLButtonElement>(".tour-btn-finish")
      ?.addEventListener("click", () => finish("complete"), { once: true });
  };

  function renderStep(nextIndex: number): void {
    if (!active) return;
    const step = STEPS[nextIndex];
    if (!step) return;
    clearTarget();
    stepIndex = nextIndex;
    target = firstVisibleTarget(options.document, step.selectors);
    if (!target) {
      if (nextIndex < STEPS.length - 1) renderStep(nextIndex + 1);
      else finish("complete");
      return;
    }

    const computedPosition =
      view?.getComputedStyle(target).position ?? "static";
    targetInlinePosition = target.style.position;
    target.classList.add("tour-target-active", "tour-pulse");
    if (computedPosition !== "static") target.style.position = computedPosition;

    const assistantStep = nextIndex >= 3 && nextIndex <= 5;
    options.document.body.classList.toggle(
      "tour-show-assistant-modal-step",
      assistantStep,
    );
    renderTooltip(step);
    positionStep();
    tooltip
      ?.querySelector<HTMLElement>(
        nextIndex === STEPS.length - 1 ? ".tour-btn-finish" : ".tour-btn-next",
      )
      ?.focus();
  }

  return Object.freeze({
    get active(): boolean {
      return active;
    },
    get stepIndex(): number {
      return stepIndex;
    },
    start(): boolean {
      if (active) return false;
      active = true;
      stepIndex = 0;
      previouslyFocusedElement =
        options.document.activeElement instanceof HTMLElement
          ? options.document.activeElement
          : null;
      revealAssistantWelcome(options.document);
      options.document.body.classList.add("tour-active");
      if (view) {
        view.__tourActive = true;
        view.addEventListener("resize", onViewportChanged);
        view.addEventListener("scroll", onViewportChanged, true);
      }
      options.document.addEventListener("keydown", onKeyDown, true);
      createChrome();
      renderStep(0);
      return true;
    },
    destroy(): void {
      cleanup();
      restoreFocus();
    },
  });
}
