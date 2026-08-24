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

function okResponse(data = projection): Response {
  return new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("createPaymentsBrowserSubscriptionClient", () => {
  it("sends only provider card token on creation and keeps business context in a header", async () => {
    const secureFetch = vi.fn(async () => okResponse());
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
    expect(JSON.parse(String(init?.body))).toEqual({
      cardToken: "card_token_browser_0001",
    });
    expect(String(init?.body)).not.toContain("amount");
    expect(String(init?.body)).not.toContain("currency");
    expect(String(init?.body)).not.toContain("frequency");
    expect(String(init?.body)).not.toContain("payerEmail");
  });

  it("uses GET for authoritative read and POST with empty bodies for lifecycle mutations", async () => {
    const secureFetch = vi.fn(async () => okResponse());
    const client = createPaymentsBrowserSubscriptionClient(
      { secureFetch },
      "business_browser_0001",
    );

    await client.read("sub_browser_subscription_0001");
    await client.pause("sub_browser_subscription_0001");
    await client.resume("sub_browser_subscription_0001");
    await client.cancel("sub_browser_subscription_0001");

    expect(secureFetch.mock.calls.map(([url, init]) => [url, init?.method])).toEqual([
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
    const secureFetch = vi.fn(async () => okResponse());
    const client = createPaymentsBrowserSubscriptionClient(
      { secureFetch },
      "business_browser_0001",
    );

    await expect(client.create("invalid", "card_token_browser_0001")).rejects.toThrow(
      "INVALID_SUBSCRIPTION_ID",
    );
    await expect(
      client.create("sub_browser_subscription_0001", "<pan>"),
    ).rejects.toThrow("INVALID_CARD_TOKEN");
    expect(secureFetch).not.toHaveBeenCalled();
  });
});
