import { describe, expect, it, vi } from "vitest";

import { createBusinessCheckoutBrowserClient } from "./business-checkout-browser-client.js";

function handoff() {
  return {
    sessionId: "business-onboarding:2026-08-15T04:00:00.000Z",
    planId: "growth",
    contractor: {
      name: "Luiz Silva",
      email: "luiz@example.com",
      phone: "+55 75 99999-0000",
      document: "12345678900",
    },
    businessDraft: {
      demoBusinessId: "demo_m149",
      displayName: "M149 Business",
      categoryId: "restaurant",
      specialty: "Local",
      environment: "sandbox",
      publishable: false,
    },
    acceptedTerms: [
      {
        type: "terms",
        version: "terms-v1",
        acceptedAt: "2026-08-15T04:00:00Z",
      },
      {
        type: "privacy",
        version: "privacy-v1",
        acceptedAt: "2026-08-15T04:00:00Z",
      },
    ],
    returnUrl: "https://morro.digital/business-onboarding.html",
    tutorial: false,
    requiresPaymentsCapability: true,
  } as const;
}

function jsonResponse(body: unknown, status = 200): Response {
  const payload = JSON.stringify(body);
  return new Response(payload, {
    status,
    headers: {
      "Content-Type": "application/json",
      "Content-Length": String(new TextEncoder().encode(payload).byteLength),
    },
  });
}

function launchResponse() {
  return jsonResponse(
    {
      data: {
        checkoutId: "ord_m149_checkout_0001",
        paymentId: "pay_m149_checkout_0001",
        status: "PENDING",
        statusToken: "cst_v1_browser_m149_status_token",
        statusExpiresAt: "2026-08-16T04:00:00Z",
        checkoutUrl: "https://pay.example/checkout/m149",
        replayed: false,
      },
    },
    201,
  );
}

function eventCollector() {
  const events: Array<{
    readonly name: string;
    readonly detail: Readonly<Record<string, unknown>>;
  }> = [];
  return {
    events,
    dispatch(name: string, detail: Readonly<Record<string, unknown>>) {
      events.push({ name, detail });
    },
  };
}

