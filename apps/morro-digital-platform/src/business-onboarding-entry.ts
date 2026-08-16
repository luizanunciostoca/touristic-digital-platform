import {
  BusinessOnboardingHostController,
  type BusinessOnboardingHostSnapshot,
} from "@touristic/business/onboarding-host";

import { createBusinessOnboardingAdapters } from "./business-onboarding-adapters.js";
import { BusinessOnboardingBrowserLifecycle } from "./business-onboarding-browser-lifecycle.js";
import { BusinessOnboardingRuntime } from "./business-onboarding-runtime.js";
import { BusinessOnboardingBrowserSessionStore } from "./business-onboarding-session-store.js";
import { mountBusinessOnboardingSurface } from "./business-onboarding-surface.js";
import { installBusinessPaymentsCheckoutComposition } from "./payments-business-checkout-composition.js";

function resolveBrowserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function start(): void {
  const adapters = createBusinessOnboardingAdapters({
    ...(navigator.geolocation ? { geolocation: navigator.geolocation } : {}),
    fetch: window.fetch.bind(window),
  });
  const sessionStore = new BusinessOnboardingBrowserSessionStore(
    resolveBrowserStorage(),
  );
  const persistedSession = sessionStore.load();

  let runtime: BusinessOnboardingRuntime | null = null;
  const host = new BusinessOnboardingHostController({
    ...(persistedSession ? { session: persistedSession } : {}),
    beforeTransition: (context) => runtime?.beforeTransition(context) ?? false,
    onChange: (snapshot) => sessionStore.save(snapshot.session),
  });
  sessionStore.save(host.snapshot().session);

  runtime = new BusinessOnboardingRuntime(host, adapters, window);
  installBusinessPaymentsCheckoutComposition(window, window.fetch.bind(window));
  window.addEventListener("businessPaymentVerified", (event) => {
    if (!(event instanceof CustomEvent) || !runtime) return;
    const detail =
      event.detail && typeof event.detail === "object"
        ? (event.detail as Record<string, unknown>)
        : {};
    void runtime.verifyPayment(detail);
  });

  const onStepEnter = (
    snapshot: BusinessOnboardingHostSnapshot,
  ): void | Promise<void> => runtime?.onStepEnter(snapshot);

  const surface = mountBusinessOnboardingSurface({
    host,
    onStepEnter,
    onRuntimeAction: (action) =>
      runtime?.handleAction(
        action as Parameters<BusinessOnboardingRuntime["handleAction"]>[0],
      ) ?? false,
    onSkip: (snapshot) => {
      window.dispatchEvent(
        new CustomEvent("businessConversationAbandoned", {
          detail: {
            reason: "user_skip",
            stepId: snapshot.stepId,
            status: snapshot.session.status,
          },
        }),
      );
    },
    onComplete: (snapshot) => {
      sessionStore.clear();
      window.dispatchEvent(
        new CustomEvent("businessConversationCompleted", {
          detail: {
            stepId: snapshot.stepId,
            status: snapshot.session.status,
          },
        }),
      );
    },
  });

  const browserLifecycle = new BusinessOnboardingBrowserLifecycle({
    host,
    surface,
    onStepEnter,
    onPause: (snapshot) => {
      window.dispatchEvent(
        new CustomEvent("businessConversationPaused", {
          detail: {
            reason: "user_pause",
            stepId: snapshot.stepId,
            status: snapshot.session.status,
          },
        }),
      );
    },
    onRestart: (snapshot) => {
      window.dispatchEvent(
        new CustomEvent("businessConversationRestarted", {
          detail: {
            stepId: snapshot.stepId,
            status: snapshot.session.status,
          },
        }),
      );
    },
  });
  browserLifecycle.install();

  if (persistedSession) {
    const snapshot = host.snapshot();
    window.dispatchEvent(
      new CustomEvent("businessConversationResumed", {
        detail: {
          stepId: snapshot.stepId,
          status: snapshot.session.status,
          previousStatus: persistedSession.status,
        },
      }),
    );
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}
