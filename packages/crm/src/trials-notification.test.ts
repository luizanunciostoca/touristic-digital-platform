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
  const appendInteraction = vi.fn(async () => {});
  const repository: CrmTrialNotificationRepository = {
    listExpiredUnnotified: async () =>
      current.notifiedAt === null ? [current] : [],
    markNotified: async (_id, at) => {
      current = expiredTrial({ ...current, notifiedAt: at });
      return current;
    },
    appendInteraction,
  };
  const send = vi.fn(async () => ({ delivered }));
  const processor = new CrmTrialNotificationProcessor(
    repository,
    { send },
    () => notifiedAt,
  );
  return { processor, send, appendInteraction, getCurrent: () => current };
}

describe("CRM M93 trials expiry notification", () => {
  it("delivers an expired unnotified trial and persists notifiedAt", async () => {
    const { processor, send, appendInteraction, getCurrent } = harness();
    await expect(processor.runPending()).resolves.toEqual({
      considered: 1,
      delivered: 1,
      failed: 0,
    });
    expect(send).toHaveBeenCalledWith({
      trialId: 31,
      leadId: 7,
      expiredAt: new Date("2026-08-12T00:00:00.000Z"),
    });
    expect(getCurrent().notifiedAt).toEqual(notifiedAt);
    expect(appendInteraction).toHaveBeenCalledTimes(1);
  });

  it("keeps the trial unnotified when delivery is not confirmed", async () => {
    const { processor, appendInteraction, getCurrent } = harness(false);
    await expect(processor.runPending()).resolves.toEqual({
      considered: 1,
      delivered: 0,
      failed: 1,
    });
    expect(getCurrent().notifiedAt).toBeNull();
    expect(appendInteraction).not.toHaveBeenCalled();
  });

  it("is idempotent after notifiedAt is durably set", async () => {
    const { processor, send } = harness();
    await processor.runPending();
    await expect(processor.runPending()).resolves.toEqual({
      considered: 0,
      delivered: 0,
      failed: 0,
    });
    expect(send).toHaveBeenCalledTimes(1);
  });
});
