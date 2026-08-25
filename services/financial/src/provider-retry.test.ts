import { describe, expect, it, vi } from "vitest";

import {
  ProviderRequestUnavailableError,
  createProviderRetryPolicyFromEnvironment,
  executeBoundedProviderRequest,
} from "./provider-retry.js";

function policy() {
  return createProviderRetryPolicyFromEnvironment({
    PAYMENTS_PROVIDER_MAX_ATTEMPTS: "2",
    PAYMENTS_PROVIDER_RETRY_BASE_MS: "100",
  });
}

function runtime() {
  return {
    sleep: vi.fn(() => Promise.resolve()),
    random: () => 0,
  };
}

describe("M152 bounded financial provider retry", () => {
  it("retries an idempotent POST after a network failure with the exact same command", async () => {
    const captured: Array<{
      key: string | null;
      body: BodyInit | null | undefined;
    }> = [];
    let attempt = 0;
    const fetchMock: typeof fetch = async (_input, init) => {
      captured.push({
        key: new Headers(init?.headers).get("Idempotency-Key"),
        body: init?.body,
      });
      attempt += 1;
      if (attempt === 1) throw new Error("secret network detail");
      return new Response("{}", { status: 200 });
    };
    const retryRuntime = runtime();
    const init: RequestInit = {
      method: "POST",
      headers: { "Idempotency-Key": "payment:v1:ord_retry_12345678" },
      body: JSON.stringify({ externalReference: "pay_retry_12345678" }),
    };

    await expect(
      executeBoundedProviderRequest({
        fetch: fetchMock,
        url: new URL("https://provider.example/v1/checkouts"),
        init,
        timeoutMs: 1_000,
        policy: policy(),
        runtime: retryRuntime,
      }),
    ).resolves.toMatchObject({ status: 200 });
    expect(captured).toEqual([
      {
        key: "payment:v1:ord_retry_12345678",
        body: init.body,
      },
      {
        key: "payment:v1:ord_retry_12345678",
        body: init.body,
      },
    ]);
    expect(retryRuntime.sleep).toHaveBeenCalledTimes(1);
  });

  it("retries GET after 429 but never retries a semantic 4xx", async () => {
    let getCalls = 0;
    const getFetch: typeof fetch = async () => {
      getCalls += 1;
      return getCalls === 1
        ? new Response(null, { status: 429 })
        : new Response("{}", { status: 200 });
    };
    await expect(
      executeBoundedProviderRequest({
        fetch: getFetch,
        url: new URL("https://provider.example/v1/payments/ref"),
        init: { method: "GET" },
        timeoutMs: 1_000,
        policy: policy(),
        runtime: runtime(),
      }),
    ).resolves.toMatchObject({ status: 200 });
    expect(getCalls).toBe(2);

    let postCalls = 0;
    const rejectedFetch: typeof fetch = async () => {
      postCalls += 1;
      return new Response(null, { status: 422 });
    };
    await expect(
      executeBoundedProviderRequest({
        fetch: rejectedFetch,
        url: new URL("https://provider.example/v1/refunds"),
        init: {
          method: "POST",
          headers: { "Idempotency-Key": "refund:v1:pay_retry_12345678" },
        },
        timeoutMs: 1_000,
        policy: policy(),
        runtime: runtime(),
      }),
    ).resolves.toMatchObject({ status: 422 });
    expect(postCalls).toBe(1);
  });

  it("does not retry a mutating request without explicit idempotency authority", async () => {
    let calls = 0;
    const fetchMock: typeof fetch = async () => {
      calls += 1;
      return new Response(null, { status: 503 });
    };

    await expect(
      executeBoundedProviderRequest({
        fetch: fetchMock,
        url: new URL("https://provider.example/v1/unsafe"),
        init: { method: "POST" },
        timeoutMs: 1_000,
        policy: policy(),
        runtime: runtime(),
      }),
    ).rejects.toMatchObject({
      message: "PROVIDER_REQUEST_UNAVAILABLE",
      httpStatus: 503,
    });
    expect(calls).toBe(1);
  });

  it("stops at the bounded attempt limit and never leaks the transport error", async () => {
    let calls = 0;
    const fetchMock: typeof fetch = async () => {
      calls += 1;
      throw new Error("credential-looking provider transport secret");
    };

    await expect(
      executeBoundedProviderRequest({
        fetch: fetchMock,
        url: new URL("https://provider.example/v1/checkouts"),
        init: {
          method: "POST",
          headers: { "Idempotency-Key": "payment:v1:ord_retry_12345678" },
        },
        timeoutMs: 1_000,
        policy: policy(),
        runtime: runtime(),
      }),
    ).rejects.toEqual(new ProviderRequestUnavailableError());
    expect(calls).toBe(2);
  });

  it("fails closed on retry configuration outside strict bounds", () => {
    expect(() =>
      createProviderRetryPolicyFromEnvironment({
        PAYMENTS_PROVIDER_MAX_ATTEMPTS: "3",
      }),
    ).toThrow("PAYMENTS_PROVIDER_MAX_ATTEMPTS is invalid");
    expect(() =>
      createProviderRetryPolicyFromEnvironment({
        PAYMENTS_PROVIDER_RETRY_BASE_MS: "1001",
      }),
    ).toThrow("PAYMENTS_PROVIDER_RETRY_BASE_MS is invalid");
  });
});
