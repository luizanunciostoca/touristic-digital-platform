import { mountBusinessOnboardingSurface } from "./business-onboarding-surface.js";

function start(): void {
  mountBusinessOnboardingSurface({
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
