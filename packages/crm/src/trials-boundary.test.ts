import { describe, expect, it } from "vitest";

import type { AuthRole, AuthSessionIdentity } from "@touristic/auth";

import type { CrmTrial } from "./index.js";
import {
  CrmTrialServerBoundary,
  type CrmTrialAuditEvent,
  type CrmTrialBoundaryRepository,
} from "./trials-boundary.js";

const now = new Date("2026-08-12T22:30:00.000Z");

function session(role: AuthRole = "owner"): AuthSessionIdentity {
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

function trial(overrides: Partial<CrmTrial> = {}): CrmTrial {
  return {
    id: 11,
    leadId: 7,
    startDate: new Date("2026-08-01T00:00:00.000Z"),
    endDate: new Date("2026-08-31T00:00:00.000Z"),
    durationDays: 30,
    status: "active",
    convertedAt: null,
    notifiedAt: null,
    scheduleCronTaskUid: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function harness(options: { readonly initial?: CrmTrial; readonly leadExists?: boolean } = {}) {
  let current = options.initial ?? trial();
  const calls: string[] = [];
  const auditEvents: CrmTrialAuditEvent[] = [];
  const repository: CrmTrialBoundaryRepository = {
    list: async (leadId) =>
      leadId === undefined || leadId === current.leadId ? [current] : [],
    findById: async (id) => (id === current.id ? current : null),
    leadExists: async () => options.leadExists !== false,
    create: async (record) => {
      calls.push("create");
      current = trial({ ...record, id: 12 });
      return current;
    },
    markConverted: async (_id, convertedAt) => {
      calls.push("converted");
      current = trial({ ...current, status: "converted", convertedAt });
      return current;
    },
    markCancelled: async () => {
      calls.push("cancelled");
      current = trial({ ...current, status: "cancelled" });
      return current;
    },
    markExpired: async () => {
      calls.push("expired");
      current = trial({ ...current, status: "expired" });
      return current;
    },
    updateLeadStage: async ({ stage }) => {
      calls.push(`lead:${stage}`);
    },
    appendInteraction: async () => {
      calls.push("interaction");
    },
  };
  const boundary = new CrmTrialServerBoundary(
    repository,
    { record: async (event) => void auditEvents.push(event) },
    () => now,
  );
  return { boundary, calls, auditEvents };
}

describe("CRM M89 trials boundary", () => {
  it("requires authentication for reads", async () => {
    const { boundary, auditEvents } = harness();
    await expect(boundary.list(null)).resolves.toEqual({
      ok: false,
      reason: "auth_required",
    });
    expect(auditEvents).toEqual([
      expect.objectContaining({ operation: "trial.list", allowed: false }),
    ]);
  });

  it("allows viewer reads but denies viewer mutations", async () => {
    const { boundary, auditEvents } = harness();
    await expect(boundary.list(session("viewer"), 7)).resolves.toMatchObject({
      ok: true,
    });
    await expect(
      boundary.create(session("viewer"), { leadId: 7 }),
    ).resolves.toEqual({ ok: false, reason: "read_only_role" });
    expect(auditEvents.at(-1)).toMatchObject({
      operation: "trial.create",
      reason: "read_only_role",
    });
  });

  it("creates the V1-compatible 30-day default trial and advances the lead", async () => {
    const { boundary, calls } = harness();
    const result = await boundary.create(session(), { leadId: 7 });
    expect(result).toMatchObject({
      ok: true,
      value: { leadId: 7, durationDays: 30, status: "active" },
    });
    if (result.ok) {
      expect(result.value.startDate).toEqual(now);
      expect(result.value.endDate).toEqual(
        new Date("2026-09-11T22:30:00.000Z"),
      );
    }
    expect(calls).toEqual(["create", "lead:trial", "interaction"]);
  });

  it("validates lead, duration and start date deterministically", async () => {
    const missingLead = harness({ leadExists: false });
    await expect(
      missingLead.boundary.create(session(), { leadId: 7 }),
    ).resolves.toEqual({ ok: false, reason: "not_found" });

    const invalid = harness();
    await expect(
      invalid.boundary.create(session(), { leadId: 7, durationDays: 0 }),
    ).resolves.toEqual({ ok: false, reason: "invalid_input" });
    await expect(
      invalid.boundary.create(session(), { leadId: 7, startDate: "invalid" }),
    ).resolves.toEqual({ ok: false, reason: "invalid_input" });
  });

  it("converts an active trial and promotes the lead to active_client", async () => {
    const { boundary, calls } = harness();
    const result = await boundary.convert(session("manager"), { id: 11 });
    expect(result).toMatchObject({
      ok: true,
      value: { status: "converted", convertedAt: now },
    });
    expect(calls).toEqual([
      "converted",
      "lead:active_client",
      "interaction",
    ]);
  });

  it.each([
    ["cancel", "cancelled"],
    ["expire", "expired"],
  ] as const)("supports manual active -> %s lifecycle", async (command, status) => {
    const { boundary, calls } = harness();
    const result = await boundary[command](session("manager"), { id: 11 });
    expect(result).toMatchObject({ ok: true, value: { status } });
    expect(calls).toEqual([status, "interaction"]);
  });

  it.each(["converted", "cancelled", "expired"] as const)(
    "rejects mutations after terminal trial status %s",
    async (status) => {
      const { boundary, calls, auditEvents } = harness({
        initial: trial({ status }),
      });
      await expect(boundary.cancel(session(), { id: 11 })).resolves.toEqual({
        ok: false,
        reason: "invalid_transition",
      });
      expect(calls).toEqual([]);
      expect(auditEvents.at(-1)).toMatchObject({
        operation: "trial.cancel",
        reason: "invalid_transition",
        trialId: 11,
        leadId: 7,
      });
    },
  );

  it("rejects invalid and missing trial identifiers", async () => {
    const { boundary } = harness();
    await expect(boundary.convert(session(), { id: "x" })).resolves.toEqual({
      ok: false,
      reason: "invalid_input",
    });
    await expect(boundary.convert(session(), { id: 99 })).resolves.toEqual({
      ok: false,
      reason: "not_found",
    });
  });
});
