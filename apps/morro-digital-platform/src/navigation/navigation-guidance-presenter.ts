import type { NavigationRuntimeSnapshot } from "@touristic/navigation";

const BANNER_ID = "instruction-banner";
const ARROW_ID = "instruction-arrow";
const MAIN_ID = "instruction-main";
const DETAILS_ID = "instruction-details";
const DISTANCE_ID = "instruction-distance";
const TIME_ID = "instruction-time";
const PROGRESS_ID = "route-progress";
const PROGRESS_TEXT_ID = "progress-text";
const MINIMIZE_BUTTON_ID = "minimize-navigation-btn";

export interface NavigationGuidancePresenterOptions {
  readonly document: Document;
}

export interface NavigationGuidancePresenter {
  update(snapshot: NavigationRuntimeSnapshot): void;
  show(): void;
  hide(): void;
  isVisible(): boolean;
  isMinimized(): boolean;
  destroy(): void;
}

function textElement(document: Document, id: string): HTMLElement | null {
  return document.getElementById(id);
}

function directionIcon(instruction: string): string {
  const normalized = instruction.trim().toLowerCase();
  if (
    normalized.includes("esquerda") ||
    normalized.includes("left") ||
    normalized.includes("izquierda")
  ) {
    return "←";
  }
  if (
    normalized.includes("direita") ||
    normalized.includes("right") ||
    normalized.includes("derecha")
  ) {
    return "→";
  }
  if (
    normalized.includes("retorno") ||
    normalized.includes("u-turn") ||
    normalized.includes("uturn")
  ) {
    return "↶";
  }
  if (
    normalized.includes("cheg") ||
    normalized.includes("arriv") ||
    normalized.includes("destination")
  ) {
    return "●";
  }
  return "↑";
}

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function createNavigationGuidancePresenter(
  options: NavigationGuidancePresenterOptions,
): NavigationGuidancePresenter {
  const { document } = options;
  const banner = document.getElementById(BANNER_ID);
  const minimizeButton = document.getElementById(MINIMIZE_BUTTON_ID);
  let destroyed = false;

  function secondarySection(): HTMLElement | null {
    return banner?.querySelector<HTMLElement>(".instruction-secondary") ?? null;
  }

  function setMinimized(minimized: boolean): void {
    if (!banner) return;
    banner.classList.toggle("minimized", minimized);
    const secondary = secondarySection();
    if (secondary) secondary.style.display = minimized ? "none" : "block";
    minimizeButton?.setAttribute("aria-expanded", String(!minimized));
    minimizeButton?.setAttribute(
      "aria-label",
      minimized
        ? "Expandir instruções de navegação"
        : "Minimizar instruções de navegação",
    );
  }

  function show(): void {
    if (destroyed || !banner) return;
    banner.classList.remove("hidden", "closing", "initializing");
    banner.classList.add("prepared");
    document.body.classList.add("navigation-active");
    setMinimized(false);
  }

  function hide(): void {
    if (!banner) return;
    banner.classList.add("hidden");
    banner.classList.remove("prepared", "entering", "closing", "minimized");
    document.body.classList.remove("navigation-active");
    const secondary = secondarySection();
    if (secondary) secondary.style.display = "block";
    minimizeButton?.setAttribute("aria-expanded", "true");
  }

  const onMinimizeClick = (event: Event): void => {
    event.preventDefault();
    if (!banner || banner.classList.contains("hidden")) return;
    setMinimized(!banner.classList.contains("minimized"));
  };
  const onNavigationStarted = (): void => show();
  const onNavigationEnded = (): void => hide();

  minimizeButton?.addEventListener("click", onMinimizeClick);
  document.defaultView?.addEventListener(
    "navigationStarted",
    onNavigationStarted,
  );
  document.defaultView?.addEventListener("navigationEnded", onNavigationEnded);

  return Object.freeze({
    update(snapshot: NavigationRuntimeSnapshot): void {
      if (destroyed || !banner) return;
      const { guidance } = snapshot;
      const progress = clampProgress(guidance.progress);
      const arrow = textElement(document, ARROW_ID);
      const main = textElement(document, MAIN_ID);
      const details = textElement(document, DETAILS_ID);
      const distance = textElement(document, DISTANCE_ID);
      const time = textElement(document, TIME_ID);
      const progressBar = textElement(document, PROGRESS_ID);
      const progressText = textElement(document, PROGRESS_TEXT_ID);

      if (arrow) arrow.textContent = directionIcon(guidance.instruction);
      if (main) main.textContent = guidance.instruction;
      if (details) {
        details.textContent = `${guidance.instruction} por ${guidance.formattedDistance}`;
      }
      if (distance) distance.textContent = guidance.remainingDistance;
      if (time) time.textContent = guidance.estimatedTime;
      if (progressBar) progressBar.style.width = `${progress}%`;
      if (progressText) progressText.textContent = `${progress}%`;
    },
    show,
    hide,
    isVisible(): boolean {
      return Boolean(banner && !banner.classList.contains("hidden"));
    },
    isMinimized(): boolean {
      return Boolean(banner?.classList.contains("minimized"));
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      minimizeButton?.removeEventListener("click", onMinimizeClick);
      document.defaultView?.removeEventListener(
        "navigationStarted",
        onNavigationStarted,
      );
      document.defaultView?.removeEventListener(
        "navigationEnded",
        onNavigationEnded,
      );
      hide();
    },
  });
}
