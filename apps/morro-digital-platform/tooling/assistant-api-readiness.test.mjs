import { describe, expect, it } from "vitest";

import { createAssistantApi } from "./assistant-api.mjs";

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

describe("assistant runtime readiness", () => {
  it("keeps readiness non-critical when the paid provider is deliberately disabled", () => {
    const api = createAssistantApi({
      getEnvironmentValue: environment({
        OPENAI_PROVIDER_HARD_LIMIT_CONFIRMED: "false",
        OPENAI_API_KEY: "",
      }),
      governanceStateStore: memoryStateStore(),
      observeProviderEvent: () => {},
    });

    expect(api.readinessCheck()).toEqual({
      status: "pass",
      critical: false,
      detail: "assistant-provider-disabled",
    });
  });

  it("fails readiness when the provider is enabled without its server credential", () => {
    const api = createAssistantApi({
      getEnvironmentValue: environment({ OPENAI_API_KEY: "" }),
      governanceStateStore: memoryStateStore(),
      observeProviderEvent: () => {},
    });

    expect(api.readinessCheck()).toEqual({
      status: "fail",
      critical: true,
      detail: "OPENAI_API_KEY_REQUIRED",
    });
  });

  it("reports ready only when paid-provider governance is completely configured", () => {
    const api = createAssistantApi({
      getEnvironmentValue: environment(),
      governanceStateStore: memoryStateStore(),
      observeProviderEvent: () => {},
    });

    expect(api.readinessCheck()).toEqual({
      status: "pass",
      critical: true,
      detail: "assistant-provider-ready",
    });
  });
});
