import { describe, expect, it } from "vitest";

import {
  bindMercadoPagoWebhookQueryContext,
  startPaymentsCoreWithRetry,
} from "./payments-runtime-api.mjs";

const webhookUrl = (query = "") =>
  new URL(`http://localhost/api/payments/v1/webhooks/sandbox${query}`);

describe("Payments runtime Mercado Pago webhook query context", () => {
  it("binds the single official data.id query value and overrides a forged marker", () => {
    const request = {
      headers: {
        "x-signature": "ts=1787608000,v1=" + "a".repeat(64),
        "x-request-id": "request-runtime-query-0001",
        "x-morro-provider-data-id": "forged-provider-id",
      },
    };

    bindMercadoPagoWebhookQueryContext(
      request,
      webhookUrl("?data.id=123456789&type=payment"),
    );

    expect(request.headers).toMatchObject({
      "x-signature": "ts=1787608000,v1=" + "a".repeat(64),
      "x-request-id": "request-runtime-query-0001",
      "x-morro-provider-data-id": "123456789",
    });
  });

  it("fails closed when data.id is missing, duplicated or oversized", () => {
    for (const url of [
      webhookUrl("?type=payment"),
      webhookUrl("?data.id=123&data.id=456&type=payment"),
      webhookUrl(`?data.id=${"a".repeat(181)}&type=payment`),
    ]) {
      const request = {
        headers: { "x-morro-provider-data-id": "forged-provider-id" },
      };
      bindMercadoPagoWebhookQueryContext(request, url);
      expect(request.headers["x-morro-provider-data-id"]).toBe("");
    }
  });

  it("does not alter non-webhook requests", () => {
    const headers = { "x-morro-provider-data-id": "unrelated" };
    const request = { headers };

    bindMercadoPagoWebhookQueryContext(
      request,
      new URL("http://localhost/api/payments/v1/checkouts/checkout-123"),
    );

    expect(request.headers).toBe(headers);
  });
});

describe("Payments runtime bounded core startup retry", () => {
  it("recovers after one transient core bootstrap failure", async () => {
    let attempts = 0;
    const delays = [];
    const ready = await startPaymentsCoreWithRetry(
      async () => {
        attempts += 1;
        return attempts === 2;
      },
      {
        attempts: 3,
        baseDelayMs: 25,
        sleep: async (delayMs) => {
          delays.push(delayMs);
        },
      },
    );

    expect(ready).toBe(true);
    expect(attempts).toBe(2);
    expect(delays).toEqual([25]);
  });

  it("stays fail-closed after the bounded attempt budget is exhausted", async () => {
    let attempts = 0;
    const delays = [];
    const ready = await startPaymentsCoreWithRetry(
      async () => {
        attempts += 1;
        return false;
      },
      {
        attempts: 3,
        baseDelayMs: 25,
        sleep: async (delayMs) => {
          delays.push(delayMs);
        },
      },
    );

    expect(ready).toBe(false);
    expect(attempts).toBe(3);
    expect(delays).toEqual([25, 50]);
  });
});
