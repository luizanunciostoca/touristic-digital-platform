import { describe, expect, it, vi } from "vitest";

import type { CrmTrialNotificationProcessor } from "@touristic/crm/trials-notification";

import { CrmTrialNotificationHost } from "./trials-notification-host.js";

const emptyResult = {
  considered: 0,
  delivered: 0,
  failed: 0,
};

describe("CRM M93 trial notification host", () => {
  it("rejects unsafe sub-second polling intervals", () => {
    expect(
      () =>
        new CrmTrialNotificationHost(
          {
            runPending: async () => emptyResult,
          } as unknown as CrmTrialNotificationProcessor,
          { intervalMs: 999 },
        ),
    ).toThrow("CRM trial notification interval must be at least 1000ms");
  });

  it("coalesces overlapping runs into one processor execution", async () => {
    let resolveRun: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      resolveRun = resolve;
    });
    const runPending = vi.fn(async () => {
      await gate;
      return emptyResult;
    });
    const host = new CrmTrialNotificationHost(
      { runPending } as unknown as CrmTrialNotificationProcessor,
      { intervalMs: 1_000 },
    );

    const first = host.runOnce();
    const second = host.runOnce();
    expect(runPending).toHaveBeenCalledTimes(1);
    resolveRun?.();
    await Promise.all([first, second]);
    expect(runPending).toHaveBeenCalledTimes(1);
  });

  it("reports processor results and isolates run errors", async () => {
    const onRun = vi.fn();
    const onError = vi.fn();
    const successful = new CrmTrialNotificationHost(
      {
        runPending: async () => ({
          considered: 2,
          delivered: 2,
          failed: 0,
        }),
      } as unknown as CrmTrialNotificationProcessor,
      { intervalMs: 1_000, onRun, onError },
    );
    await successful.runOnce();
    expect(onRun).toHaveBeenCalledWith({
      considered: 2,
      delivered: 2,
      failed: 0,
    });
    expect(onError).not.toHaveBeenCalled();

    const failing = new CrmTrialNotificationHost(
      {
        runPending: async () => {
          throw new Error("notification_failed");
        },
      } as unknown as CrmTrialNotificationProcessor,
      { intervalMs: 1_000, onError },
    );
    await expect(failing.runOnce()).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });
});