describe("M149 Payments browser checkout client", () => {
  it("uses a one-shot guest capability, exact idempotency and verified server projection", async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const responses = [
      launchResponse(),
      jsonResponse({
        data: {
          status: "CONFIRMED",
          verifiedPayment: null,
          verifiedFailure: null,
        },
      }),
      jsonResponse({
        data: {
          status: "CONFIRMED",
          verifiedPayment: {
            verified: true,
            sessionId: handoff().sessionId,
            reference: "provider-payment-m149",
            definitiveBusinessId: null,
            activationStatus: "READY_TO_CONVERT",
          },
          verifiedFailure: null,
        },
      }),
    ];
    const fetchFn = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), init: init ?? {} });
      const response = responses.shift();
      if (!response) throw new Error("UNEXPECTED_REQUEST");
      return Promise.resolve(response);
    });
    const authenticatedFetchFn = vi.fn(() =>
      Promise.reject(new Error("AUTH_FETCH_MUST_NOT_RUN")),
    );
    const opened: string[] = [];
    const collector = eventCollector();
    const client = createBusinessCheckoutBrowserClient({
      fetchFn,
      authenticatedFetchFn,
      openCheckout(url) {
        opened.push(url);
        return {};
      },
      dispatch: collector.dispatch,
      sleep: () => Promise.resolve(),
      pollIntervalMs: 10,
      maxPollAttempts: 3,
    });

    expect(client.setGuestCapability("guest-capability-m149")).toBe(true);
    await expect(client.start(handoff())).resolves.toBe(true);

    expect(authenticatedFetchFn).not.toHaveBeenCalled();
    expect(opened).toEqual(["https://pay.example/checkout/m149"]);
    expect(requests).toHaveLength(3);
    expect(requests[0]?.url).toBe("/api/payments/v1/checkouts");
    const createHeaders = new Headers(requests[0]?.init.headers);
    expect(createHeaders.get("idempotency-key")).toBe(
      `business:${handoff().sessionId}:growth`,
    );
    expect(createHeaders.get("x-checkout-handoff-token")).toBe(
      "guest-capability-m149",
    );
    expect(requests[1]?.url).toBe(
      "/api/payments/v1/checkouts/ord_m149_checkout_0001",
    );
    expect(new Headers(requests[1]?.init.headers).get("x-checkout-token")).toBe(
      "cst_v1_browser_m149_status_token",
    );
    expect(
      collector.events.filter((event) => event.name === "businessPaymentVerified"),
    ).toEqual([
      {
        name: "businessPaymentVerified",
        detail: {
          verified: true,
          sessionId: handoff().sessionId,
          reference: "provider-payment-m149",
          definitiveBusinessId: null,
          activationStatus: "READY_TO_CONVERT",
        },
      },
    ]);
    expect(
      collector.events.some(
        (event) => event.name === "businessPaymentVerificationFailed",
      ),
    ).toBe(false);
  });

  it("never synthesizes Business verification from a bare CONFIRMED status", async () => {
    const responses = [
      launchResponse(),
      jsonResponse({ data: { status: "CONFIRMED" } }),
      jsonResponse({ data: { status: "CONFIRMED" } }),
    ];
    const collector = eventCollector();
    const client = createBusinessCheckoutBrowserClient({
      fetchFn: () => Promise.resolve(responses.shift() ?? jsonResponse({})),
      authenticatedFetchFn: () =>
        Promise.resolve(responses.shift() ?? jsonResponse({})),
      openCheckout: () => ({}),
      dispatch: collector.dispatch,
      sleep: () => Promise.resolve(),
      pollIntervalMs: 10,
      maxPollAttempts: 2,
    });

    await expect(client.start(handoff())).resolves.toBe(false);
    expect(
      collector.events.some((event) => event.name === "businessPaymentVerified"),
    ).toBe(false);
    expect(
      collector.events.filter(
        (event) => event.name === "businessPaymentVerificationFailed",
      ),
    ).toEqual([
      {
        name: "businessPaymentVerificationFailed",
        detail: {
          sessionId: handoff().sessionId,
          message:
            "A confirmação do pagamento não chegou dentro do tempo esperado.",
        },
      },
    ]);
  });

  it("maps verified and terminal failures without exposing provider payloads", async () => {
    const collector = eventCollector();
    const responses = [
      launchResponse(),
      jsonResponse({
        data: {
          status: "FAILED",
          verifiedFailure: {
            verified: true,
            sessionId: handoff().sessionId,
            reason: "failed",
            resultId: "fev_m149_failure_0001",
            providerSecret: "must-not-leak",
          },
        },
      }),
    ];
    const client = createBusinessCheckoutBrowserClient({
      fetchFn: () => Promise.resolve(responses.shift() ?? jsonResponse({})),
      authenticatedFetchFn: () =>
        Promise.resolve(responses.shift() ?? jsonResponse({})),
      openCheckout: () => ({}),
      dispatch: collector.dispatch,
      sleep: () => Promise.resolve(),
      pollIntervalMs: 10,
      maxPollAttempts: 2,
    });

    await expect(client.start(handoff())).resolves.toBe(false);
    const failure = collector.events.find(
      (event) => event.name === "businessPaymentVerificationFailed",
    );
    expect(failure?.detail).toEqual({
      sessionId: handoff().sessionId,
      message: "O pagamento não foi confirmado.",
    });
    expect(JSON.stringify(failure)).not.toContain("must-not-leak");
  });

  it("uses authenticated transport when no guest capability is present", async () => {
    const direct = vi.fn(() =>
      Promise.resolve(
        jsonResponse({ data: { status: "EXPIRED" } }),
      ),
    );
    const authenticated = vi.fn(() => Promise.resolve(launchResponse()));
    const client = createBusinessCheckoutBrowserClient({
      fetchFn: direct,
      authenticatedFetchFn: authenticated,
      openCheckout: () => ({}),
      dispatch: () => undefined,
      sleep: () => Promise.resolve(),
      pollIntervalMs: 10,
      maxPollAttempts: 1,
    });

    await expect(client.start(handoff())).resolves.toBe(false);
    expect(authenticated).toHaveBeenCalledTimes(1);
    expect(direct).toHaveBeenCalledTimes(1);
    expect(
      new Headers(authenticated.mock.calls[0]?.[1]?.headers).has(
        "x-checkout-handoff-token",
      ),
    ).toBe(false);
  });

  it("falls back to top-level navigation when the provider popup is blocked", async () => {
    const navigations: string[] = [];
    let statusCalls = 0;
    const client = createBusinessCheckoutBrowserClient({
      fetchFn: () => {
        statusCalls += 1;
        return Promise.resolve(launchResponse());
      },
      authenticatedFetchFn: () => Promise.resolve(launchResponse()),
      openCheckout: () => null,
      navigate: (url) => navigations.push(url),
      dispatch: () => undefined,
      sleep: () => Promise.resolve(),
      pollIntervalMs: 10,
      maxPollAttempts: 1,
    });

    await expect(client.start(handoff())).resolves.toBe(true);
    expect(navigations).toEqual(["https://pay.example/checkout/m149"]);
    expect(statusCalls).toBe(0);
  });

  it("cancels an older wait when a new checkout starts", async () => {
    const collector = eventCollector();
    const createResponses = [launchResponse(), launchResponse()];
    const authenticatedFetchFn = vi.fn(() =>
      Promise.resolve(createResponses.shift() ?? launchResponse()),
    );
    let releaseSleep: (() => void) | undefined;
    const sleep = () =>
      new Promise<void>((resolve) => {
        releaseSleep = resolve;
      });
    const direct = vi.fn(() =>
      Promise.resolve(jsonResponse({ data: { status: "PENDING" } })),
    );
    const client = createBusinessCheckoutBrowserClient({
      fetchFn: direct,
      authenticatedFetchFn,
      openCheckout: () => ({}),
      dispatch: collector.dispatch,
      sleep,
      pollIntervalMs: 10,
      maxPollAttempts: 2,
    });

    const first = client.start(handoff());
    await Promise.resolve();
    const secondHandoff = { ...handoff(), sessionId: "business-onboarding:new" };
    const second = client.start(secondHandoff);
    await Promise.resolve();
    client.cancel();
    releaseSleep?.();

    await expect(first).resolves.toBe(false);
    await expect(second).resolves.toBe(false);
    expect(
      collector.events.filter(
        (event) => event.name === "businessPaymentVerificationFailed",
      ),
    ).toEqual([]);
  });
});
