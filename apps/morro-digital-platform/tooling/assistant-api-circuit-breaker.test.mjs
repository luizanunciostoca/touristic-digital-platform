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

function environment() {
  const values = {
    OPENAI_API_KEY: "test-key",
    OPENAI_MODEL: "test-model",
    OPENAI_PRICING_MODEL: "test-model",
    OPENAI_PROVIDER_HARD_LIMIT_CONFIRMED: "true",
    OPENAI_INPUT_USD_PER_1M_TOKENS: "1",
    OPENAI_OUTPUT_USD_PER_1M_TOKENS: "2",
    OPENAI_DAILY_COST_LIMIT_USD: "10",
    OPENAI_MONTHLY_COST_LIMIT_USD: "100",
    OPENAI_REQUEST_RESERVE_USD: "1",
    OPENAI_MAX_CONCURRENCY: "2",
    OPENAI_RUNTIME_REPLICA_COUNT: "1",
  };
  return (key) => values[key] || "";
}

function memoryStateStore() {
  let state = null;
  return {
    load() {
      return state ? structuredClone(state) : null;
    },
    save(nextState) {
      state = structuredClone(nextState);
    },
  };
}

function providerSuccess() {
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
        usage: {
          prompt_tokens: 10,
          completion_tokens: 10,
          total_tokens: 20,
        },
      };
    },
  };
}

describe("Assistant provider circuit breaker integration", () => {
  it("stops provider calls after repeated failures and recovers through a half-open probe", async () => {
    let timestamp = 1_000;
    let failuresRemaining = 3;
    const events = [];
    const fetchImplementation = vi.fn(async () => {
      if (failuresRemaining > 0) {
        failuresRemaining -= 1;
        return { ok: false, status: 502 };
      }
      return providerSuccess();
    });
    const api = createAssistantApi({
      getEnvironmentValue: environment(),
      fetchImplementation,
      governanceStateStore: memoryStateStore(),
      now: () => timestamp,
      observeProviderEvent: (event) => events.push(event),
      createRequestId: () => `req-${fetchImplementation.mock.calls.length + 1}`,
    });

    for (let index = 0; index < 3; index += 1) {
      const output = response();
      await api.handle(request(), output);
      expect(output.statusCode).toBe(502);
    }

    expect(fetchImplementation).toHaveBeenCalledTimes(3);
    expect(api.observabilitySnapshot().circuitBreaker.state).toBe("open");

    const blocked = response();
    await api.handle(request(), blocked);
    expect(blocked.statusCode).toBe(503);
    expect(JSON.parse(blocked.body).error).toBe(
      "assistant_provider_unavailable",
    );
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(fetchImplementation).toHaveBeenCalledTimes(3);

    timestamp += 30_000;
    const recovered = response();
    await api.handle(request(), recovered);
    expect(recovered.statusCode).toBe(200);
    expect(fetchImplementation).toHaveBeenCalledTimes(4);
    expect(api.observabilitySnapshot().circuitBreaker.state).toBe("closed");
    expect(
      events.some((event) => event.type === "provider.circuit.opened"),
    ).toBe(true);
    expect(
      events.some((event) => event.type === "provider.circuit.half_open"),
    ).toBe(true);
    expect(
      events.some((event) => event.type === "provider.circuit.closed"),
    ).toBe(true);
  });

  it("does not count an orphaned non-OK response as a provider failure", async () => {
    const input = request();
    input.aborted = false;
    const output = response();
    const fetchImplementation = vi.fn(async () => {
      input.aborted = true;
      return { ok: false, status: 502 };
    });
    const api = createAssistantApi({
      getEnvironmentValue: environment(),
      fetchImplementation,
      governanceStateStore: memoryStateStore(),
      observeProviderEvent: () => undefined,
      createRequestId: () => "req-disconnect-race",
    });

    await api.handle(input, output);

    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    expect(output.statusCode).toBe(0);
    expect(output.body).toBe("");
    expect(api.observabilitySnapshot().circuitBreaker.state).toBe("closed");
    expect(
      api.observabilitySnapshot().circuitBreaker.consecutiveFailures,
    ).toBe(0);
  });
});
