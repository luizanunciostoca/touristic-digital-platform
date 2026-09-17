import { describe, expect, it } from "vitest";

import { createProviderCircuitBreaker } from "./provider-circuit-breaker.mjs";

describe("provider circuit breaker", () => {
  it("opens after consecutive failures and denies calls during cooldown", () => {
    let timestamp = 1_000;
    const events = [];
    const breaker = createProviderCircuitBreaker({
      provider: "openai",
      failureThreshold: 3,
      cooldownMs: 30_000,
      now: () => timestamp,
      onEvent: (event) => events.push(event),
    });

    expect(breaker.allow().allowed).toBe(true);
    breaker.failure("provider_http_error", { correlationId: "req-1" });
    expect(breaker.snapshot().state).toBe("closed");

    breaker.failure("provider_http_error", { correlationId: "req-2" });
    expect(breaker.snapshot().state).toBe("closed");

    breaker.failure("provider_timeout", { correlationId: "req-3" });
    expect(breaker.snapshot().state).toBe("open");

    const denied = breaker.allow({ correlationId: "req-4" });
    expect(denied.allowed).toBe(false);
    expect(denied.reason).toBe("circuit_open");
    expect(denied.retryAfterMs).toBe(30_000);
    expect(
      events.some((event) => event.type === "provider.circuit.opened"),
    ).toBe(true);
  });

  it("allows one half-open probe and closes after recovery", () => {
    let timestamp = 1_000;
    const breaker = createProviderCircuitBreaker({
      failureThreshold: 1,
      cooldownMs: 5_000,
      now: () => timestamp,
    });

    breaker.failure("provider_timeout");
    expect(breaker.snapshot().state).toBe("open");

    timestamp += 5_000;
    expect(breaker.allow().allowed).toBe(true);
    expect(breaker.snapshot().state).toBe("half_open");

    const concurrent = breaker.allow();
    expect(concurrent.allowed).toBe(false);
    expect(concurrent.reason).toBe("half_open_probe_in_progress");

    breaker.success();
    expect(breaker.snapshot().state).toBe("closed");
    expect(breaker.snapshot().consecutiveFailures).toBe(0);
    expect(breaker.allow().allowed).toBe(true);
  });

  it("reopens when the half-open probe fails", () => {
    let timestamp = 10_000;
    const breaker = createProviderCircuitBreaker({
      failureThreshold: 2,
      cooldownMs: 1_000,
      now: () => timestamp,
    });

    breaker.failure("provider_error");
    breaker.failure("provider_error");
    timestamp += 1_000;
    expect(breaker.allow().allowed).toBe(true);
    breaker.failure("provider_timeout");

    expect(breaker.snapshot().state).toBe("open");
    expect(breaker.allow().allowed).toBe(false);
  });

  it("does not retain arbitrary prompt-like metadata", () => {
    const events = [];
    const breaker = createProviderCircuitBreaker({
      failureThreshold: 1,
      onEvent: (event) => events.push(event),
    });

    breaker.failure("provider_error", {
      correlationId: "req-safe",
      model: "test-model",
      nested: { prompt: "sensitive" },
      array: ["sensitive"],
    });

    const opened = events.find(
      (event) => event.type === "provider.circuit.opened",
    );
    expect(opened.metadata).toEqual({
      correlationId: "req-safe",
      model: "test-model",
    });
  });
});
