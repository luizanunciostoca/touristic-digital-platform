import { describe, expect, it, vi } from "vitest";

import {
  normalizeCardPaymentBrickSubmission,
  submitCardPaymentBrickForm,
} from "./mercado-pago-card-payment-brick.js";

describe("Mercado Pago Card Payment Brick adapter", () => {
  it("keeps only tokenized card artifacts and removes browser monetary fields", () => {
    expect(
      normalizeCardPaymentBrickSubmission({
        token: "card_token_browser_0001",
        installments: 3,
        payment_method_id: "visa",
        issuer_id: "123",
        payer: { email: "BUYER@EXAMPLE.COM" },
        transaction_amount: 0.01,
        currency_id: "USD",
        amount: 1,
        currency: "USD",
      }),
    ).toEqual({
      token: "card_token_browser_0001",
      installments: 3,
      payment_method_id: "visa",
      issuer_id: "123",
      payer: { email: "buyer@example.com" },
    });
  });

  it("submits only the sanitized Brick payload with the checkout capability", async () => {
    const fetchFn = vi.fn<typeof fetch>(async (_input, init) => {
      expect(init?.credentials).toBe("same-origin");
      expect(init?.cache).toBe("no-store");
      expect(new Headers(init?.headers).get("x-checkout-token")).toBe(
        "cst_v1_abcdefghijklmnop",
      );
      expect(JSON.parse(String(init?.body))).toEqual({
        token: "card_token_browser_0001",
        installments: 1,
        payment_method_id: "master",
        payer: { email: "buyer@example.com" },
      });
      return new Response(
        JSON.stringify({
          data: {
            checkoutId: "ord_card_brick_0001",
            paymentId: "pay_card_brick_0001",
            status: "PENDING",
            submitted: true,
            replayed: false,
          },
        }),
        {
          status: 202,
          headers: { "Content-Type": "application/json" },
        },
      );
    });

    await submitCardPaymentBrickForm(fetchFn, {
      checkoutId: "ord_card_brick_0001",
      statusToken: "cst_v1_abcdefghijklmnop",
      correlationId: "brick:00000000-0000-4000-8000-000000000001",
      formData: {
        token: "card_token_browser_0001",
        installments: 1,
        payment_method_id: "master",
        payer: { email: "buyer@example.com" },
        transaction_amount: 999999,
        currency_id: "USD",
      },
    });

    expect(fetchFn).toHaveBeenCalledWith(
      "/api/payments/v1/checkouts/ord_card_brick_0001/card",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("rejects malformed provider form data before any HTTP call", async () => {
    const fetchFn = vi.fn<typeof fetch>();

    await expect(
      submitCardPaymentBrickForm(fetchFn, {
        checkoutId: "ord_card_brick_0001",
        statusToken: "cst_v1_abcdefghijklmnop",
        correlationId: "brick:00000000-0000-4000-8000-000000000002",
        formData: {
          token: "",
          installments: 0,
          payment_method_id: "visa",
          payer: { email: "invalid" },
        },
      }),
    ).rejects.toThrow("PAYMENTS_BRICK_INVALID_SUBMISSION");
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
