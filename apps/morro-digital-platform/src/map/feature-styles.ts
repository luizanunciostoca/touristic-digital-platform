type StyleState = { promise: Promise<void>; ready: boolean };
const states = new WeakMap<Document, StyleState>();
const FEATURE_PATH =
  "/apps/morro-digital-platform/public/dist/entry-css/features.css";

function showStatus(document: Document, failed = false): HTMLElement {
  let status = document.querySelector<HTMLElement>(
    "[data-feature-style-status]",
  );
  if (!status) {
    status = document.createElement("div");
    status.dataset.featureStyleStatus = "true";
    status.style.cssText =
      "position:fixed;left:1rem;right:1rem;bottom:5rem;z-index:2147483647;padding:1rem;border-radius:12px;background:#fff;color:#172b3a;box-shadow:0 2px 12px #0003;font:16px system-ui;text-align:center";
    document.body.append(status);
  }
  const language = document.documentElement.lang.slice(0, 2);
  const copy: Record<string, readonly [string, string]> = {
    pt: ["Carregando…", "Não foi possível abrir. Tente novamente."],
    en: ["Loading…", "Unable to open. Please try again."],
    es: ["Cargando…", "No se pudo abrir. Inténtalo de nuevo."],
    he: ["טוען…", "לא ניתן לפתוח. נסו שוב."],
  };
  status.setAttribute("role", failed ? "alert" : "status");
  status.textContent = (copy[language] ?? copy.pt)![failed ? 1 : 0];
  return status;
}

/** Null preserves synchronous controllers when the entry bundle is not enabled. */
export function ensureFeatureStyles(document: Document): Promise<void> | null {
  const entry = document.querySelector<HTMLLinkElement>("link[data-entry-css]");
  if (!entry || states.get(document)?.ready) return null;
  const previous = states.get(document);
  if (previous) return previous.promise;
  const url = new URL(entry.dataset.featureCss ?? "", document.baseURI);
  if (
    url.origin !== new URL(document.baseURI).origin ||
    url.pathname !== FEATURE_PATH ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  ) {
    showStatus(document, true);
    return Promise.reject(new Error("FEATURE_STYLES_TARGET_INVALID"));
  }
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.media = "not all";
  link.href = url.href;
  link.dataset.featureCss = "true";
  const state = { ready: false } as StyleState;
  state.promise = new Promise<void>((resolve, reject) => {
    const loadingTimer = setTimeout(() => showStatus(document), 150);
    const timeout = setTimeout(() => fail(), 12000);
    const cleanup = (): void => {
      clearTimeout(loadingTimer);
      clearTimeout(timeout);
      link.onload = null;
      link.onerror = null;
    };
    const fail = (): void => {
      cleanup();
      link.remove();
      states.delete(document);
      showStatus(document, true);
      reject(new Error("FEATURE_STYLES_UNAVAILABLE"));
    };
    link.onerror = fail;
    link.onload = () => {
      if (!link.sheet || !entry.isConnected) {
        fail();
        return;
      }
      cleanup();
      // Both changes occur in one task: never expose an unstyled feature.
      link.media = "all";
      entry.disabled = true;
      state.ready = true;
      document.querySelector("[data-feature-style-status]")?.remove();
      resolve();
    };
    entry.after(link);
  });
  states.set(document, state);
  return state.promise;
}

export function createFeatureStyleGate(document: Document): {
  run: (action: () => void, onCancel?: () => void) => void;
  cancel: () => void;
} {
  let generation = 0;
  let clearPendingKey: (() => void) | undefined;
  let pendingCancel: (() => void) | undefined;
  const cancel = (): void => {
    generation += 1;
    clearPendingKey?.();
    clearPendingKey = undefined;
    const notify = pendingCancel;
    pendingCancel = undefined;
    notify?.();
  };
  return {
    run(action, onCancel): void {
      cancel();
      const current = ++generation;
      const pending = ensureFeatureStyles(document);
      if (!pending) {
        action();
        return;
      }
      pendingCancel = onCancel;
      const onKey = (event: KeyboardEvent): void => {
        if (event.key === "Escape") cancel();
      };
      document.addEventListener("keydown", onKey, true);
      const clearKey = (): void =>
        document.removeEventListener("keydown", onKey, true);
      clearPendingKey = clearKey;
      void pending
        .then(() => {
          clearKey();
          if (current === generation) {
            pendingCancel = undefined;
            clearPendingKey = undefined;
            action();
          }
        })
        .catch(() => {
          clearKey();
          if (current === generation) cancel();
          // The shared loader presents a localized retryable error.
        });
    },
    cancel,
  };
}
