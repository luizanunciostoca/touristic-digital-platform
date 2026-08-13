import { describe, expect, it, vi } from "vitest";

import type { CrmTrial } from "./index.js";
import {
  CrmTrialNotificationProcessor,
  type CrmTrialNotificationRepository,
} from "./trials-notification.js";

const notifiedAt = new Date("2026-08-13T00:00:00.000Z");

function expiredTrial(overrides: Partial<CrmTrial> = {}): CrmTrial {
  return {
    id: 31,
    leadId: 7,
    startDate: new Date("2026-07-13T00:00:00.000Z"),
    endDate: new Date("2026-08-12T00:00:00.000Z"),
    durationDays: 30,
    status: "expired",
    convertedAt: null,
    notifiedAt: null,
    scheduleCronTaskUid: "trial-expiry-31",
    createdAt: new Date("2026-07-13T00:00:00.000Z"),
    updatedAt: new Date("2026-08-12T00:00:00.000Z"),
    ...overrides,
  };
}

function harness(delivered = true) {
  let current = expiredTrial();
  let claim: string | null = null;
  let uid = 0;
  const appendInteraction = vi.fn(async () => {});
  const repository: CrmTrialNotificationRepository = {
    listExpiredUnnotified: async () =>
      current.notifiedAt === null && claim === null ? [current] : [],
    claimExpiredUnnotified: async (_id, taskUid) => {
      if (current.notifiedAt !== null || claim !== null) return false;
      claim = taskUid;
      return true;
    },
    releaseNotificationClaim: async (_id, taskUid) => {
      if (claim === taskUid && current.notifiedAt === null) claim = null;
    },
    markNotifiedClaimed: async (_id, taskUid, at) => {
      if (claim !== taskUid) throw new Error("claim_lost");
      current = expiredTrial({ ...current, notifiedAt: at });
      claim = null;
      return current;
    },
    appendInteraction,
  };
  const send = vi.fn(async () => ({ delivered }));
  const processor = new CrmTrialNotificationProcessor(
    repository,
    { send },
    () => `notification-${++uid}`,
    () => notifiedAt,
  );
  return {
    processor,
    repository,
    send,
    appendInteraction,
    getCurrent: () => current,
    getClaim: () => claim,
  };
}

describe("CRM M94 trials expiry notification claiming", () => {
  it("claims before delivery and persists notifiedAt only while owning the claim", async () => {
    const { processor, send, appendInteraction, getCurrent, getClaim } =
      harness();
    await expect(processor.runPending()).resolves.toEqual({
      considered: 1,
      claimed: 1,
      delivered: 1,
      failed: 0,
    });
    expect(send).toHaveBeenCalledWith({
      trialId: 31,
      leadId: 7,
      expiredAt: new Date("2026-08-12T00:00:00.000Z"),
    });
    expect(getCurrent().notifiedAt).toEqual(notifiedAt);
    expect(getClaim()).toBeNull();
    expect(appendInteraction).toHaveBeenCalledTimes(1);
  });

  it("releases the durable claim when delivery is not confirmed", async () => {
    const { processor, appendInteraction, getCurrent, getClaim } = harness(false);
    await expect(processor.runPending()).resolves.toEqual({
      considered: 1,
      claimed: 1,
      delivered: 0,
      failed: 1,
    });
    expect(getCurrent().notifiedAt).toBeNull();
    expect(getClaim()).toBeNull();
    expect(appendInteraction).not.toHaveBeenCalled();
  });

  it("is idempotent after notifiedAt is durably set", async () => {
    const { processor, send } = harness();
    await processor.runPending();
    await expect(processor.runPending()).resolves.toEqual({
      considered: 0,
      claimed: 0,
      delivered: 0,
      failed: 0,
    });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("allows only one processor to deliver when two instances race", async () => {
    const { repository } = harness();
    let releaseDelivery: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      releaseDelivery = resolve;
    });
    const send = vi.fn(async () => {
      await gate;
      return { delivered: true };
    });
    const first = new CrmTrialNotificationProcessor(
      repository,
      { send },
      () => "instance-a",
      () => notifiedAt,
    );
    const second = new CrmTrialNotificationProcessor(
      repository,
      { send },
      () => "instance-b",
      () => notifiedAt,
    );

    const firstRun = first.runPending();
    await Promise.resolve();
    const secondRun = second.runPending();
    releaseDelivery?.();

    const [firstResult, secondResult] = await Promise.all([
      firstRun,
      secondRun,
    ]);
    expect(firstResult.claimed + secondResult.claimed).toBe(1);
    expect(firstResult.delivered + secondResult.delivered).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
