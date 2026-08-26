import { describe, expect, it, vi } from "vitest";

import { createPaymentsBrowserSubscriptionClient } from "./payments-browser-subscription-client.js";

const projection = Object.freeze({
  subscriptionId: "sub_browser_subscription_0001",
  providerSubscriptionReference: "preapproval_browser_0001",
  providerStatus: "authorized",
  subscriptionStatus: "active",
  plan: Object.freeze({
    id: "growth",
    name: "Plano Growth",
    amount: Object.freeze({ minorUnits: 12_900, currency: "BRL" }),
    pricingVersion: "pricing_v1",
  }),
  frequency: 1,
  frequencyType: "months",
  replayed: false,
});

const materializedProjection = Object.freeze({
  subscriptionId: "sub_browser_subscription_0001",
  subscriptionStatus: "active",
  orderId: "ord_browser_subscription_0001",
  plan: Object.freeze({
    id: "growth",
    name: "Plano Growth",
    amount: Object.freeze({ minorUnits: 12_900, currency: "BRL" }),
    pricingVersion: "pricing_v1",
  }),
  period: Object.freeze({
    number: 1,
    startAt: "2026-08-24T23:00:00.000Z",
    endAt: "2026-09-24T23:00:00.000Z",
  }),
  replayed: false,
});

function okResponse(data: unknown = projection): Response {
  return new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function requireStringBody(init: RequestInit | undefined): string {
  if (typeof init?.body !== "string") throw new Error("TEST_BODY_NOT_STRING");
  return init.body;
}

describe("createPaymentsBrowserSubscriptionClient", () => {
  it("materializes only by canonical order identity and business context", async () => {
    const secureFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(okResponse(materializedProjection));
    const client = createPaymentsBrowserSubscriptionClient(
      { secureFetch },
      "business_browser_0001",
    );

    const result = await client.materialize("ord_browser_subscription_0001");

    expect(result.subscriptionId).toBe("sub_browser_subscription_0001");
    const [url, init] = secureFetch.mock.calls[0] ?? [];
    expect(url).toBe("/api/payments/v1/subscriptions");
    expect(init).toMatchObject({
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Business-ID": "business_browser_0001",
      },
    });
    const requestBody = requireStringBody(init);
    expect(JSON.parse(requestBody)).toEqual({
      orderId: "ord_browser_subscription_0001",
    });
    expect(requestBody).not.toContain("amount");
    expect(requestBody).not.toContain("currency");
    expect(requestBody).not.toContain("frequency");
    expect(requestBody).not.toContain("payerEmail");
    expect(requestBody).not.toContain("periodStartAt");
    expect(requestBody).not.toContain("periodEndAt");
  });

  it("sends only provider card token on creation and keeps business context in a header", async () => {
    const secureFetch = vi.fn<typeof fetch>().mockResolvedValue(okResponse());
    const client = createPaymentsBrowserSubscriptionClient(
      { secureFetch },
      "business_browser_0001",
    );

    const result = await client.create(
      "sub_browser_subscription_0001",
      "card_token_browser_0001",
    );

    expect(result.plan.amount).toEqual({ minorUnits: 12_900, currency: "BRL" });
    expect(secureFetch).toHaveBeenCalledTimes(1);
    const [url, init] = secureFetch.mock.calls[0] ?? [];
    expect(url).toBe(
      "/api/payments/v1/subscriptions/sub_browser_subscription_0001/provider",
    );
    expect(init).toMatchObject({
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Business-ID": "business_browser_0001",
      },
    });
    const requestBody = requireStringBody(init);
    expect(JSON.parse(requestBody)).toEqual({
      cardToken: "card_token_browser_0001",
    });
    expect(requestBody).not.toContain("amount");
    expect(requestBody).not.toContain("currency");
    expect(requestBody).not.toContain("frequency");
    expect(requestBody).not.toContain("payerEmail");
  });

  it("uses GET for authoritative read and POST with empty bodies for lifecycle mutations", async () => {
    const secureFetch = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => okResponse());
    const client = createPaymentsBrowserSubscriptionClient(
      { secureFetch },
      "business_browser_0001",
    );

    await client.read("sub_browser_subscription_0001");
    await client.pause("sub_browser_subscription_0001");
    await client.resume("sub_browser_subscription_0001");
    await client.cancel("sub_browser_subscription_0001");

    expect(
      secureFetch.mock.calls.map(([url, init]) => [url, init?.method]),
    ).toEqual([
      [
        "/api/payments/v1/subscriptions/sub_browser_subscription_0001/provider",
        "GET",
      ],
      [
        "/api/payments/v1/subscriptions/sub_browser_subscription_0001/provider/pause",
        "POST",
      ],
      [
        "/api/payments/v1/subscriptions/sub_browser_subscription_0001/provider/resume",
        "POST",
      ],
      [
        "/api/payments/v1/subscriptions/sub_browser_subscription_0001/provider/cancel",
        "POST",
      ],
    ]);
    for (const [, init] of secureFetch.mock.calls.slice(1)) {
      expect(init?.body).toBe("{}");
    }
  });

  it("rejects invalid identities and card tokens before network access", async () => {
    const secureFetch = vi.fn<typeof fetch>().mockResolvedValue(okResponse());
    const client = createPaymentsBrowserSubscriptionClient(
      { secureFetch },
      "business_browser_0001",
    );

    await expect(client.materialize("invalid")).rejects.toThrow(
      "INVALID_ORDER_ID",
    );
    await expect(
      client.create("invalid", "card_token_browser_0001"),
    ).rejects.toThrow("INVALID_SUBSCRIPTION_ID");
    await expect(
      client.create("sub_browser_subscription_0001", "<pan>"),
    ).rejects.toThrow("INVALID_CARD_TOKEN");
    expect(secureFetch).not.toHaveBeenCalled();
  });
});
