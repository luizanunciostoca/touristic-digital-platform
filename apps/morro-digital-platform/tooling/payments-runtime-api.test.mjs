import { describe, expect, it } from "vitest";

import {
  bindMercadoPagoWebhookQueryContext,
  createPaymentsApi,
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

describe("Payments runtime Control Center owner facade", () => {
  it("passes exact admin read contracts through to the core runtime", async () => {
    const api = createPaymentsApi({
      adminRead: {
        orders: {
          findById(id) {
            return Promise.resolve(
              id === "ord_runtime_admin_0001"
                ? { id, status: "pending_payment" }
                : null,
            );
          },
        },
        payments: {
          findById(id) {
            return Promise.resolve(
              id === "pay_runtime_admin_0001"
                ? {
                    id,
                    status: "confirmed",
                    subject: {
                      kind: "order",
                      reference: "ord_runtime_admin_0001",
                    },
                  }
                : null,
            );
          },
        },
        checkoutAccess: {
          findByOrderId(orderId) {
            return Promise.resolve(
              orderId === "ord_runtime_admin_0001"
                ? {
                    orderId,
                    paymentId: "pay_runtime_admin_0001",
                    tenantId: "business-runtime-admin",
                  }
                : null,
            );
          },
        },
        ledger: {
          findByExternalKey(key) {
            return Promise.resolve(
              key === "payment_approved_pay_runtime_admin_0001"
                ? { id: "ltx_runtime_admin_0001", externalKey: key }
                : null,
            );
          },
        },
      },
    });

    await expect(
      api.adminFindOrder("ord_runtime_admin_0001"),
    ).resolves.toMatchObject({
      status: "found",
      data: { id: "ord_runtime_admin_0001" },
    });
    await expect(
      api.adminFindPayment("pay_runtime_admin_0001"),
    ).resolves.toMatchObject({
      status: "found",
      data: { id: "pay_runtime_admin_0001" },
    });
    await expect(
      api.adminResolvePaymentTenant("pay_runtime_admin_0001"),
    ).resolves.toEqual({
      status: "found",
      tenantId: "business-runtime-admin",
    });
    await expect(
      api.adminFindLedger("payment_approved_pay_runtime_admin_0001"),
    ).resolves.toMatchObject({
      status: "found",
      data: { id: "ltx_runtime_admin_0001" },
    });
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

  it("uses the default bounded retry budget to tolerate a longer transient bootstrap outage", async () => {
    let attempts = 0;
    const delays = [];
    const ready = await startPaymentsCoreWithRetry(
      async () => {
        attempts += 1;
        return attempts === 5;
      },
      {
        sleep: async (delayMs) => {
          delays.push(delayMs);
        },
      },
    );

    expect(ready).toBe(true);
    expect(attempts).toBe(5);
    expect(delays).toEqual([1_000, 2_000, 3_000, 4_000]);
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
