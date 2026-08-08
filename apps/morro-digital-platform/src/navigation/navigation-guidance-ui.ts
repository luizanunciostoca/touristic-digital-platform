import type { NavigationRuntimeSnapshot } from "@touristic/navigation";

export interface NavigationGuidanceUi {
  start(): void;
  update(snapshot: NavigationRuntimeSnapshot): void;
  stop(): void;
  destroy(): void;
}

const STYLE_ID = "navigation-guidance-v2-styles";

function formatDistance(meters: number): string {
  const value = Math.max(0, Number.isFinite(meters) ? meters : 0);
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)} km`;
  return `${Math.round(value)} m`;
}

function formatDuration(seconds: number): string {
  const value = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  if (value < 60) return "< 1 min";
  const minutes = Math.max(1, Math.round(value / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder > 0 ? `${hours} h ${remainder} min` : `${hours} h`;
}

function directionFor(instruction: string): {
  readonly arrow: string;
  readonly className: string;
} {
  const text = instruction.toLowerCase();
  if (text.includes("arriv") || text.includes("destination")) {
    return { arrow: "●", className: "arrive" };
  }
  if (text.includes("u-turn") || text.includes("uturn") || text.includes("retorno")) {
    return { arrow: "↶", className: "turn-uturn" };
  }
  if (text.includes("left") || text.includes("esquerda")) {
    return { arrow: "←", className: "turn-left" };
  }
  if (text.includes("right") || text.includes("direita")) {
    return { arrow: "→", className: "turn-right" };
  }
  return { arrow: "↑", className: "continue-straight" };
}

function ensureStyles(document: Document): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
.instruction-banner{--nav-primary:linear-gradient(135deg,#2563eb,#3b82f6);position:fixed!important;left:50%!important;top:0!important;transform:translateX(-50%)!important;width:100%!important;max-width:480px!important;z-index:2300!important;display:flex!important;flex-direction:column!important;border-radius:0 0 16px 16px!important;overflow:hidden!important;background:#fff!important;box-shadow:0 10px 25px rgba(0,0,0,.25),0 5px 12px rgba(0,0,0,.15);transition:transform .3s ease,opacity .3s ease}
.instruction-banner.hidden{display:flex!important;opacity:0;transform:translateX(-50%) translateY(-110%)!important;pointer-events:none}
.instruction-primary{display:flex;align-items:center;gap:12px;background:var(--nav-primary);color:#f8fafc;padding:8px 12px}
#instruction-arrow{display:flex;align-items:center;justify-content:center;min-width:48px;height:48px;font-size:1.8rem}
#instruction-main{font-size:1.25rem;font-weight:600;line-height:1.2;margin:0;flex:1;color:#fff}
#minimize-navigation-btn{width:30px;height:30px;border:0;border-radius:50%;background:rgba(255,255,255,.18);color:#fff;cursor:pointer;position:relative}
#minimize-navigation-btn::before{content:"×";position:absolute;inset:0;display:grid;place-items:center;font-size:1.3rem;line-height:1}
.instruction-banner.minimized #minimize-navigation-btn::before{content:"+"}
.instruction-secondary{display:block!important;padding:10px 14px!important;background:#f8fafc;color:#334155;opacity:1!important}
.instruction-banner.minimized .instruction-secondary{display:none!important}
#instruction-details{font-size:.95rem;line-height:1.35;margin:0 0 .6rem}
.progress-container{height:4px;width:100%;background:rgba(0,0,0,.08);border-radius:2px;overflow:hidden;margin:.55rem 0 .35rem}
.progress-indicator-fill{height:100%;background:#38bdf8;min-width:2px;transition:width .35s ease}
#progress-text{text-align:center;font-size:.8rem;margin:4px 0}
.metrics-group{display:flex;justify-content:space-between;gap:8px;margin-top:.4rem}.metric{display:flex;flex-direction:column;align-items:center;background:rgba(0,0,0,.03);border-radius:8px;width:50%;padding:4px}.metric-label{font-size:.72rem;color:rgba(0,0,0,.55)}.metric-value{font-size:.95rem;font-weight:600;color:#334155}
.end-navigation-btn{position:fixed;right:12px;bottom:calc(var(--assistant-input-bottom,0px) + var(--assistant-bar-height,5rem) + 12px);z-index:2301;border:0;border-radius:999px;padding:.72rem 1rem;background:#dc2626;color:#fff;font:inherit;font-weight:600;box-shadow:0 5px 16px rgba(0,0,0,.22);cursor:pointer}
body.navigation-active .quick-actions,body.navigation-active #assistant-messages,body.navigation-active #globe-map-control{opacity:.28;pointer-events:none}
@media (prefers-color-scheme:dark){.instruction-secondary{background:#1e293b;color:#e2e8f0}.metric{background:rgba(255,255,255,.05)}.metric-label{color:rgba(255,255,255,.6)}.metric-value{color:#e2e8f0}}
`;
  document.head.appendChild(style);
}

