import { describe, expect, it } from "vitest";

import type { AuthRole, AuthSessionIdentity } from "@touristic/auth";
import type { CrmFollowUp, CrmFollowUpSetting } from "./index.js";
import {
  CrmFollowUpServerBoundary,
  type CrmFollowUpAuditEvent,
  type CrmFollowUpBoundaryRepository,
  type CrmFollowUpCreateRecord,
  type CrmFollowUpSettingRecord,
} from "./followups-boundary.js";

const now = new Date("2026-08-12T20:30:00.000Z");

function session(role: AuthRole): AuthSessionIdentity {
  return {
    subject: `crm-${role}`,
    email: `${role}@example.com`,
    role,
    businessIds: [],
    issuedAt: 1_000,
    expiresAt: 9_999_999_999,
    sessionId: `session-${role}`,
  };
}

function setting(
  overrides: Partial<CrmFollowUpSetting> = {},
): CrmFollowUpSetting {
  return {
    id: 3,
    name: "Follow-up comercial",
    intervalDays: 3,
    maxAttempts: 4,
    messageTemplate: null,
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
    scheduledAt: new Date("2026-08-15T15:00:00.000Z"),
    sentAt: null,
    respondedAt: null,
    scheduleCronTaskUid: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function harness(initial: CrmFollowUp = followUp()) {
  const audits: CrmFollowUpAuditEvent[] = [];
  const interactions: Array<{
    leadId: number;
    content: string;
    actorSubject: string;
  }> = [];
  const contacts: Array<{ leadId: number; at: Date }> = [];
  let current = initial;
  let currentSetting = setting();

  const repository: CrmFollowUpBoundaryRepository = {
    listSettings: async () => [currentSetting],
    upsertSetting: async (record: CrmFollowUpSettingRecord) => {
      currentSetting = setting({
        id: record.id ?? 3,
        name: record.name,
        intervalDays: record.intervalDays,
        maxAttempts: record.maxAttempts,
        messageTemplate: record.messageTemplate,
        isActive: record.isActive,
      });
      return currentSetting;
    },
    list: async (leadId) =>
      leadId === undefined || leadId === current.leadId ? [current] : [],
    listPending: async () => (current.status === "pending" ? [current] : []),
    findById: async (id) => (id === current.id ? current : null),
    leadExists: async (leadId) => leadId === 7,
    settingExists: async (settingId) => settingId === 3,
    create: async (record: CrmFollowUpCreateRecord) => {
      current = followUp({
        leadId: record.leadId,
        settingId: record.settingId,
        scheduledAt: record.scheduledAt,
        attemptNumber: record.attemptNumber,
        status: record.status,
      });
      return current;
    },
    markSent: async (_id, sentAt) => {
      current = followUp({ ...current, status: "sent", sentAt });
      return current;
    },
    markResponded: async (_id, respondedAt) => {
      current = followUp({ ...current, status: "responded", respondedAt });
      return current;
    },
    updateLeadLastContact: async (leadId, at) => {
      contacts.push({ leadId, at });
    },
    appendInteraction: async (input) => {
      interactions.push(input);
    },
  };

  const boundary = new CrmFollowUpServerBoundary(
    repository,
    {
      record: async (event) => {
        audits.push(event);
      },
    },
    () => now,
  );

  return { boundary, audits, interactions, contacts };
}

describe("CRM M84 follow-ups boundary", () => {
  it("allows authenticated readers to list settings, follow-ups and pending work", async () => {
    const { boundary } = harness();
    const reader = session("viewer");
    expect((await boundary.listSettings(reader)).ok).toBe(true);
    expect((await boundary.list(reader, 7)).ok).toBe(true);
    const pending = await boundary.pending(reader);
    expect(pending.ok).toBe(true);
    if (pending.ok) expect(pending.value).toHaveLength(1);
  });

  it("saves bounded deterministic automation settings", async () => {
    const { boundary } = harness();
    const result = await boundary.saveSetting(session("owner"), {
      name: "  Follow-up   comercial  ",
      intervalDays: 3,
      maxAttempts: 4,
      messageTemplate: "Olá, tudo bem?",
      isActive: true,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe("Follow-up comercial");
      expect(result.value.intervalDays).toBe(3);
      expect(result.value.maxAttempts).toBe(4);
    }
  });

  it("creates a pending follow-up only for existing lead/setting relations", async () => {
    const { boundary } = harness();
    const result = await boundary.create(session("manager"), {
      leadId: 7,
      settingId: 3,
      scheduledAt: "2026-08-15T15:00:00.000Z",
      attemptNumber: 2,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("pending");
      expect(result.value.attemptNumber).toBe(2);
    }

    expect(
      await boundary.create(session("owner"), {
        leadId: 999,
        scheduledAt: "2026-08-15T15:00:00.000Z",
      }),
    ).toEqual({ ok: false, reason: "not_found" });
  });

  it("marks pending work sent, records the interaction and updates last contact", async () => {
    const { boundary, interactions, contacts } = harness();
    const result = await boundary.markSent(session("owner"), { id: 11 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.status).toBe("sent");
    expect(interactions[0]?.content).toBe("Follow-up enviado via WhatsApp");
    expect(contacts).toEqual([{ leadId: 7, at: now }]);
  });

  it("marks only sent follow-ups responded and records the response interaction", async () => {
    const { boundary, interactions } = harness(
      followUp({ status: "sent", sentAt: now }),
    );
    const result = await boundary.markResponded(session("owner"), { id: 11 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.status).toBe("responded");
    expect(interactions[0]?.content).toBe("Lead respondeu ao follow-up");

    expect(
      await harness().boundary.markResponded(session("owner"), { id: 11 }),
    ).toEqual({ ok: false, reason: "invalid_transition" });
  });

  it("denies mutations for viewers and audits the denial", async () => {
    const { boundary, audits } = harness();
    expect(
      await boundary.create(session("viewer"), {
        leadId: 7,
        scheduledAt: "2026-08-15T15:00:00.000Z",
      }),
    ).toEqual({ ok: false, reason: "read_only_role" });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      operation: "follow_up.create",
      allowed: false,
      reason: "read_only_role",
      actorSubject: "crm-viewer",
    });
  });

  it("fails closed for malformed setting and follow-up inputs", async () => {
    const { boundary } = harness();
    expect(
      await boundary.saveSetting(session("owner"), {
        name: "",
        intervalDays: 0,
        maxAttempts: 4,
      }),
    ).toEqual({ ok: false, reason: "invalid_input" });
    expect(await boundary.list(session("viewer"), "7")).toEqual({
      ok: false,
      reason: "invalid_input",
    });
    expect(await boundary.markSent(session("owner"), { id: -1 })).toEqual({
      ok: false,
      reason: "invalid_input",
    });
  });
});
