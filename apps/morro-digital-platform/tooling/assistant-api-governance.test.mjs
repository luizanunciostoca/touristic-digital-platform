import { describe, expect, it, vi } from "vitest";

import { createAssistantApi } from "./assistant-api.mjs";

function request(body = { input: "Olá" }) {
  return {
    method: "POST",
    socket: { remoteAddress: "127.0.0.1" },
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(JSON.stringify(body));
    },
  };
}

function response() {
  const headers = new Map();
  return {
    statusCode: 0,
    body: "",
    setHeader(name, value) {
      headers.set(String(name).toLowerCase(), String(value));
    },
    end(value = "") {
      this.body = String(value);
    },
    headers,
  };
}

function environment(overrides = {}) {
  const values = {
    OPENAI_API_KEY: "test-key",
    OPENAI_MODEL: "test-model",
    OPENAI_PROVIDER_HARD_LIMIT_CONFIRMED: "true",
    OPENAI_INPUT_USD_PER_1M_TOKENS: "1",
    OPENAI_OUTPUT_USD_PER_1M_TOKENS: "2",
    OPENAI_DAILY_COST_LIMIT_USD: "10",
    OPENAI_MONTHLY_COST_LIMIT_USD: "100",
    OPENAI_REQUEST_RESERVE_USD: "1",
    OPENAI_MAX_CONCURRENCY: "2",
    ...overrides,
  };
  return (key) => values[key] || "";
}

function providerResponse(usage = {}) {
  return {
    ok: true,
    status: 200,
    async json() {
      return {
        choices: [
          {
            message: {
              content: JSON.stringify({
                text: "Resposta segura",
                intent: "test",
                action: null,
                options: [],
                confidence: 1,
              }),
            },
          },
        ],
        usage,
      };
    },
  };
}

describe("assistant paid-provider governance", () => {
  it("does not allow an API key to enable billing by itself", async () => {
    const fetchImplementation = vi.fn();
    const api = createAssistantApi({
      getEnvironmentValue: environment({
        OPENAI_PROVIDER_HARD_LIMIT_CONFIRMED: "false",
      }),
      fetchImplementation,
      observeProviderEvent: () => {},
    });
    const output = response();

    await api.handle(request(), output);

    expect(output.statusCode).toBe(503);
    expect(JSON.parse(output.body).error).toBe(
      "assistant_billing_guard_not_configured",
    );
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it("records provider usage after a guarded successful request", async () => {
    const fetchImplementation = vi.fn(async () =>
      providerResponse({
        prompt_tokens: 1000,
        completion_tokens: 500,
        total_tokens: 1500,
      }),
    );
    const api = createAssistantApi({
      getEnvironmentValue: environment(),
      fetchImplementation,
      observeProviderEvent: () => {},
    });
    const output = response();

    await api.handle(request(), output);

    expect(output.statusCode).toBe(200);
    const snapshot = api.observabilitySnapshot();
    expect(snapshot.hardLimitConfirmed).toBe(true);
    expect(snapshot.pricingConfigured).toBe(true);
    expect(snapshot.usage.daily.totalTokens).toBe(1500);
    expect(snapshot.usage.daily.spentUsd).toBeCloseTo(0.002);
  });

  it("charges the conservative reservation when provider usage is absent", async () => {
    const fetchImplementation = vi.fn(async () => providerResponse());
    const api = createAssistantApi({
      getEnvironmentValue: environment({
        OPENAI_REQUEST_RESERVE_USD: "0.75",
      }),
      fetchImplementation,
      observeProviderEvent: () => {},
    });
    const output = response();

    await api.handle(request(), output);

    expect(output.statusCode).toBe(200);
    expect(api.observabilitySnapshot().usage.daily.spentUsd).toBe(0.75);
  });

  it("blocks a new call when the reservation would cross the daily ceiling", async () => {
    const fetchImplementation = vi.fn(async () =>
      providerResponse({
        prompt_tokens: 1,
        completion_tokens: 0,
        total_tokens: 1,
      }),
    );
    const api = createAssistantApi({
      getEnvironmentValue: environment({
        OPENAI_INPUT_USD_PER_1M_TOKENS: "500000",
        OPENAI_OUTPUT_USD_PER_1M_TOKENS: "500000",
        OPENAI_DAILY_COST_LIMIT_USD: "1",
        OPENAI_REQUEST_RESERVE_USD: "0.6",
      }),
      fetchImplementation,
      observeProviderEvent: () => {},
    });

    const first = response();
    await api.handle(request(), first);
    expect(first.statusCode).toBe(200);

    const second = response();
    await api.handle(request(), second);
    expect(second.statusCode).toBe(429);
    expect(JSON.parse(second.body).error).toBe("assistant_budget_exhausted");
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });
});
