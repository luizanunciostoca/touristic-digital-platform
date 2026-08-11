import { BusinessOnboardingHostController } from "@touristic/business/onboarding-host";

import { createBusinessOnboardingAdapters } from "./business-onboarding-adapters.js";
import { BusinessOnboardingRuntime } from "./business-onboarding-runtime.js";
import { mountBusinessOnboardingSurface } from "./business-onboarding-surface.js";

function start(): void {
  const adapters = createBusinessOnboardingAdapters({
    ...(navigator.geolocation ? { geolocation: navigator.geolocation } : {}),
    fetch: window.fetch.bind(window),
  });

  let runtime: BusinessOnboardingRuntime | null = null;
  const host = new BusinessOnboardingHostController({
    beforeTransition: (context) => runtime?.beforeTransition(context) ?? false,
  });
  runtime = new BusinessOnboardingRuntime(host, adapters, window);

  mountBusinessOnboardingSurface({
    host,
    onStepEnter: (snapshot) => runtime?.onStepEnter(snapshot),
    onRuntimeAction: (action) =>
      runtime?.handleAction(
        action as Parameters<BusinessOnboardingRuntime["handleAction"]>[0],
      ) ?? false,
    onSkip: () => {
      window.dispatchEvent(
        new CustomEvent("businessConversationAbandoned", {
          detail: { reason: "user_skip" },
        }),
      );
    },
    onComplete: (snapshot) => {
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
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}
