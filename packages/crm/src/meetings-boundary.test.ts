import { describe, expect, it } from "vitest";

import type { AuthRole, AuthSessionIdentity } from "@touristic/auth";
import type { CrmMeeting } from "./index.js";
import {
  CrmMeetingServerBoundary,
  type CrmMeetingAuditEvent,
  type CrmMeetingBoundaryRepository,
  type CrmMeetingCreateRecord,
  type CrmMeetingUpdateRecord,
} from "./meetings-boundary.js";

const now = new Date("2026-08-12T02:00:00.000Z");

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

function meeting(overrides: Partial<CrmMeeting> = {}): CrmMeeting {
  return {
    id: 11,
    leadId: 7,
    title: "Reunião comercial",
    scheduledAt: new Date("2026-08-20T18:00:00.000Z"),
    modality: "online",
    meetingLink: "https://meet.example/abc",
    location: null,
    status: "scheduled",
    notes: null,
    createdById: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function harness() {
  const audits: CrmMeetingAuditEvent[] = [];
  const interactions: Array<{
    leadId: number;
    content: string;
    actorSubject: string;
    metadata?: Readonly<Record<string, string>>;
  }> = [];
  let current = meeting();
  const repository: CrmMeetingBoundaryRepository = {
    list: async (leadId) =>
      leadId === undefined || leadId === current.leadId ? [current] : [],
    findById: async (id) => (id === current.id ? current : null),
    leadExists: async (leadId) => leadId === 7,
    create: async (record: CrmMeetingCreateRecord) => {
      current = meeting({
        leadId: record.leadId,
        title: record.title,
        scheduledAt: record.scheduledAt,
        modality: record.modality,
        meetingLink: record.meetingLink,
        location: record.location,
        status: record.status,
        notes: record.notes,
      });
      return current;
    },
    update: async (_id, patch: CrmMeetingUpdateRecord) => {
      current = meeting({ ...current, ...patch, updatedAt: now });
      return current;
    },
    appendInteraction: async (input) => {
      interactions.push(input);
    },
  };
  const boundary = new CrmMeetingServerBoundary(
    repository,
    { record: async (event) => audits.push(event) },
    () => now,
  );
  return { boundary, audits, interactions };
}

describe("CRM M74 meetings boundary", () => {
  it("lists meetings for an authenticated CRM reader", async () => {
    const { boundary } = harness();
    const result = await boundary.list(session("viewer"), 7);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(1);
  });

  it("creates a scheduled meeting and appends the frozen meeting interaction", async () => {
    const { boundary, interactions } = harness();
    const result = await boundary.create(session("owner"), {
      leadId: 7,
      title: "Diagnóstico comercial",
      scheduledAt: "2026-08-25T17:30:00.000Z",
      modality: "in_person",
      location: "Morro de São Paulo",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("scheduled");
      expect(result.value.modality).toBe("in_person");
    }
    expect(interactions).toHaveLength(1);
    expect(interactions[0]?.content).toContain("Diagnóstico comercial");
    expect(interactions[0]?.actorSubject).toBe("crm-owner");
  });

  it.each(["done", "cancelled", "no_show"] as const)(
    "preserves the frozen %s lifecycle transition",
    async (status) => {
      const { boundary } = harness();
      const result = await boundary.update(session("manager"), {
        id: 11,
        status,
      });
      expect(result).toMatchObject({ ok: true, value: { status } });
    },
  );

  it("rejects invalid dates and missing leads with audited failures", async () => {
    const { boundary, audits } = harness();
    expect(
      await boundary.create(session("admin"), {
        leadId: 7,
        title: "Inválida",
        scheduledAt: "not-a-date",
        modality: "online",
      }),
    ).toEqual({ ok: false, reason: "invalid_input" });
    expect(
      await boundary.create(session("admin"), {
        leadId: 999,
        title: "Lead ausente",
        scheduledAt: "2026-08-25T17:30:00.000Z",
        modality: "online",
      }),
    ).toEqual({ ok: false, reason: "not_found" });
    expect(audits.map((event) => event.reason)).toEqual([
      "invalid_input",
      "not_found",
    ]);
  });

  it("fails closed for unauthenticated reads and viewer mutations", async () => {
    const { boundary, audits } = harness();
    expect(await boundary.list(null)).toEqual({
      ok: false,
      reason: "authentication_required",
    });
    expect(
      await boundary.update(session("viewer"), { id: 11, status: "done" }),
    ).toEqual({ ok: false, reason: "read_only_role" });
    expect(audits.map((event) => event.reason)).toEqual([
      "authentication_required",
      "read_only_role",
    ]);
  });
});
