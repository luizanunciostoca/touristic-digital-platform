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
    OPENAI_PRICING_MODEL: "test-model",
    OPENAI_PROVIDER_HARD_LIMIT_CONFIRMED: "true",
    OPENAI_INPUT_USD_PER_1M_TOKENS: "1",
    OPENAI_OUTPUT_USD_PER_1M_TOKENS: "2",
    OPENAI_DAILY_COST_LIMIT_USD: "10",
    OPENAI_MONTHLY_COST_LIMIT_USD: "100",
    OPENAI_REQUEST_RESERVE_USD: "1",
    OPENAI_MAX_CONCURRENCY: "2",
    OPENAI_RUNTIME_REPLICA_COUNT: "1",
    ...overrides,
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
      governanceStateStore: memoryStateStore(),
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
      governanceStateStore: memoryStateStore(),
      createRequestId: () => "req-success",
      observeProviderEvent: () => {},
    });
    const output = response();

    await api.handle(request(), output);

    expect(output.statusCode).toBe(200);
    expect(output.headers.get("x-request-id")).toBe("req-success");
    expect(
      fetchImplementation.mock.calls[0][1].headers["X-Client-Request-Id"],
    ).toBe("req-success");
    const snapshot = api.observabilitySnapshot();
    expect(snapshot.hardLimitConfirmed).toBe(true);
    expect(snapshot.pricingConfigured).toBe(true);
    expect(snapshot.pricingModelMatches).toBe(true);
    expect(snapshot.requestReserveAdequate).toBe(true);
    expect(snapshot.minimumRequestReserveUsd).toBeGreaterThan(0);
    expect(snapshot.runtimeTopologySafe).toBe(true);
    expect(snapshot.persistentGovernanceConfigured).toBe(true);
    expect(snapshot.usage.daily.totalTokens).toBe(1500);
    expect(snapshot.usage.daily.spentUsd).toBeCloseTo(0.002);
  });

  it("fails closed when pricing is bound to a different model", async () => {
    const events = [];
    const fetchImplementation = vi.fn();
    const api = createAssistantApi({
      getEnvironmentValue: environment({
        OPENAI_PRICING_MODEL: "another-model",
      }),
      fetchImplementation,
      governanceStateStore: memoryStateStore(),
      createRequestId: () => "req-pricing-model",
      observeProviderEvent: (event) => events.push(event),
    });
    const output = response();

    await api.handle(request(), output);

    expect(output.statusCode).toBe(503);
    expect(JSON.parse(output.body).error).toBe(
      "assistant_billing_guard_not_configured",
    );
    expect(fetchImplementation).not.toHaveBeenCalled();
    expect(
      events.some(
        (event) =>
          event.type === "provider.billing_guard.denied" &&
          event.reason === "pricing_model_mismatch" &&
          event.metadata.correlationId === "req-pricing-model",
      ),
    ).toBe(true);
  });

  it("fails closed when the configured per-call reserve is below the runtime floor", async () => {
    const events = [];
    const fetchImplementation = vi.fn();
    const api = createAssistantApi({
      getEnvironmentValue: environment({
        OPENAI_REQUEST_RESERVE_USD: "0.1",
      }),
      fetchImplementation,
      governanceStateStore: memoryStateStore(),
      createRequestId: () => "req-under-reserved",
      observeProviderEvent: (event) => events.push(event),
    });
    const output = response();

    await api.handle(request(), output);

    expect(output.statusCode).toBe(503);
    expect(JSON.parse(output.body).error).toBe(
      "assistant_billing_guard_not_configured",
    );
    expect(fetchImplementation).not.toHaveBeenCalled();
    const snapshot = api.observabilitySnapshot();
    expect(snapshot.requestReserveAdequate).toBe(false);
    expect(snapshot.minimumRequestReserveUsd).toBeGreaterThan(0.1);
    expect(
      events.some(
        (event) =>
          event.type === "provider.billing_guard.denied" &&
          event.reason === "request_reserve_below_runtime_floor" &&
          event.configuredRequestReserveUsd === 0.1 &&
          event.minimumRequestReserveUsd > 0.1,
      ),
    ).toBe(true);
  });

  it("charges the conservative reservation when provider usage is absent", async () => {
    const fetchImplementation = vi.fn(async () => providerResponse());
    const api = createAssistantApi({
      getEnvironmentValue: environment({
        OPENAI_REQUEST_RESERVE_USD: "0.75",
      }),
      fetchImplementation,
      governanceStateStore: memoryStateStore(),
      observeProviderEvent: () => {},
    });
    const output = response();

    await api.handle(request(), output);

    expect(output.statusCode).toBe(200);
    expect(api.observabilitySnapshot().usage.daily.spentUsd).toBe(0.75);
  });

  it("charges the conservative reservation after an uncertain provider error", async () => {
    const events = [];
    const fetchImplementation = vi.fn(async () => ({
      ok: false,
      status: 502,
    }));
    const api = createAssistantApi({
      getEnvironmentValue: environment({
        OPENAI_REQUEST_RESERVE_USD: "0.8",
      }),
      fetchImplementation,
      governanceStateStore: memoryStateStore(),
      createRequestId: () => "req-provider-error",
      observeProviderEvent: (event) => events.push(event),
    });
    const output = response();

    await api.handle(request(), output);

    expect(output.statusCode).toBe(502);
    expect(api.observabilitySnapshot().usage.daily.spentUsd).toBe(0.8);
    expect(output.headers.get("x-request-id")).toBe("req-provider-error");
    expect(
      events.some(
        (event) =>
          event.type === "provider.request.failed" &&
          event.reason === "provider_http_error" &&
          event.statusCode === 502 &&
          event.metadata.correlationId === "req-provider-error",
      ),
    ).toBe(true);
  });

  it("blocks a new call when the reservation would cross the daily ceiling", async () => {
    const fetchImplementation = vi.fn(async () =>
      providerResponse({
        prompt_tokens: 100_000,
        completion_tokens: 0,
        total_tokens: 100_000,
      }),
    );
    const api = createAssistantApi({
      getEnvironmentValue: environment({
        OPENAI_DAILY_COST_LIMIT_USD: "0.2",
        OPENAI_REQUEST_RESERVE_USD: "0.15",
      }),
      fetchImplementation,
      governanceStateStore: memoryStateStore(),
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

  it("fails closed when runtime topology is not explicitly single-replica", async () => {
    const events = [];
    const fetchImplementation = vi.fn();
    const api = createAssistantApi({
      getEnvironmentValue: environment({
        OPENAI_RUNTIME_REPLICA_COUNT: "2",
      }),
      fetchImplementation,
      governanceStateStore: memoryStateStore(),
      createRequestId: () => "req-topology",
      observeProviderEvent: (event) => events.push(event),
    });
    const output = response();

    await api.handle(request(), output);

    expect(output.statusCode).toBe(503);
    expect(JSON.parse(output.body).error).toBe(
      "assistant_runtime_governance_unsafe",
    );
    expect(fetchImplementation).not.toHaveBeenCalled();
    expect(
      events.some(
        (event) =>
          event.type === "provider.runtime_guard.denied" &&
          event.reason === "distributed_governance_required" &&
          event.metadata.correlationId === "req-topology",
      ),
    ).toBe(true);
  });

  it("fails closed when durable governance state is unavailable", async () => {
    const fetchImplementation = vi.fn();
    const api = createAssistantApi({
      getEnvironmentValue: environment(),
      fetchImplementation,
      observeProviderEvent: () => {},
    });
    const output = response();

    await api.handle(request(), output);

    expect(output.statusCode).toBe(503);
    expect(JSON.parse(output.body).error).toBe(
      "assistant_governance_state_unavailable",
    );
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it("keeps settled budget across Assistant API recreation", async () => {
    const store = memoryStateStore();
    const fetchImplementation = vi.fn(async () =>
      providerResponse({
        prompt_tokens: 100_000,
        completion_tokens: 0,
        total_tokens: 100_000,
      }),
    );
    const guardedEnvironment = environment({
      OPENAI_DAILY_COST_LIMIT_USD: "0.2",
      OPENAI_REQUEST_RESERVE_USD: "0.15",
    });
    const firstApi = createAssistantApi({
      getEnvironmentValue: guardedEnvironment,
      fetchImplementation,
      governanceStateStore: store,
      observeProviderEvent: () => {},
    });
    const first = response();
    await firstApi.handle(request(), first);
    expect(first.statusCode).toBe(200);

    const restartedApi = createAssistantApi({
      getEnvironmentValue: guardedEnvironment,
      fetchImplementation,
      governanceStateStore: store,
      observeProviderEvent: () => {},
    });
    const second = response();
    await restartedApi.handle(request(), second);

    expect(second.statusCode).toBe(429);
    expect(JSON.parse(second.body).error).toBe("assistant_budget_exhausted");
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });
});
