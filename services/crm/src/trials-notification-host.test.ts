import { describe, expect, it, vi } from "vitest";

import {
  CRM_TRIAL_NOTIFICATION_IDEMPOTENCY_CAPABILITY,
  type CrmTrialNotificationProcessor,
} from "@touristic/crm/trials-notification";

import {
  createCrmTrialNotificationHost,
  CrmTrialNotificationHost,
} from "./trials-notification-host.js";

const emptyResult = {
  considered: 0,
  claimed: 0,
  delivered: 0,
  failed: 0,
};

describe("CRM M98 trial notification host provider capability", () => {
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

  it("fails closed before wiring a delivery adapter without provider deduplication", () => {
    expect(() =>
      createCrmTrialNotificationHost({} as never, {
        intervalMs: 1_000,
        claimLeaseMs: 60_000,
        createTaskUid: () => "notification-1",
        delivery: {
          send: async () => ({ delivered: true }),
        },
      }),
    ).toThrow(
      "CRM trial notification delivery must provide stable-key provider deduplication",
    );
  });

  it("accepts an adapter that declares stable-key provider deduplication", () => {
    expect(() =>
      createCrmTrialNotificationHost({} as never, {
        intervalMs: 1_000,
        claimLeaseMs: 60_000,
        createTaskUid: () => "notification-1",
        delivery: {
          idempotencyCapability: CRM_TRIAL_NOTIFICATION_IDEMPOTENCY_CAPABILITY,
          send: async () => ({ delivered: true }),
        },
      }),
    ).not.toThrow();
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
          claimed: 2,
          delivered: 2,
          failed: 0,
        }),
      } as unknown as CrmTrialNotificationProcessor,
      { intervalMs: 1_000, onRun, onError },
    );
    await successful.runOnce();
    expect(onRun).toHaveBeenCalledWith({
      considered: 2,
      claimed: 2,
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
