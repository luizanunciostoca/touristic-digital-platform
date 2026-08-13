import { afterEach, describe, expect, it, vi } from "vitest";

import type { CrmTrial } from "./index.js";
import {
  createCrmTrialNotificationIdempotencyKey,
  CrmTrialNotificationProcessor,
  type CrmTrialNotificationRepository,
} from "./trials-notification.js";

const baseNow = Date.parse("2026-08-13T00:00:00.000Z");
const claimLeaseMs = 60_000;

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
  let claim: { uid: string; claimedAt: Date | null } | null = null;
  let uid = 0;
  let nowMs = baseNow;
  let renewalAllowed = true;
  const appendInteraction = vi.fn(async () => {});

  const isClaimAvailable = (staleBefore: Date) =>
    claim === null ||
    claim.claimedAt === null ||
    claim.claimedAt.getTime() <= staleBefore.getTime();

  const renewNotificationClaim = vi.fn(
    async (_id: number, taskUid: string, renewedAt: Date) => {
      if (
        !renewalAllowed ||
        current.notifiedAt !== null ||
        claim?.uid !== taskUid
      ) {
        return false;
      }
      claim = { uid: taskUid, claimedAt: renewedAt };
      return true;
    },
  );

  const repository: CrmTrialNotificationRepository = {
    listExpiredUnnotified: async (staleBefore) =>
      current.notifiedAt === null && isClaimAvailable(staleBefore)
        ? [current]
        : [],
    claimExpiredUnnotified: async (_id, taskUid, claimedAt, staleBefore) => {
      if (current.notifiedAt !== null || !isClaimAvailable(staleBefore)) {
        return false;
      }
      claim = { uid: taskUid, claimedAt };
      return true;
    },
    renewNotificationClaim,
    releaseNotificationClaim: async (_id, taskUid) => {
      if (claim?.uid === taskUid && current.notifiedAt === null) claim = null;
    },
    markNotifiedClaimed: async (_id, taskUid, at) => {
      if (claim?.uid !== taskUid) throw new Error("claim_lost");
      current = expiredTrial({ ...current, notifiedAt: at });
      claim = null;
      return current;
    },
    appendInteraction,
  };
  const send = vi.fn(async () => ({ delivered }));
  const now = () => new Date(nowMs);
  const processor = new CrmTrialNotificationProcessor(
    repository,
    { send },
    () => `notification-${++uid}`,
    claimLeaseMs,
    now,
  );
  return {
    processor,
    repository,
    send,
    now,
    renewNotificationClaim,
    appendInteraction,
    getCurrent: () => current,
    getClaim: () => claim,
    setClaim: (value: { uid: string; claimedAt: Date | null } | null) => {
      claim = value;
    },
    setNow: (value: number) => {
      nowMs = value;
    },
    setRenewalAllowed: (value: boolean) => {
      renewalAllowed = value;
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("CRM M97 trials expiry notification provider idempotency", () => {
  it("derives a stable versioned provider key from the logical trial event", () => {
    expect(createCrmTrialNotificationIdempotencyKey(31)).toBe(
      "crm.trial.expired.notification:v1:31",
    );
    expect(createCrmTrialNotificationIdempotencyKey(31)).toBe(
      createCrmTrialNotificationIdempotencyKey(31),
    );
    expect(createCrmTrialNotificationIdempotencyKey(32)).not.toBe(
      createCrmTrialNotificationIdempotencyKey(31),
    );
  });

  it("rejects unsafe sub-second claim leases", () => {
    const { repository } = harness();
    expect(
      () =>
        new CrmTrialNotificationProcessor(
          repository,
          { send: async () => ({ delivered: true }) },
          () => "notification-1",
          999,
        ),
    ).toThrow("CRM trial notification claim lease must be at least 1000ms");
  });

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
      idempotencyKey: "crm.trial.expired.notification:v1:31",
    });
    expect(getCurrent().notifiedAt).toEqual(new Date(baseNow));
    expect(getClaim()).toBeNull();
    expect(appendInteraction).toHaveBeenCalledTimes(1);
  });

  it("keeps the provider key stable across a released retry with a new claim uid", async () => {
    const { processor, repository, send } = harness(false);
    await expect(processor.runPending()).resolves.toMatchObject({
      claimed: 1,
      delivered: 0,
      failed: 1,
    });

    const retrySend = vi.fn(async () => ({ delivered: true }));
    const retry = new CrmTrialNotificationProcessor(
      repository,
      { send: retrySend },
      () => "different-claim-owner",
      claimLeaseMs,
      () => new Date(baseNow + 1_000),
    );
    await expect(retry.runPending()).resolves.toMatchObject({
      claimed: 1,
      delivered: 1,
      failed: 0,
    });

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "crm.trial.expired.notification:v1:31",
      }),
    );
    expect(retrySend).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "crm.trial.expired.notification:v1:31",
      }),
    );
  });

  it("does not steal a live claim before its lease expires", async () => {
    const { processor, send, setClaim } = harness();
    setClaim({
      uid: "live-instance",
      claimedAt: new Date(baseNow - claimLeaseMs + 1),
    });
    await expect(processor.runPending()).resolves.toEqual({
      considered: 0,
      claimed: 0,
      delivered: 0,
      failed: 0,
    });
    expect(send).not.toHaveBeenCalled();
  });

  it("atomically recovers a claim after its lease expires", async () => {
    const { processor, send, setClaim, getClaim } = harness();
    setClaim({
      uid: "crashed-instance",
      claimedAt: new Date(baseNow - claimLeaseMs),
    });
    await expect(processor.runPending()).resolves.toEqual({
      considered: 1,
      claimed: 1,
      delivered: 1,
      failed: 0,
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "crm.trial.expired.notification:v1:31",
      }),
    );
    expect(getClaim()).toBeNull();
  });

  it("recovers legacy M94 claims that have no claimed timestamp", async () => {
    const { processor, send, setClaim } = harness();
    setClaim({ uid: "legacy-m94-instance", claimedAt: null });
    await expect(processor.runPending()).resolves.toMatchObject({
      considered: 1,
      claimed: 1,
      delivered: 1,
    });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("keeps a long-running delivery claim alive so a second instance cannot reclaim it", async () => {
    vi.useFakeTimers();
    const { repository, now, renewNotificationClaim, getClaim, setNow } =
      harness();
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
      claimLeaseMs,
      now,
    );

    const firstRun = first.runPending();
    await Promise.resolve();
    expect(getClaim()?.uid).toBe("instance-a");

    setNow(baseNow + 20_000);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(renewNotificationClaim).toHaveBeenCalledTimes(1);
    expect(getClaim()?.claimedAt).toEqual(new Date(baseNow + 20_000));

    const second = new CrmTrialNotificationProcessor(
      repository,
      { send },
      () => "instance-b",
      claimLeaseMs,
      () => new Date(baseNow + 60_000),
    );
    await expect(second.runPending()).resolves.toEqual({
      considered: 0,
      claimed: 0,
      delivered: 0,
      failed: 0,
    });

    releaseDelivery?.();
    await firstRun;
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("fails closed when heartbeat renewal loses claim ownership", async () => {
    vi.useFakeTimers();
    const { repository, appendInteraction, setRenewalAllowed } = harness();
    setRenewalAllowed(false);
    let releaseDelivery: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      releaseDelivery = resolve;
    });
    const processor = new CrmTrialNotificationProcessor(
      repository,
      {
        send: async () => {
          await gate;
          return { delivered: true };
        },
      },
      () => "instance-a",
      claimLeaseMs,
      () => new Date(baseNow),
    );

    const run = processor.runPending();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(20_000);
    releaseDelivery?.();

    await expect(run).resolves.toEqual({
      considered: 1,
      claimed: 1,
      delivered: 0,
      failed: 1,
    });
    expect(appendInteraction).not.toHaveBeenCalled();
  });

  it("releases the durable claim when delivery is not confirmed", async () => {
    const { processor, appendInteraction, getCurrent, getClaim } =
      harness(false);
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
      claimLeaseMs,
      () => new Date(baseNow),
    );
    const second = new CrmTrialNotificationProcessor(
      repository,
      { send },
      () => "instance-b",
      claimLeaseMs,
      () => new Date(baseNow),
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
