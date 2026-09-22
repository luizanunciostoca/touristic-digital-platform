import {
  getPublicOnboardingCopy,
  type PublicOnboardingTourStepCopy,
} from "./public-onboarding-i18n.js";

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

interface TutorialStepTarget {
  readonly selectors: readonly string[];
}

const TOUR_FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

const STEPS: readonly TutorialStepTarget[] = Object.freeze([
  Object.freeze({ selectors: ["#map-container", "#map"] }),
  Object.freeze({ selectors: ["#weather-widget"] }),
  Object.freeze({ selectors: ["#assistant-input-area"] }),
  Object.freeze({ selectors: ["#voiceButton", "#assistant-input-area"] }),
  Object.freeze({ selectors: ["#home-profile-button"] }),
  Object.freeze({ selectors: ["#toggle-globe-view"] }),
]);

function firstVisibleTarget(
  document: Document,
  selectors: readonly string[],
): HTMLElement | null {
  for (const selector of selectors) {
    const candidate = document.querySelector<HTMLElement>(selector);
    if (!candidate) continue;
    const rect = candidate.getBoundingClientRect();
    const style = document.defaultView?.getComputedStyle(candidate);
    const hidden =
      candidate.hidden ||
      style?.display === "none" ||
      style?.visibility === "hidden";
    if (!hidden && rect.width > 0 && rect.height > 0) return candidate;
  }
  return null;
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
      view.visualViewport?.removeEventListener("resize", onViewportChanged);
      view.visualViewport?.removeEventListener("scroll", onViewportChanged);
      if (resizeFrame) view.cancelAnimationFrame(resizeFrame);
    }
    options.document.removeEventListener("keydown", onKeyDown, true);
    resizeFrame = 0;
    active = false;
  };

  const finish = (result: "complete" | "skip"): void => {
    if (!active) return;
    cleanup();
    restoreFocus();
    if (result === "complete") {
      const toast = options.document.createElement("div");
      toast.id = "tour-finish-toast";
      toast.className = "md-toast";
      toast.setAttribute("role", "status");
      toast.setAttribute("aria-live", "polite");
      toast.setAttribute("aria-atomic", "true");
      const copy = getPublicOnboardingCopy(
        options.document.documentElement.lang,
      );
      toast.innerHTML = `<span class="tour-finish-toast-icon" aria-hidden="true">✓</span><span>${copy.tour.done}</span>`;
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
    const margin = 6;
    const viewport = view?.visualViewport;
    const viewportLeft = viewport?.offsetLeft ?? 0;
    const viewportTop = viewport?.offsetTop ?? 0;
    const viewportWidth = viewport?.width ?? view?.innerWidth ?? 390;
    const viewportHeight = viewport?.height ?? view?.innerHeight ?? 844;
    const safeGap = 12;

    highlight.style.top = `${Math.max(viewportTop + 4, rect.top - margin)}px`;
    highlight.style.left = `${Math.max(viewportLeft + 4, rect.left - margin)}px`;
    highlight.style.width = `${Math.max(28, rect.width + margin * 2)}px`;
    highlight.style.height = `${Math.max(28, rect.height + margin * 2)}px`;
    updateBackdropCutout(rect, margin);

    const tooltipRect = tooltip.getBoundingClientRect();
    const tooltipWidth = Math.min(
      tooltipRect.width || Math.min(304, viewportWidth - safeGap * 2),
      viewportWidth - safeGap * 2,
    );
    const tooltipHeight = Math.min(
      tooltipRect.height || 168,
      viewportHeight - safeGap * 2,
    );
    let left = rect.left + rect.width / 2 - tooltipWidth / 2;
    left = Math.max(
      viewportLeft + safeGap,
      Math.min(left, viewportLeft + viewportWidth - tooltipWidth - safeGap),
    );

    const roomBelow = viewportTop + viewportHeight - rect.bottom - safeGap;
    const roomAbove = rect.top - viewportTop - safeGap;
    let top: number;
    if (roomBelow >= tooltipHeight + safeGap) {
      top = rect.bottom + safeGap;
    } else if (roomAbove >= tooltipHeight + safeGap) {
      top = rect.top - tooltipHeight - safeGap;
    } else {
      const targetCenter = rect.top + rect.height / 2;
      const placeAbove = targetCenter > viewportTop + viewportHeight / 2;
      top = placeAbove
        ? viewportTop + safeGap
        : viewportTop + viewportHeight - tooltipHeight - safeGap;
    }

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${Math.max(viewportTop + safeGap, top)}px`;

    const finalTooltipRect = tooltip.getBoundingClientRect();
    const overlapsTarget =
      finalTooltipRect.left < rect.right + 4 &&
      finalTooltipRect.right > rect.left - 4 &&
      finalTooltipRect.top < rect.bottom + 4 &&
      finalTooltipRect.bottom > rect.top - 4;
    tooltip.toggleAttribute("data-overlaps-target", overlapsTarget);
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

  const renderTooltip = (step: PublicOnboardingTourStepCopy): void => {
    if (!tooltip) return;
    const tourCopy = getPublicOnboardingCopy(
      options.document.documentElement.lang,
    ).tour;
    const isLast = stepIndex === STEPS.length - 1;
    const progress = ((stepIndex + 1) / STEPS.length) * 100;
    const targetUnavailable =
      target?.matches(":disabled") ||
      target?.getAttribute("aria-disabled") === "true" ||
      (stepIndex === 3 && target?.id !== "voiceButton");
    tooltip.toggleAttribute(
      "data-target-unavailable",
      Boolean(targetUnavailable),
    );
    tooltip.innerHTML = `
      <div class="tour-tooltip-inner">
        <div class="tour-header">
          <span class="tour-step-label">${tourCopy.step(stepIndex + 1, STEPS.length)}</span>
          <button type="button" class="tour-skip-btn">${tourCopy.skip}</button>
        </div>
        <div class="tour-progress-bar" aria-hidden="true">
          <div class="tour-progress-fill" style="width:${progress}%"></div>
        </div>
        <h2 class="tour-step-title">${step.title}</h2>
        <p class="tour-step-desc">${step.description}</p>
        <div class="tour-action-hint"><span class="tour-hint-arrow">↑</span><span>${step.hint}</span></div>
        ${
          targetUnavailable
            ? `<p class="tour-capability-note" role="status">${tourCopy.unavailable}</p>`
            : ""
        }
        <div class="tour-footer">
          ${stepIndex > 0 ? `<button type="button" class="tour-btn-back">${tourCopy.back}</button>` : ""}
          ${
            isLast
              ? `<button type="button" class="tour-btn-finish">${tourCopy.finish}</button>`
              : `<button type="button" class="tour-btn-next">${tourCopy.next}</button>`
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
    const stepTarget = STEPS[nextIndex];
    const stepCopy = getPublicOnboardingCopy(
      options.document.documentElement.lang,
    ).tour.steps[nextIndex];
    if (!stepTarget || !stepCopy) return;
    clearTarget();
    stepIndex = nextIndex;
    target = firstVisibleTarget(options.document, stepTarget.selectors);
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

    renderTooltip(stepCopy);
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
      options.document.body.classList.add("tour-active");
      if (view) {
        view.__tourActive = true;
        view.addEventListener("resize", onViewportChanged);
        view.addEventListener("scroll", onViewportChanged, true);
        view.visualViewport?.addEventListener("resize", onViewportChanged);
        view.visualViewport?.addEventListener("scroll", onViewportChanged);
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
