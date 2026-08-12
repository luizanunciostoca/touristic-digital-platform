import { describe, expect, it } from "vitest";
import type { AuthSessionIdentity } from "@touristic/auth";

import type { CrmLead } from "./index.js";
import {
  CrmLeadServerBoundary,
  type CrmLeadAuditEvent,
  type CrmLeadBoundaryRepository,
} from "./leads-boundary.js";

const now = new Date("2026-08-11T23:00:00Z");

function session(role: AuthSessionIdentity["role"]): AuthSessionIdentity {
  return {
    subject: `user-${role}`,
    email: `${role}@example.com`,
    role,
    businessIds: role === "admin" ? [] : ["crm-placeholder"],
    issuedAt: Math.floor(now.getTime() / 1000) - 60,
    expiresAt: Math.floor(now.getTime() / 1000) + 3600,
    sessionId: `session-${role}`,
  };
}

function lead(id = 7, stage: CrmLead["stage"] = "new_lead"): CrmLead {
  return {
    id,
    companyName: "Toca do Morcego",
    segment: "Restaurante / Bar",
    contactName: "Luiz",
    phone: null,
    whatsapp: null,
    email: null,
    address: null,
    website: null,
    notes: null,
    stage,
    status: "active",
    source: null,
    referredById: null,
    assignedToId: null,
    monthlyValue: null,
    createdAt: now,
    updatedAt: now,
    lastContactAt: null,
    convertedAt: null,
  };
}

function fixture() {
  const audits: CrmLeadAuditEvent[] = [];
  const interactions: Array<{ leadId: number; type: string }> = [];
  const checklist: number[] = [];
  let current = lead();

  const repository: CrmLeadBoundaryRepository = {
    list: async () => [current],
    findById: async (id) => (id === current.id ? current : null),
    create: async (record) => {
      current = {
        ...current,
        id: 42,
        companyName: record.companyName,
        stage: record.stage,
        status: record.status,
      };
      return current;
    },
    update: async (_id, patch) => {
      current = { ...current, ...patch, updatedAt: now };
      return current;
    },
    updateStage: async (_id, stage, lastContactAt) => {
      current = { ...current, stage, lastContactAt, updatedAt: now };
      return current;
    },
    delete: async () => undefined,
    initializeChecklist: async (leadId) => {
      checklist.push(leadId);
    },
    appendInteraction: async (input) => {
      interactions.push({ leadId: input.leadId, type: input.type });
    },
  };

  return {
    boundary: new CrmLeadServerBoundary(
      repository,
      { record: async (event) => void audits.push(event) },
      () => now,
    ),
    audits,
    checklist,
    interactions,
  };
}

describe("CRM M70 leads boundary", () => {
  it("fails closed and audits unauthenticated reads", async () => {
    const { boundary, audits } = fixture();
    await expect(boundary.list(null)).resolves.toEqual({
      ok: false,
      reason: "authentication_required",
    });
    expect(audits).toEqual([
      expect.objectContaining({
        operation: "lead.list",
        allowed: false,
        reason: "authentication_required",
      }),
    ]);
  });

  it("allows authenticated bounded list queries and rejects invalid filters", async () => {
    const { boundary, audits } = fixture();
    const allowed = await boundary.list(session("viewer"), {
      stage: "new_lead",
      status: "active",
      search: "Toca",
      limit: 50,
      offset: 0,
    });
    expect(allowed.ok).toBe(true);

    await expect(
      boundary.list(session("viewer"), { limit: 5000 }),
    ).resolves.toEqual({
      ok: false,
      reason: "invalid_input",
    });
    expect(audits.at(-1)).toEqual(
      expect.objectContaining({ reason: "invalid_input" }),
    );
  });

  it("blocks viewer mutations before repository writes", async () => {
    const { boundary, audits, checklist } = fixture();
    await expect(
      boundary.create(session("viewer"), { companyName: "Blocked" }),
    ).resolves.toEqual({
      ok: false,
      reason: "read_only_role",
    });
    expect(checklist).toHaveLength(0);
    expect(audits.at(-1)).toEqual(
      expect.objectContaining({
        operation: "lead.create",
        reason: "read_only_role",
      }),
    );
  });

  it("creates the lead before checklist and interaction so no leadId 0 write can occur", async () => {
    const { boundary, checklist, interactions } = fixture();
    const result = await boundary.create(session("manager"), {
      companyName: "Nova Empresa",
      email: "owner@example.com",
      monthlyValue: "499.90",
    });
    expect(result).toEqual(expect.objectContaining({ ok: true }));
    expect(checklist).toEqual([42]);
    expect(interactions).toEqual([{ leadId: 42, type: "system" }]);
  });

  it("validates and audits stage changes while preserving the V1 interaction trail", async () => {
    const { boundary, interactions, audits } = fixture();
    const updated = await boundary.updateStage(session("admin"), {
      id: 7,
      stage: "proposal_sent",
    });
    expect(updated).toEqual(expect.objectContaining({ ok: true }));
    expect(interactions).toEqual([{ leadId: 7, type: "stage_change" }]);

    await expect(
      boundary.updateStage(session("admin"), {
        id: 7,
        stage: "invented_stage",
      }),
    ).resolves.toEqual({ ok: false, reason: "invalid_input" });
    expect(audits.at(-1)).toEqual(
      expect.objectContaining({
        operation: "lead.update_stage",
        reason: "invalid_input",
      }),
    );
  });
});
