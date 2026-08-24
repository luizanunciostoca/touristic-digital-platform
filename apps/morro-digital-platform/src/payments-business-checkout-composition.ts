import {
  createBusinessOrderRequestKey,
  normalizeBusinessCheckoutHandoff,
  type CheckoutApplicationRequest,
} from "@touristic/ordering";

import {
  createMercadoPagoCardPaymentBrick,
  type CardPaymentBrickSession,
  type MercadoPagoCardPaymentBrick,
} from "./mercado-pago-card-payment-brick.js";
import { createServerIssuedPaymentsCheckoutAuthority } from "./payments-browser-authority-bootstrap.js";
import {
  PaymentsBrowserCheckoutError,
  createPaymentsBrowserCheckoutClient,
  createWindowPaymentsBrowserCheckoutSignals,
} from "./payments-browser-checkout-client.js";

const checkoutApiPath = "/api/payments/v1/checkouts";
const statusTokenPattern = /^cst_v1_[A-Za-z0-9_-]{16,220}$/u;

interface CheckoutBrickBootstrap {
  readonly checkoutId: string;
  readonly statusToken: string;
  readonly plan: Readonly<{
    amount: Readonly<{
      minorUnits: number;
      currency: string;
    }>;
  }>;
}

export interface BusinessPaymentsCheckoutComposition {
  uninstall(): void;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function checkoutBrickBootstrap(value: unknown): CheckoutBrickBootstrap | null {
  const envelope = record(value);
  const data = record(envelope?.data);
  const plan = record(data?.plan);
  const amount = record(plan?.amount);
  if (!data || !plan || !amount) return null;

  const checkoutId =
    typeof data.checkoutId === "string" ? data.checkoutId.trim() : "";
  const statusToken =
    typeof data.statusToken === "string" ? data.statusToken.trim() : "";
  const minorUnits = amount.minorUnits;
  const currency =
    typeof amount.currency === "string" ? amount.currency.trim().toUpperCase() : "";

  if (
    !checkoutId.startsWith("ord_") ||
    !statusTokenPattern.test(statusToken) ||
    typeof minorUnits !== "number" ||
    !Number.isSafeInteger(minorUnits) ||
    minorUnits <= 0 ||
    !/^[A-Z]{3}$/u.test(currency)
  ) {
    return null;
  }

  return Object.freeze({
    checkoutId,
    statusToken,
    plan: Object.freeze({
      amount: Object.freeze({ minorUnits, currency }),
    }),
  });
}

function requestPath(input: RequestInfo | URL, view: Window): string {
  try {
    if (typeof input === "string") return new URL(input, view.location.href).pathname;
    if (input instanceof URL) return input.pathname;
    return new URL(input.url, view.location.href).pathname;
  } catch {
    return "";
  }
}

function createUnavailableBrick(error: unknown): MercadoPagoCardPaymentBrick {
  const failure =
    error instanceof Error
      ? error
      : new Error("PAYMENTS_BRICK_CONFIGURATION_INVALID");
  return Object.freeze({
    available: true,
    async present(): Promise<void> {
      throw failure;
    },
    async destroy(): Promise<void> {},
  });
}

export function installBusinessPaymentsCheckoutComposition(
  view: Window,
  fetchFn: typeof fetch = view.fetch.bind(view),
): BusinessPaymentsCheckoutComposition {
  const signals = createWindowPaymentsBrowserCheckoutSignals(view);
  let brick: MercadoPagoCardPaymentBrick;
  try {
    brick = createMercadoPagoCardPaymentBrick(view, view.document, fetchFn);
  } catch (error) {
    brick = createUnavailableBrick(error);
  }

  const bootstraps = new Map<string, CheckoutBrickBootstrap>();
  const checkoutFetch: typeof fetch = async (input, init) => {
    const response = await fetchFn(input, init);
    const method = String(init?.method ?? (input instanceof Request ? input.method : "GET"))
      .trim()
      .toUpperCase();
    if (
      brick.available &&
      method === "POST" &&
      requestPath(input, view) === checkoutApiPath &&
      response.ok
    ) {
      try {
        const payload = (await response.clone().json()) as unknown;
        const bootstrap = checkoutBrickBootstrap(payload);
        if (bootstrap) bootstraps.set(bootstrap.checkoutId, bootstrap);
      } catch {
        // The canonical checkout client will reject malformed responses itself.
      }
    }
    return response;
  };

  const client = createPaymentsBrowserCheckoutClient({
    fetchFn: checkoutFetch,
    authority: createServerIssuedPaymentsCheckoutAuthority(fetchFn),
    popup: {
      open(url, target, features) {
        return brick.available
          ? Object.freeze({})
          : view.open(url, target, features);
      },
      assign(url) {
        if (!brick.available) view.location.assign(url);
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
      .then(async (session) => {
        if (brick.available) {
          const bootstrap = bootstraps.get(session.checkoutId);
          bootstraps.delete(session.checkoutId);
          if (!bootstrap) {
            await signals.failed({
              sessionId: handoff.sessionId,
              message: "Não foi possível iniciar o pagamento seguro.",
              code: "PAYMENTS_BROWSER_INVALID_RESPONSE",
            });
            return;
          }
          const brickSession: CardPaymentBrickSession = Object.freeze({
            checkoutId: bootstrap.checkoutId,
            statusToken: bootstrap.statusToken,
            plan: bootstrap.plan,
            payerEmail: handoff.contractor.email,
          });
          try {
            await brick.present(brickSession);
          } catch {
            await signals.failed({
              sessionId: handoff.sessionId,
              message: "O pagamento seguro está temporariamente indisponível.",
              code: "PAYMENTS_BROWSER_CHECKOUT_REJECTED",
            });
            return;
          }
        }
        await session.confirmation.catch(() => undefined);
      })
      .catch(async (error: unknown) => {
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
      })
      .finally(() => {
        inFlight.delete(requestKey);
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
      bootstraps.clear();
      void brick.destroy();
    },
  });
}
