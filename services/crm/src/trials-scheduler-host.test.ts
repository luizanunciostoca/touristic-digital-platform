import { describe, expect, it, vi } from "vitest";

import type { CrmTrialScheduler } from "@touristic/crm/trials-scheduler";

import { CrmTrialSchedulerHost } from "./trials-scheduler-host.js";

const emptyResult = {
  considered: 0,
  claimed: 0,
  expired: 0,
  failed: 0,
};

describe("CRM M92 trials scheduler host", () => {
  it("rejects unsafe sub-second polling intervals", () => {
    expect(
      () =>
        new CrmTrialSchedulerHost(
          { runDue: async () => emptyResult } as CrmTrialScheduler,
          { intervalMs: 999 },
        ),
    ).toThrow("CRM trial scheduler interval must be at least 1000ms");
  });

  it("coalesces overlapping runs into one scheduler execution", async () => {
    let resolveRun: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      resolveRun = resolve;
    });
    const runDue = vi.fn(async () => {
      await gate;
      return emptyResult;
    });
    const host = new CrmTrialSchedulerHost(
      { runDue } as unknown as CrmTrialScheduler,
      { intervalMs: 1_000 },
    );

    const first = host.runOnce();
    const second = host.runOnce();
    expect(runDue).toHaveBeenCalledTimes(1);
    resolveRun?.();
    await Promise.all([first, second]);
    expect(runDue).toHaveBeenCalledTimes(1);
  });

  it("reports scheduler results and isolates run errors", async () => {
    const onRun = vi.fn();
    const onError = vi.fn();
    const successful = new CrmTrialSchedulerHost(
      {
        runDue: async () => ({ ...emptyResult, considered: 2, expired: 2 }),
      } as CrmTrialScheduler,
      { intervalMs: 1_000, onRun, onError },
    );
    await successful.runOnce();
    expect(onRun).toHaveBeenCalledWith({
      considered: 2,
      claimed: 0,
      expired: 2,
      failed: 0,
    });
    expect(onError).not.toHaveBeenCalled();

    const failing = new CrmTrialSchedulerHost(
      {
        runDue: async () => {
          throw new Error("scheduler_failed");
        },
      } as CrmTrialScheduler,
      { intervalMs: 1_000, onError },
    );
    await expect(failing.runOnce()).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });
});
