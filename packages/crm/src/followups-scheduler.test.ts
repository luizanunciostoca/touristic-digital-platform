import { describe, expect, it } from "vitest";

import type { CrmFollowUp, CrmFollowUpSetting } from "./index.js";
import {
  CrmFollowUpScheduler,
  type CrmFollowUpSchedulerRepository,
} from "./followups-scheduler.js";

const now = new Date("2026-08-12T21:30:00.000Z");

function setting(
  overrides: Partial<CrmFollowUpSetting> = {},
): CrmFollowUpSetting {
  return {
    id: 3,
    name: "Follow-up comercial",
    intervalDays: 3,
    maxAttempts: 4,
    messageTemplate: "Olá, podemos continuar nossa conversa?",
    isActive: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function followUp(overrides: Partial<CrmFollowUp> = {}): CrmFollowUp {
  return {
    id: 11,
    leadId: 7,
    settingId: 3,
    attemptNumber: 1,
    status: "pending",
    generatedMessage: null,
    scheduledAt: new Date("2026-08-12T21:00:00.000Z"),
    sentAt: null,
    respondedAt: null,
    scheduleCronTaskUid: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function harness(
  options: {
    readonly followUps?: readonly CrmFollowUp[];
    readonly settings?: readonly CrmFollowUpSetting[];
    readonly claimAllowed?: boolean;
    readonly delivered?: boolean;
    readonly deliveryThrows?: boolean;
  } = {},
) {
  const calls: string[] = [];
  const repository: CrmFollowUpSchedulerRepository = {
    listPending: async () => options.followUps ?? [followUp()],
    listSettings: async () => options.settings ?? [setting()],
    claimPending: async () => options.claimAllowed !== false,
    releaseClaim: async () => {
      calls.push("release");
    },
    markSentClaimed: async (_id, taskUid, sentAt) => {
      calls.push(`sent:${taskUid}`);
      return followUp({ status: "sent", sentAt, scheduleCronTaskUid: taskUid });
    },
    markSkippedClaimed: async (_id, taskUid) => {
      calls.push(`skipped:${taskUid}`);
      return followUp({ status: "skipped", scheduleCronTaskUid: taskUid });
    },
    updateLeadLastContact: async () => {
      calls.push("last-contact");
    },
    appendInteraction: async () => {
      calls.push("interaction");
    },
  };
  const scheduler = new CrmFollowUpScheduler(
    repository,
    {
      send: async () => {
        calls.push("deliver");
        if (options.deliveryThrows) throw new Error("delivery_failed");
        return { delivered: options.delivered !== false };
      },
    },
    () => "task-1",
    () => now,
  );
  return { scheduler, calls };
}

describe("CRM M87 follow-ups scheduler", () => {
  it("claims, delivers and persists a due automated follow-up", async () => {
    const { scheduler, calls } = harness();
    await expect(scheduler.runDue()).resolves.toEqual({
      considered: 1,
      claimed: 1,
      sent: 1,
      skipped: 0,
      failed: 0,
    });
    expect(calls).toEqual([
      "deliver",
      "sent:task-1",
      "interaction",
      "last-contact",
    ]);
  });

  it("does not deliver when another worker already claimed the row", async () => {
    const { scheduler, calls } = harness({ claimAllowed: false });
    const result = await scheduler.runDue();
    expect(result).toMatchObject({ claimed: 0, sent: 0, failed: 0 });
    expect(calls).toEqual([]);
  });

  it.each([
    [setting({ isActive: false }), "inactive"],
    [setting({ messageTemplate: null }), "missing template"],
    [setting({ maxAttempts: 1 }), "attempt limit"],
  ] as const)("skips unsafe automation: %s", async (configured) => {
    const source =
      configured.maxAttempts === 1
        ? followUp({ attemptNumber: 2 })
        : followUp();
    const { scheduler, calls } = harness({
      followUps: [source],
      settings: [configured],
    });
    const result = await scheduler.runDue();
    expect(result).toMatchObject({ claimed: 1, skipped: 1, sent: 0 });
    expect(calls).toEqual(["skipped:task-1"]);
  });

  it("keeps manual follow-ups outside automatic delivery", async () => {
    const { scheduler, calls } = harness({
      followUps: [followUp({ settingId: null })],
    });
    const result = await scheduler.runDue();
    expect(result).toMatchObject({ considered: 1, claimed: 0, sent: 0 });
    expect(calls).toEqual([]);
  });

  it.each([false, "throw"] as const)(
    "releases the claim after delivery failure %s",
    async (mode) => {
      const { scheduler, calls } = harness({
        delivered: mode === false ? false : true,
        deliveryThrows: mode === "throw",
      });
      const result = await scheduler.runDue();
      expect(result).toMatchObject({ claimed: 1, sent: 0, failed: 1 });
      expect(calls).toEqual(["deliver", "release"]);
    },
  );
});
