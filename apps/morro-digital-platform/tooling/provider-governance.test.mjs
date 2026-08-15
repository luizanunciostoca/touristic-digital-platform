import { describe, expect, it, vi } from "vitest";

import {
  calculateTokenCostUsd,
  createProviderCostGovernor,
} from "./provider-governance.mjs";

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

  it("does not interpret missing token usage as zero cost", () => {
    expect(
      calculateTokenCostUsd({
        inputUsdPerMillion: 1,
        outputUsdPerMillion: 2,
      }),
    ).toBeNull();
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

  it("persists settled spend across process-style governor restarts", () => {
    const store = memoryStateStore();
    const options = {
      provider: "openai",
      dailyLimitUsd: 1,
      monthlyLimitUsd: 10,
      requestReserveUsd: 0.6,
      maxConcurrency: 1,
      stateStore: store,
      requirePersistentState: true,
      createReservationId: () => "reservation",
    };
    const firstGovernor = createProviderCostGovernor(options);
    const attempt = firstGovernor.reserve({ correlationId: "req-1" });
    firstGovernor.settle(attempt.reservation, { costUsd: 0.5 });

    const restartedGovernor = createProviderCostGovernor({
      ...options,
      createReservationId: () => "reservation-2",
    });
    expect(restartedGovernor.snapshot().daily.spentUsd).toBe(0.5);
    expect(restartedGovernor.reserve().reason).toBe("daily_budget_exhausted");
  });

  it("recovers an orphaned reservation conservatively after restart", () => {
    const store = memoryStateStore();
    const events = [];
    const options = {
      provider: "openai",
      dailyLimitUsd: 1,
      monthlyLimitUsd: 10,
      requestReserveUsd: 0.6,
      maxConcurrency: 1,
      stateStore: store,
      requirePersistentState: true,
    };
    const firstGovernor = createProviderCostGovernor({
      ...options,
      createReservationId: () => "orphan",
    });
    expect(firstGovernor.reserve({ correlationId: "req-orphan" }).allowed).toBe(
      true,
    );

    const restartedGovernor = createProviderCostGovernor({
      ...options,
      createReservationId: () => "next",
      onEvent: (event) => events.push(event),
    });
    const snapshot = restartedGovernor.snapshot();
    expect(snapshot.activeRequests).toBe(0);
    expect(snapshot.daily.reservedUsd).toBe(0);
    expect(snapshot.daily.spentUsd).toBe(0.6);
    expect(snapshot.persistence.recoveredReservations).toBe(1);
    expect(restartedGovernor.reserve().reason).toBe("daily_budget_exhausted");
    expect(
      events.some(
        (event) =>
          event.type === "provider.request.recovered" &&
          event.metadata.correlationId === "req-orphan",
      ),
    ).toBe(true);
  });

  it("fails closed when persistent state is required but unavailable", () => {
    const governor = createProviderCostGovernor({
      provider: "openai",
      dailyLimitUsd: 10,
      monthlyLimitUsd: 100,
      requestReserveUsd: 1,
      maxConcurrency: 2,
      requirePersistentState: true,
    });
    expect(governor.configured).toBe(false);
    expect(governor.reserve().reason).toBe("budget_not_configured");
    expect(governor.snapshot().persistence.configured).toBe(false);
  });

  it("fails closed after a reservation cannot be persisted", () => {
    const onEvent = vi.fn();
    const governor = createProviderCostGovernor({
      provider: "openai",
      dailyLimitUsd: 10,
      monthlyLimitUsd: 100,
      requestReserveUsd: 1,
      maxConcurrency: 2,
      stateStore: {
        load: () => null,
        save: () => {
          const error = new Error("disk unavailable");
          error.code = "EIO";
          throw error;
        },
      },
      requirePersistentState: true,
      onEvent,
    });

    expect(governor.reserve({ correlationId: "req-fail" }).reason).toBe(
      "state_persistence_failed",
    );
    expect(governor.configured).toBe(false);
    expect(
      onEvent.mock.calls
        .map(([event]) => event)
        .some(
          (event) =>
            event.type === "provider.governance.persistence_failed" &&
            event.errorCode === "EIO",
        ),
    ).toBe(true);
  });
});
