import { describe, expect, it } from "vitest";

import {
  createPaymentsBrowserCheckoutClient,
  PAYMENTS_BROWSER_MAX_POLL_ATTEMPTS,
  PAYMENTS_BROWSER_POLL_INTERVAL_MS,
  PaymentsBrowserCheckoutError,
  type PaymentsBrowserCheckoutFailure,
  type PaymentsBrowserVerifiedPayment,
} from "./payments-browser-checkout-client.js";

const handoff = Object.freeze({
  sessionId: "business_session_m148",
  planId: "growth",
  contractor: Object.freeze({
    name: "Luiz Silva",
    email: "luiz@example.com",
    phone: "75999999999",
    document: "12345678900",
  }),
  businessDraft: Object.freeze({
    demoBusinessId: "demo_business_m148",
    displayName: "Toca do Morcego",
    categoryId: "events",
    specialty: "Sunset",
    environment: "sandbox",
    publishable: false,
  }),
  acceptedTerms: Object.freeze([
    Object.freeze({
      type: "terms",
      version: "business-partner-terms-2026-08",
      acceptedAt: "2026-08-15T04:30:00.000Z",
    }),
    Object.freeze({
      type: "privacy",
      version: "privacy-policy-2026-08",
      acceptedAt: "2026-08-15T04:30:00.000Z",
    }),
  ]),
  returnUrl: "https://morro.example.test/business-onboarding.html",
  tutorial: false,
  requiresPaymentsCapability: true,
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function checkoutResponse() {
  return jsonResponse({
    data: {
      checkoutId: "ord_m148checkout001",
      paymentId: "pay_m148payment001",
      status: "PENDING",
      statusToken: `cst_v1_${"a".repeat(43)}`,
      statusExpiresAt: "2026-08-16T04:30:00.000Z",
      checkoutUrl: "https://sandbox-payments.example.test/checkout/001",
      replayed: false,
    },
  });
}

function statusResponse(
  status: string,
  verifiedPayment: Record<string, unknown> | null = null,
  overrides: Record<string, unknown> = {},
) {
  return jsonResponse({
    data: {
      checkoutId: "ord_m148checkout001",
      sessionId: "business_session_m148",
      status,
      verifiedPayment,
      ...overrides,
    },
  });
}

function harness(
  responses: Response[],
  options: {
    readonly authority?: Readonly<Record<string, string>>;
    readonly popupResult?: unknown | null;
    readonly maxPollAttempts?: number;
  } = {},
) {
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const waits: number[] = [];
  const opens: Array<{ url: string; target: string; features: string }> = [];
  const assignments: string[] = [];
  const verified: PaymentsBrowserVerifiedPayment[] = [];
  const failed: PaymentsBrowserCheckoutFailure[] = [];
  let responseIndex = 0;

  const client = createPaymentsBrowserCheckoutClient({
    fetchFn: async (input, init = {}) => {
      requests.push({ url: String(input), init });
      const response = responses[responseIndex];
      responseIndex += 1;
      if (!response) throw new Error("UNEXPECTED_FETCH");
      return response;
    },
    authority: {
      resolveCreateHeaders: async () =>
        options.authority ?? {
          "X-Checkout-Handoff-Token": "signed-handoff-token-m148",
        },
    },
    popup: {
      open: (url, target, features) => {
        opens.push({ url, target, features });
        return options.popupResult === undefined ? {} : options.popupResult;
      },
      assign: (url) => assignments.push(url),
    },
    signals: {
      verified: (detail) => verified.push(detail),
      failed: (detail) => failed.push(detail),
    },
    scheduler: {
      wait: async (milliseconds) => {
        waits.push(milliseconds);
      },
    },
    correlationId: () => "browser:m148-correlation-0001",
    ...(options.maxPollAttempts
      ? { maxPollAttempts: options.maxPollAttempts }
      : {}),
  });

  return {
    client,
    requests,
    waits,
    opens,
    assignments,
    verified,
    failed,
  };
}

describe("M148 payments browser checkout client", () => {
  it("preserves the frozen 2.5 second / 240 attempt polling defaults", () => {
    expect(PAYMENTS_BROWSER_POLL_INTERVAL_MS).toBe(2_500);
    expect(PAYMENTS_BROWSER_MAX_POLL_ATTEMPTS).toBe(240);
  });

  it("creates with server-recognized authority, opens safely and accepts only verified status", async () => {
    const verifiedPayment = {
      verified: true,
      sessionId: handoff.sessionId,
      reference: "provider-payment-m148",
      definitiveBusinessId: null,
      activationStatus: "READY_TO_CONVERT",
      resultId: "fev_m148",
    };
    const result = harness([
      checkoutResponse(),
      statusResponse("PENDING"),
      statusResponse("CONFIRMED", verifiedPayment),
    ]);

    const session = await result.client.start(handoff);
    const confirmation = await session.confirmation;

    expect(session).toMatchObject({
      checkoutId: "ord_m148checkout001",
      paymentId: "pay_m148payment001",
      status: "PENDING",
      checkoutUrl: "https://sandbox-payments.example.test/checkout/001",
      replayed: false,
    });
    expect("statusToken" in session).toBe(false);
    expect(confirmation).toEqual({
      verified: true,
      sessionId: handoff.sessionId,
      reference: "provider-payment-m148",
      definitiveBusinessId: null,
      activationStatus: "READY_TO_CONVERT",
    });
    expect(result.verified).toEqual([confirmation]);
    expect(result.failed).toEqual([]);
    expect(result.waits).toEqual([2_500, 2_500]);
    expect(result.opens).toEqual([
      {
        url: "https://sandbox-payments.example.test/checkout/001",
        target: "morro-digital-checkout",
        features: "noopener,noreferrer",
      },
    ]);
    expect(result.assignments).toEqual([]);

    const create = result.requests[0]!;
    expect(create.url).toBe("/api/payments/v1/checkouts");
    expect(create.init.method).toBe("POST");
    expect(create.init.credentials).toBe("same-origin");
    expect(create.init.cache).toBe("no-store");
    const createHeaders = new Headers(create.init.headers);
    expect(createHeaders.get("Idempotency-Key")).toBe(
      "business:business_session_m148:growth",
    );
    expect(createHeaders.get("X-Checkout-Handoff-Token")).toBe(
      "signed-handoff-token-m148",
    );
    expect(createHeaders.get("X-Correlation-ID")).toBe(
      "browser:m148-correlation-0001",
    );

    const status = result.requests[1]!;
    expect(status.url).toBe(
      "/api/payments/v1/checkouts/ord_m148checkout001",
    );
    expect(status.init.method).toBe("GET");
    expect(status.init.cache).toBe("no-store");
    expect(status.init.credentials).toBe("same-origin");
    expect(new Headers(status.init.headers).get("X-Checkout-Token")).toBe(
      `cst_v1_${"a".repeat(43)}`,
    );
  });

  it("uses location fallback only when the popup is blocked", async () => {
    const result = harness(
      [checkoutResponse(), statusResponse("FAILED")],
      { popupResult: null },
    );
    const session = await result.client.start(handoff);
    await expect(session.confirmation).rejects.toMatchObject({
      code: "PAYMENTS_BROWSER_PAYMENT_NOT_COMPLETED",
    });
    expect(result.assignments).toEqual([
      "https://sandbox-payments.example.test/checkout/001",
    ]);
    expect(result.failed).toEqual([
      expect.objectContaining({
        sessionId: handoff.sessionId,
        code: "PAYMENTS_BROWSER_PAYMENT_NOT_COMPLETED",
      }),
    ]);
  });

  it("does not synthesize confirmation when Payment is confirmed before verified result exists", async () => {
    const verifiedPayment = {
      verified: true,
      sessionId: handoff.sessionId,
      reference: "provider-payment-after-result",
      definitiveBusinessId: "business_12345678",
      activationStatus: "READY_TO_CONVERT",
    };
    const result = harness([
      checkoutResponse(),
      statusResponse("CONFIRMED", null),
      statusResponse("CONFIRMED", verifiedPayment),
    ]);
    const session = await result.client.start(handoff);
    await expect(session.confirmation).resolves.toMatchObject({
      reference: "provider-payment-after-result",
    });
    expect(result.waits).toHaveLength(2);
    expect(result.verified).toHaveLength(1);
  });

  it("fails closed when the status response belongs to another checkout or Business session", async () => {
    const result = harness([
      checkoutResponse(),
      statusResponse("PENDING", null, { sessionId: "substituted_session" }),
    ]);
    const session = await result.client.start(handoff);
    await expect(session.confirmation).rejects.toMatchObject({
      code: "PAYMENTS_BROWSER_STATUS_IDENTITY_MISMATCH",
    });
    expect(result.verified).toEqual([]);
    expect(result.failed).toEqual([
      expect.objectContaining({
        code: "PAYMENTS_BROWSER_STATUS_IDENTITY_MISMATCH",
      }),
    ]);
  });

  it("times out deterministically without retaining the status capability", async () => {
    const result = harness(
      [checkoutResponse(), statusResponse("PENDING"), statusResponse("PENDING")],
      { maxPollAttempts: 2 },
    );
    const session = await result.client.start(handoff);
    await expect(session.confirmation).rejects.toMatchObject({
      code: "PAYMENTS_BROWSER_CONFIRMATION_TIMEOUT",
    });
    expect(result.waits).toEqual([2_500, 2_500]);
    expect("statusToken" in session).toBe(false);
  });

  it("requires exactly one trusted creation authority before any request", async () => {
    const missing = harness([checkoutResponse()], { authority: {} });
    await expect(missing.client.start(handoff)).rejects.toMatchObject({
      code: "PAYMENTS_BROWSER_AUTHORITY_REQUIRED",
    });
    expect(missing.requests).toEqual([]);

    const ambiguous = harness([checkoutResponse()], {
      authority: {
        "X-Checkout-Handoff-Token": "signed-token",
        "X-CSRF-Token": "csrf-token",
        "X-Business-ID": "business_12345678",
      },
    });
    await expect(ambiguous.client.start(handoff)).rejects.toMatchObject({
      code: "PAYMENTS_BROWSER_AUTHORITY_AMBIGUOUS",
    });
    expect(ambiguous.requests).toEqual([]);
  });

  it("supports authenticated authority without exposing authority control over reserved headers", async () => {
    const result = harness(
      [checkoutResponse(), statusResponse("FAILED")],
      {
        authority: {
          "X-CSRF-Token": "csrf-token-m148",
          "X-Business-ID": "business_12345678",
        },
      },
    );
    const session = await result.client.start(handoff);
    await expect(session.confirmation).rejects.toBeInstanceOf(
      PaymentsBrowserCheckoutError,
    );
    const headers = new Headers(result.requests[0]!.init.headers);
    expect(headers.get("X-CSRF-Token")).toBe("csrf-token-m148");
    expect(headers.get("X-Business-ID")).toBe("business_12345678");
    expect(headers.get("Idempotency-Key")).toBe(
      "business:business_session_m148:growth",
    );
  });
});
