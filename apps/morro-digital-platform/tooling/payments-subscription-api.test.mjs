import { Readable } from "node:stream";

import { describe, expect, it, vi } from "vitest";

import { createPaymentsSubscriptionApi } from "./payments-subscription-api.mjs";

function request({ method = "GET", body, headers = {} } = {}) {
  const stream = Readable.from(
    body === undefined ? [] : [JSON.stringify(body)],
  );
  stream.method = method;
  stream.headers = headers;
  stream.socket = { remoteAddress: "127.0.0.1" };
  stream.morroCorrelationId = "corr_subscription_api_0001";
  return stream;
}

function response() {
  const headers = new Map();
  let body = "";
  return {
    statusCode: 0,
    setHeader(name, value) {
      headers.set(String(name).toLowerCase(), String(value));
    },
    end(value = "") {
      body = String(value);
    },
    snapshot() {
      return {
        status: this.statusCode,
        headers: Object.fromEntries(headers),
        body: body ? JSON.parse(body) : null,
      };
    },
  };
}

const pathname = "/api/payments/v1/subscriptions/sub_runtime_api_0001/provider";

describe("createPaymentsSubscriptionApi", () => {
  it("routes a bounded JSON mutation into the canonical subscription transport", async () => {
    const handle = vi.fn(async (input) => ({
      status: 201,
      headers: { "Cache-Control": "no-store" },
      body: { data: { subscriptionId: "sub_runtime_api_0001" } },
    }));
    const api = createPaymentsSubscriptionApi({ transport: { handle } });
    const outgoing = response();

    expect(api.matches(pathname)).toBe(true);
    expect(await api.start()).toBe(true);
    await api.handle(
      request({
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-business-id": "business_runtime_api_0001",
        },
        body: { cardToken: "card_token_runtime_0001" },
      }),
      outgoing,
      new URL(`https://morro.digital${pathname}`),
    );

    expect(handle).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        pathname,
        body: { cardToken: "card_token_runtime_0001" },
        correlationId: "corr_subscription_api_0001",
      }),
    );
    expect(outgoing.snapshot()).toMatchObject({
      status: 201,
      body: { data: { subscriptionId: "sub_runtime_api_0001" } },
    });
    await api.stop();
  });

  it("rejects non-json mutations before invoking the transport", async () => {
    const handle = vi.fn();
    const api = createPaymentsSubscriptionApi({ transport: { handle } });
    const outgoing = response();

    await api.handle(
      request({
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: { cardToken: "card_token_runtime_0001" },
      }),
      outgoing,
      new URL(`https://morro.digital${pathname}`),
    );

    expect(handle).not.toHaveBeenCalled();
    expect(outgoing.snapshot()).toMatchObject({
      status: 415,
      body: { error: "UNSUPPORTED_MEDIA_TYPE" },
    });
  });

  it("stays disabled without explicit subscription activation", async () => {
    const api = createPaymentsSubscriptionApi({
      getEnvironmentValue(key) {
        if (key === "PAYMENTS_PROVIDER_MODE") return "mercado_pago";
        if (key === "PAYMENTS_SUBSCRIPTIONS_ENABLED") return "false";
        return "";
      },
    });
    const outgoing = response();

    expect(await api.start()).toBe(true);
    await api.handle(
      request(),
      outgoing,
      new URL(`https://morro.digital${pathname}`),
    );
    expect(outgoing.snapshot()).toMatchObject({
      status: 503,
      body: { error: "SUBSCRIPTION_PROVIDER_UNAVAILABLE" },
    });
    await api.stop();
  });
});