export function createNavigationGuidanceUi(document: Document): NavigationGuidanceUi {
  const banner = document.getElementById("instruction-banner");
  const endButton = document.getElementById("end-navigation-btn");
  const minimizeButton = document.getElementById("minimize-navigation-btn");
  const main = document.getElementById("instruction-main");
  const details = document.getElementById("instruction-details");
  const arrow = document.getElementById("instruction-arrow");
  const distance = document.getElementById("instruction-distance");
  const time = document.getElementById("instruction-time");
  const progress = document.getElementById("route-progress") as HTMLElement | null;
  const progressText = document.getElementById("progress-text");
  let active = false;
  let destroyed = false;

  ensureStyles(document);

  const show = (): void => {
    if (destroyed) return;
    active = true;
    document.body.classList.add("navigation-active");
    banner?.classList.remove("hidden");
    endButton?.setAttribute("style", "display:block;");
  };

  const hide = (): void => {
    if (destroyed) return;
    active = false;
    document.body.classList.remove("navigation-active");
    banner?.classList.add("hidden");
    banner?.classList.remove("minimized");
    minimizeButton?.setAttribute("aria-expanded", "true");
    endButton?.setAttribute("style", "display:none;");
  };

  const toggleMinimized = (): void => {
    if (!banner || destroyed) return;
    const minimized = banner.classList.toggle("minimized");
    minimizeButton?.setAttribute("aria-expanded", String(!minimized));
  };
  minimizeButton?.addEventListener("click", toggleMinimized);

  return Object.freeze({
    start: show,
    update(snapshot: NavigationRuntimeSnapshot): void {
      if (destroyed) return;
      if (!active) show();
      const guidance = snapshot.guidance;
      const instruction = guidance.instruction || guidance.original || "Continue pela rota";
      const direction = directionFor(instruction);
      const percent = Math.max(0, Math.min(100, Math.round(snapshot.progressPercent)));

      if (main) main.textContent = instruction;
      if (details) {
        details.textContent = `${guidance.original || instruction} • próxima manobra em ${formatDistance(snapshot.distanceToNextManeuver)}`;
      }
      if (arrow) arrow.textContent = direction.arrow;
      if (distance) distance.textContent = formatDistance(snapshot.remainingDistance);
      if (time) time.textContent = formatDuration(snapshot.remainingDuration);
      if (progress) progress.style.width = `${percent}%`;
      if (progressText) progressText.textContent = `${percent}%`;

      banner?.classList.remove(
        "turn-left",
        "turn-right",
        "turn-uturn",
        "arrive",
        "continue-straight",
      );
      banner?.classList.add(direction.className);
    },
    stop: hide,
    destroy(): void {
      if (destroyed) return;
      hide();
      destroyed = true;
      minimizeButton?.removeEventListener("click", toggleMinimized);
      document.getElementById(STYLE_ID)?.remove();
    },
  });
}
