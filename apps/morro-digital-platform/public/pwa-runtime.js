const PWA_STATE_EVENT = "morro:pwa-state-changed";
const PWA_UPDATE_EVENT = "morro:pwa-update-available";

function dispatchPwaState(state) {
  document.documentElement.dataset.networkState = state;
  document.dispatchEvent(
    new CustomEvent(PWA_STATE_EVENT, {
      detail: Object.freeze({ state }),
    }),
  );
}

function installNetworkStateTracking() {
  const sync = () => dispatchPwaState(navigator.onLine ? "online" : "offline");
  sync();
  window.addEventListener("online", sync);
  window.addEventListener("offline", sync);
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || !window.isSecureContext) return;

  const registration = await navigator.serviceWorker.register("/sw.js", {
    scope: "/",
  });

  if (registration.waiting) {
    document.dispatchEvent(new CustomEvent(PWA_UPDATE_EVENT));
  }

  registration.addEventListener("updatefound", () => {
    const installing = registration.installing;
    if (!installing) return;
    installing.addEventListener("statechange", () => {
      if (
        installing.state === "installed" &&
        navigator.serviceWorker.controller
      ) {
        document.dispatchEvent(new CustomEvent(PWA_UPDATE_EVENT));
      }
    });
  });
}

installNetworkStateTracking();

window.addEventListener(
  "load",
  () => {
    void registerServiceWorker().catch(() => {
      document.documentElement.dataset.pwaRegistration = "failed";
    });
  },
  { once: true },
);
