import { describe, expect, it, vi } from "vitest";

import type { CrmFollowUpSchedulerResult } from "@touristic/crm/followups-scheduler";

import { CrmFollowUpSchedulerHost } from "./followups-scheduler-host.js";

const emptyResult: CrmFollowUpSchedulerResult = {
  considered: 0,
  claimed: 0,
  sent: 0,
  skipped: 0,
  failed: 0,
};

describe("CRM M88 follow-ups scheduler host", () => {
  it("rejects unsafe intervals", () => {
    expect(
      () =>
        new CrmFollowUpSchedulerHost(
          { runDue: async () => emptyResult } as never,
          { intervalMs: 999 },
        ),
    ).toThrow("at least 1000ms");
  });

  it("runs immediately, serializes overlapping ticks and stops cleanly", async () => {
    vi.useFakeTimers();
    let release: (() => void) | null = null;
    let calls = 0;
    const scheduler = {
      runDue: async () => {
        calls += 1;
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return emptyResult;
      },
    };
    const host = new CrmFollowUpSchedulerHost(scheduler as never, {
      intervalMs: 1_000,
    });

    host.start();
    expect(host.started).toBe(true);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(calls).toBe(1);

    release?.();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(calls).toBe(2);

    release?.();
    await host.stop();
    expect(host.started).toBe(false);
    vi.useRealTimers();
  });

  it("is idempotent and reports successful runs", async () => {
    vi.useFakeTimers();
    const results: CrmFollowUpSchedulerResult[] = [];
    let calls = 0;
    const host = new CrmFollowUpSchedulerHost(
      {
        runDue: async () => {
          calls += 1;
          return { ...emptyResult, sent: calls };
        },
      } as never,
      {
        intervalMs: 1_000,
        runImmediately: false,
        onRun: (result) => {
          results.push(result);
        },
      },
    );

    host.start();
    host.start();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(calls).toBe(1);
    expect(results).toEqual([{ ...emptyResult, sent: 1 }]);
    await host.stop();
    await host.stop();
    vi.useRealTimers();
  });

  it("contains scheduler failures through onError and keeps recurring", async () => {
    vi.useFakeTimers();
    const errors: unknown[] = [];
    let calls = 0;
    const host = new CrmFollowUpSchedulerHost(
      {
        runDue: async () => {
          calls += 1;
          if (calls === 1) throw new Error("tick_failed");
          return emptyResult;
        },
      } as never,
      {
        intervalMs: 1_000,
        runImmediately: false,
        onError: (error) => {
          errors.push(error);
        },
      },
    );

    host.start();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(calls).toBe(2);
    expect(errors).toHaveLength(1);
    await host.stop();
    vi.useRealTimers();
  });
});
