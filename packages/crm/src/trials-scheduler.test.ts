import { describe, expect, it } from "vitest";

import type { CrmTrial } from "./index.js";
import {
  CrmTrialScheduler,
  type CrmTrialSchedulerRepository,
} from "./trials-scheduler.js";

const now = new Date("2026-08-12T12:00:00.000Z");

function trial(overrides: Partial<CrmTrial> = {}): CrmTrial {
  return {
    id: 21,
    leadId: 7,
    startDate: new Date("2026-07-13T12:00:00.000Z"),
    endDate: now,
    durationDays: 30,
    status: "active",
    convertedAt: null,
    notifiedAt: null,
    scheduleCronTaskUid: null,
    createdAt: new Date("2026-07-13T12:00:00.000Z"),
    updatedAt: now,
    ...overrides,
  };
}

function harness(options: { claim?: boolean; failExpire?: boolean } = {}) {
  const interactions: Array<{
    leadId: number;
    content: string;
    actorSubject: string;
  }> = [];
  const released: Array<{ id: number; taskUid: string }> = [];
  let current = trial();
  const repository: CrmTrialSchedulerRepository = {
    listDue: async () => [current],
    claimDue: async (_id, taskUid) => {
      if (options.claim === false) return false;
      current = trial({ ...current, scheduleCronTaskUid: taskUid });
      return true;
    },
    releaseClaim: async (id, taskUid) => {
      released.push({ id, taskUid });
      current = trial({ ...current, scheduleCronTaskUid: null });
    },
    markExpiredClaimed: async () => {
      if (options.failExpire) throw new Error("expire_failed");
      current = trial({ ...current, status: "expired" });
      return current;
    },
    appendInteraction: async (input) => {
      interactions.push(input);
    },
  };
  const scheduler = new CrmTrialScheduler(repository, () => "task-1");
  return { scheduler, interactions, released };
}

describe("CRM M92 trials expiry scheduler", () => {
  it("claims and expires due trials once", async () => {
    const { scheduler, interactions } = harness();
    await expect(scheduler.runDue()).resolves.toEqual({
      considered: 1,
      claimed: 1,
      expired: 1,
      failed: 0,
    });
    expect(interactions).toEqual([
      {
        leadId: 7,
        content: "Trial expirado automaticamente.",
        actorSubject: "crm-trial-scheduler",
      },
    ]);
  });

  it("does not process a trial lost to another claimant", async () => {
    const { scheduler, interactions } = harness({ claim: false });
    await expect(scheduler.runDue()).resolves.toEqual({
      considered: 1,
      claimed: 0,
      expired: 0,
      failed: 0,
    });
    expect(interactions).toEqual([]);
  });

  it("releases the claim when expiry persistence fails", async () => {
    const { scheduler, released, interactions } = harness({ failExpire: true });
    await expect(scheduler.runDue()).resolves.toEqual({
      considered: 1,
      claimed: 1,
      expired: 0,
      failed: 1,
    });
    expect(released).toEqual([{ id: 21, taskUid: "task-1" }]);
    expect(interactions).toEqual([]);
  });
});
