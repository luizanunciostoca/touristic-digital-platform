import {
  createBusinessOrderRequestKey,
  normalizeBusinessCheckoutHandoff,
  type CheckoutApplicationRequest,
} from "@touristic/ordering";

import { createServerIssuedPaymentsCheckoutAuthority } from "./payments-browser-authority-bootstrap.js";
import {
  PaymentsBrowserCheckoutError,
  createPaymentsBrowserCheckoutClient,
  createWindowPaymentsBrowserCheckoutSignals,
} from "./payments-browser-checkout-client.js";

export interface BusinessPaymentsCheckoutComposition {
  uninstall(): void;
}

export function installBusinessPaymentsCheckoutComposition(
  view: Window,
  fetchFn: typeof fetch = view.fetch.bind(view),
): BusinessPaymentsCheckoutComposition {
  const signals = createWindowPaymentsBrowserCheckoutSignals(view);
  const client = createPaymentsBrowserCheckoutClient({
    fetchFn,
    authority: createServerIssuedPaymentsCheckoutAuthority(fetchFn),
    popup: {
      open(url, target, features) {
        return view.open(url, target, features);
      },
      assign(url) {
        view.location.assign(url);
      },
    },
    signals,
  });
  const inFlight = new Set<string>();

  const onCheckoutRequested = (event: Event): void => {
    if (!(event instanceof CustomEvent)) return;
    const handoff = normalizeBusinessCheckoutHandoff(
      event.detail as CheckoutApplicationRequest,
    );
    if (!handoff) return;
    const requestKey = createBusinessOrderRequestKey(
      handoff.sessionId,
      handoff.planId,
    );
    if (!requestKey || inFlight.has(requestKey)) return;
    inFlight.add(requestKey);

    void client
      .start(handoff)
      .then((session) => {
        void session.confirmation
          .catch(() => undefined)
          .finally(() => inFlight.delete(requestKey));
      })
      .catch(async (error: unknown) => {
        inFlight.delete(requestKey);
        const failure =
          error instanceof PaymentsBrowserCheckoutError
            ? error
            : new PaymentsBrowserCheckoutError(
                "PAYMENTS_BROWSER_CHECKOUT_REJECTED",
                "Não foi possível iniciar a contratação.",
              );
        await signals.failed({
          sessionId: handoff.sessionId,
          message: failure.message,
          code: failure.code,
        });
      });
  };

  view.addEventListener("businessCheckoutRequested", onCheckoutRequested);
  return Object.freeze({
    uninstall(): void {
      view.removeEventListener(
        "businessCheckoutRequested",
        onCheckoutRequested,
      );
      inFlight.clear();
    },
  });
}
