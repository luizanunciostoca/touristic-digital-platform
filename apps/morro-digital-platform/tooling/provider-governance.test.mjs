import { describe, expect, it, vi } from "vitest";

import {
  calculateTokenCostUsd,
  createProviderCostGovernor,
} from "./provider-governance.mjs";

describe("paid provider cost governance", () => {
  it("calculates provider cost from prompt and completion usage", () => {
    expect(
      calculateTokenCostUsd({
        promptTokens: 1_000_000,
        completionTokens: 500_000,
        inputUsdPerMillion: 1,
        outputUsdPerMillion: 2,
      }),
    ).toBe(2);
  });

  it("fails closed when budgets are not configured", () => {
    const governor = createProviderCostGovernor({ provider: "openai" });
    expect(governor.configured).toBe(false);
    expect(governor.reserve().reason).toBe("budget_not_configured");
  });

  it("reserves before the request and settles actual usage", () => {
    let timestamp = Date.UTC(2026, 7, 14, 12, 0, 0);
    const events = [];
    const governor = createProviderCostGovernor({
      provider: "openai",
      dailyLimitUsd: 10,
      monthlyLimitUsd: 100,
      requestReserveUsd: 1,
      maxConcurrency: 2,
      now: () => timestamp,
      onEvent: (event) => events.push(event),
    });

    const attempt = governor.reserve({ model: "test-model" });
    expect(attempt.allowed).toBe(true);
    expect(governor.snapshot().daily.reservedUsd).toBe(1);

    timestamp += 250;
    governor.settle(attempt.reservation, {
      costUsd: 0.25,
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    });

    const snapshot = governor.snapshot();
    expect(snapshot.activeRequests).toBe(0);
    expect(snapshot.daily.reservedUsd).toBe(0);
    expect(snapshot.daily.spentUsd).toBe(0.25);
    expect(snapshot.daily.totalTokens).toBe(150);
    expect(
      events.some((event) => event.type === "provider.request.settled"),
    ).toBe(true);
  });

  it("blocks requests that would cross the daily budget", () => {
    const governor = createProviderCostGovernor({
      provider: "openai",
      dailyLimitUsd: 1,
      monthlyLimitUsd: 10,
      requestReserveUsd: 0.6,
    });
    const first = governor.reserve();
    expect(first.allowed).toBe(true);
    expect(governor.reserve().reason).toBe("daily_budget_exhausted");
    governor.release(first.reservation, { reason: "test_complete" });
  });

  it("enforces concurrency independently of spend", () => {
    const governor = createProviderCostGovernor({
      provider: "openai",
      dailyLimitUsd: 100,
      monthlyLimitUsd: 1000,
      requestReserveUsd: 1,
      maxConcurrency: 1,
    });
    const first = governor.reserve();
    expect(first.allowed).toBe(true);
    expect(governor.reserve().reason).toBe("concurrency_limit");
    governor.release(first.reservation);
  });

  it("charges the conservative reservation when provider usage is missing", () => {
    const governor = createProviderCostGovernor({
      provider: "openai",
      dailyLimitUsd: 5,
      monthlyLimitUsd: 50,
      requestReserveUsd: 0.75,
    });
    const attempt = governor.reserve();
    governor.settle(attempt.reservation, {});
    expect(governor.snapshot().daily.spentUsd).toBe(0.75);
  });

  it("emits threshold events once per period", () => {
    const onEvent = vi.fn();
    const governor = createProviderCostGovernor({
      provider: "openai",
      dailyLimitUsd: 2,
      monthlyLimitUsd: 20,
      requestReserveUsd: 1,
      onEvent,
    });
    const attempt = governor.reserve();
    governor.settle(attempt.reservation, { costUsd: 1 });
    const thresholdEvents = onEvent.mock.calls
      .map(([event]) => event)
      .filter(
        (event) =>
          event.type === "provider.budget.threshold" &&
          event.period === "daily",
      );
    expect(
      thresholdEvents.filter((event) => event.threshold === 0.5),
    ).toHaveLength(1);
  });
});
