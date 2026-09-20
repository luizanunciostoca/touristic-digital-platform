const PWA_UPDATE_AVAILABLE_EVENT = "morro:pwa-update-available";
const PWA_REGISTRATION_FAILED_EVENT = "morro:pwa-registration-failed";
const NETWORK_STATE_CHANGED_EVENT = "morro:network-state-changed";

function updateNetworkState() {
  const state = navigator.onLine ? "online" : "offline";
  document.documentElement.dataset.networkState = state;
  document.dispatchEvent(
    new CustomEvent(NETWORK_STATE_CHANGED_EVENT, {
      detail: Object.freeze({ state }),
    }),
  );
}

function announceUpdate(registration) {
  if (!registration.waiting) return;
  document.documentElement.dataset.pwaUpdate = "available";
  document.dispatchEvent(
    new CustomEvent(PWA_UPDATE_AVAILABLE_EVENT, {
      detail: Object.freeze({ registration }),
    }),
  );
}

window.addEventListener("online", updateNetworkState);
window.addEventListener("offline", updateNetworkState);
updateNetworkState();

if ("serviceWorker" in navigator && window.isSecureContext) {
  let updateRequested = false;

  window.addEventListener("load", () => {
    void navigator.serviceWorker
      .register("/service-worker.js", { scope: "/" })
      .then((registration) => {
        document.documentElement.dataset.pwaState = "registered";
        announceUpdate(registration);

        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            if (
              worker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              announceUpdate(registration);
            }
          });
        });

        const controller = Object.freeze({
          registration,
          applyUpdate() {
            if (!registration.waiting) return;
            updateRequested = true;
            registration.waiting.postMessage({ type: "SKIP_WAITING" });
          },
        });
        window.__MORRO_PWA__ = controller;
      })
      .catch(() => {
        document.documentElement.dataset.pwaState = "registration-failed";
        document.dispatchEvent(new CustomEvent(PWA_REGISTRATION_FAILED_EVENT));
      });
  });

  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!updateRequested || reloading) return;
    reloading = true;
    window.location.reload();
  });
}
