import { EventEmitter } from "node:events";

import { describe, expect, it, vi } from "vitest";

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
    OPENAI_REQUEST_RESERVE_USD: "0.5",
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

function requestFromRaw(raw, { aborted = false } = {}) {
  const input = new EventEmitter();
  input.method = "POST";
  input.socket = { remoteAddress: "127.0.0.1" };
  input.aborted = aborted;
  input[Symbol.asyncIterator] = async function* iterate() {
    yield Buffer.from(raw);
  };
  return input;
}

function jsonRequest(body = { input: "Olá" }, options) {
  return requestFromRaw(JSON.stringify(body), options);
}

function response() {
  const output = new EventEmitter();
  const headers = new Map();
  output.statusCode = 0;
  output.body = "";
  output.writableEnded = false;
  output.setHeader = (name, value) => {
    headers.set(String(name).toLowerCase(), String(value));
  };
  output.end = (value = "") => {
    output.body = String(value);
    output.writableEnded = true;
  };
  output.headers = headers;
  return output;
}

describe("assistant request cancellation and input safety", () => {
  it("aborts an in-flight paid provider request when the client disconnects", async () => {
    const events = [];
    let providerSignal;
    let notifyProviderStarted;
    const providerStarted = new Promise((resolve) => {
      notifyProviderStarted = resolve;
    });
    const fetchImplementation = vi.fn((_url, options) => {
      providerSignal = options.signal;
      notifyProviderStarted();
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener(
          "abort",
          () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          },
          { once: true },
        );
      });
    });
    const api = createAssistantApi({
      getEnvironmentValue: environment(),
      fetchImplementation,
      governanceStateStore: memoryStateStore(),
      createRequestId: () => "req-client-disconnect",
      observeProviderEvent: (event) => events.push(event),
    });
    const output = response();

    const handling = api.handle(jsonRequest(), output);
    await providerStarted;
    output.emit("close");
    await handling;

    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    expect(providerSignal.aborted).toBe(true);
    expect(output.writableEnded).toBe(false);
    expect(api.observabilitySnapshot().usage.daily.spentUsd).toBe(0.5);
    expect(
      events.some(
        (event) =>
          event.type === "provider.request.failed" &&
          event.reason === "client_disconnected" &&
          event.metadata.correlationId === "req-client-disconnect",
      ),
    ).toBe(true);
  });

  it("does not reserve budget or call the provider when the client is already aborted", async () => {
    const events = [];
    const fetchImplementation = vi.fn();
    const api = createAssistantApi({
      getEnvironmentValue: environment(),
      fetchImplementation,
      governanceStateStore: memoryStateStore(),
      createRequestId: () => "req-pre-aborted",
      observeProviderEvent: (event) => events.push(event),
    });
    const output = response();

    await api.handle(jsonRequest({ input: "Olá" }, { aborted: true }), output);

    expect(fetchImplementation).not.toHaveBeenCalled();
    expect(api.observabilitySnapshot().usage.daily.requests).toBe(0);
    expect(api.observabilitySnapshot().usage.daily.spentUsd).toBe(0);
    expect(
      events.some(
        (event) =>
          event.type === "provider.request.cancelled" &&
          event.reason === "client_disconnected_before_provider" &&
          event.metadata.correlationId === "req-pre-aborted",
      ),
    ).toBe(true);
  });

  it("returns 400 for malformed JSON without reserving provider budget", async () => {
    const fetchImplementation = vi.fn();
    const api = createAssistantApi({
      getEnvironmentValue: environment(),
      fetchImplementation,
      governanceStateStore: memoryStateStore(),
      observeProviderEvent: () => {},
    });
    const output = response();

    await api.handle(requestFromRaw('{"input":'), output);

    expect(output.statusCode).toBe(400);
    expect(JSON.parse(output.body).error).toBe("assistant_invalid_json");
    expect(fetchImplementation).not.toHaveBeenCalled();
    expect(api.observabilitySnapshot().usage.daily.requests).toBe(0);
  });

  it("returns 413 for an oversized body without reserving provider budget", async () => {
    const fetchImplementation = vi.fn();
    const api = createAssistantApi({
      getEnvironmentValue: environment(),
      fetchImplementation,
      governanceStateStore: memoryStateStore(),
      observeProviderEvent: () => {},
    });
    const output = response();
    const oversizedBody = JSON.stringify({ input: "x".repeat(70 * 1024) });

    await api.handle(requestFromRaw(oversizedBody), output);

    expect(output.statusCode).toBe(413);
    expect(JSON.parse(output.body).error).toBe("assistant_request_too_large");
    expect(fetchImplementation).not.toHaveBeenCalled();
    expect(api.observabilitySnapshot().usage.daily.requests).toBe(0);
  });
});
