import { createDashboardAuthClient } from "@touristic/auth-browser";
import { BusinessOnboardingHostController } from "@touristic/business/onboarding-host";
import type { CheckoutApplicationRequest } from "@touristic/ordering";

import { createBusinessCheckoutBrowserClient } from "./business-checkout-browser-client.js";
import { createBusinessOnboardingAdapters } from "./business-onboarding-adapters.js";
import { BusinessOnboardingRuntime } from "./business-onboarding-runtime.js";
import { mountBusinessOnboardingSurface } from "./business-onboarding-surface.js";

function eventDetail(event: Event): Record<string, unknown> | null {
  if (!(event instanceof CustomEvent)) return null;
  return event.detail && typeof event.detail === "object"
    ? (event.detail as Record<string, unknown>)
    : null;
}

function start(): void {
  const fetchFn = window.fetch.bind(window);
  const adapters = createBusinessOnboardingAdapters({
    ...(navigator.geolocation ? { geolocation: navigator.geolocation } : {}),
    fetch: fetchFn,
  });
  const authClient = createDashboardAuthClient({
    fetchFn,
    storage: window.sessionStorage,
    location: {
      origin: window.location.origin,
      pathname: window.location.pathname,
      search: window.location.search,
      replace: (url) => window.location.replace(url),
    },
  });
  const checkoutClient = createBusinessCheckoutBrowserClient({
    fetchFn,
    authenticatedFetchFn: authClient.secureFetch,
    openCheckout: (url) =>
      window.open(url, "_blank", "noopener,noreferrer"),
    navigate: (url) => window.location.assign(url),
    dispatch: (name, detail) =>
      window.dispatchEvent(new CustomEvent(name, { detail })),
  });

  let runtime: BusinessOnboardingRuntime | null = null;
  const host = new BusinessOnboardingHostController({
    beforeTransition: (context) => runtime?.beforeTransition(context) ?? false,
  });
  runtime = new BusinessOnboardingRuntime(host, adapters, window);

  window.addEventListener("businessPaymentsCapabilityProvided", (event) => {
    const detail = eventDetail(event);
    if (!detail) return;
    checkoutClient.setGuestCapability(detail.token);
  });
  window.addEventListener("businessCheckoutRequested", (event) => {
    const detail = eventDetail(event);
    if (!detail) return;
    void checkoutClient.start(detail as CheckoutApplicationRequest);
  });
  window.addEventListener("businessPaymentVerified", (event) => {
    const detail = eventDetail(event);
    if (!detail || !runtime) return;
    void runtime.verifyPayment(detail);
  });
  window.addEventListener("businessPaymentVerificationFailed", (event) => {
    const detail = eventDetail(event);
    const message =
      typeof detail?.message === "string" && detail.message.trim()
        ? detail.message.trim()
        : "O pagamento não foi confirmado.";
    window.dispatchEvent(
      new CustomEvent("businessCommercialCheckoutFailed", {
        detail: {
          sessionId:
            typeof detail?.sessionId === "string" ? detail.sessionId : "",
          message,
          verifiedByPaymentsBoundary: false,
        },
      }),
    );
    window.dispatchEvent(
      new CustomEvent("businessConversationPresentation", {
        detail: {
          source: "payments-browser",
          kind: "error",
          title: "Pagamento não confirmado",
          message,
          tutorial: false,
        },
      }),
    );
  });
  window.addEventListener("pagehide", () => checkoutClient.cancel());

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
