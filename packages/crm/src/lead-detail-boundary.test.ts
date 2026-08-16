import type { AuthSessionIdentity } from "@touristic/auth";
import { describe, expect, it } from "vitest";

import type { CrmLead } from "./index.js";
import {
  CrmLeadDetailServerBoundary,
  type CrmLeadDetailAuditEvent,
  type CrmLeadDetailChecklistRecord,
  type CrmLeadDetailInteractionRecord,
  type CrmLeadDetailRepository,
} from "./lead-detail-boundary.js";

const now = new Date("2026-08-16T04:10:00Z");

function session(role: AuthSessionIdentity["role"]): AuthSessionIdentity {
  return {
    subject: `crm-${role}`,
    email: `${role}@example.com`,
    role,
    businessIds: [],
    issuedAt: Math.floor(now.getTime() / 1000) - 60,
    expiresAt: Math.floor(now.getTime() / 1000) + 3600,
    sessionId: `session-${role}`,
  };
}

function lead(id = 7): CrmLead {
  return {
    id,
    companyName: "Toca do Morcego",
    segment: "Restaurante / Bar",
    contactName: "Luiz",
    phone: null,
    whatsapp: "5575999999999",
    email: null,
    address: null,
    website: null,
    notes: null,
    stage: "new_lead",
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
  const audits: CrmLeadDetailAuditEvent[] = [];
  const interactionWrites: Array<{ type: string; content: string }> = [];
  const touches: Date[] = [];
  const checklistUpdates: boolean[] = [];
  let checklist: CrmLeadDetailChecklistRecord = {
    id: 11,
    leadId: 7,
    step: "first_contact",
    completed: false,
    completedAt: null,
    completedBySubject: null,
    notes: null,
    createdAt: now,
  };
  const interactions: CrmLeadDetailInteractionRecord[] = [
    {
      id: 21,
      leadId: 7,
      type: "system",
      content: "Lead cadastrado no sistema",
      metadata: null,
      actorSubject: "crm-admin",
      createdAt: now,
    },
  ];
  const repository: CrmLeadDetailRepository = {
    findLeadById: async (id) => (id === 7 ? lead() : null),
    listChecklist: async () => [checklist],
    findChecklistItemById: async (id) =>
      id === checklist.id ? checklist : null,
    setChecklistCompletion: async (input) => {
      if (input.id !== checklist.id || input.leadId !== checklist.leadId) {
        return null;
      }
      checklist = {
        ...checklist,
        completed: input.completed,
        completedAt: input.completedAt,
        completedBySubject: input.completedBySubject,
      };
      checklistUpdates.push(input.completed);
      return checklist;
    },
    listInteractions: async () => interactions,
    appendInteraction: async (input) => {
      interactionWrites.push({ type: input.type, content: input.content });
    },
    touchLeadLastContactAt: async (_leadId, value) => {
      touches.push(value);
    },
  };
  return {
    boundary: new CrmLeadDetailServerBoundary(
      repository,
      { record: async (event) => void audits.push(event) },
      () => now,
    ),
    audits,
    checklistUpdates,
    interactionWrites,
    touches,
  };
}

describe("CRM M140 lead detail boundary", () => {
  it("fails closed and audits unauthenticated detail reads", async () => {
    const { boundary, audits } = fixture();
    await expect(boundary.get(null, 7)).resolves.toEqual({
      ok: false,
      reason: "authentication_required",
    });
    expect(audits).toEqual([
      expect.objectContaining({
        operation: "lead.detail",
        allowed: false,
        reason: "authentication_required",
        leadId: 7,
      }),
    ]);
  });

  it("projects all 16 frozen checklist steps even when persistence is sparse", async () => {
    const { boundary } = fixture();
    const result = await boundary.get(session("viewer"), "7");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.lead.companyName).toBe("Toca do Morcego");
    expect(result.value.checklist).toHaveLength(16);
    expect(result.value.checklist[0]).toEqual(
      expect.objectContaining({
        id: 11,
        step: "first_contact",
        completed: false,
      }),
    );
    expect(result.value.checklist[1]).toEqual(
      expect.objectContaining({
        id: null,
        step: "meeting_scheduled",
        completed: false,
      }),
    );
    expect(result.value.interactions[0]?.type).toBe("system");
  });

  it("blocks viewer checklist mutations before repository writes", async () => {
    const { boundary, checklistUpdates, audits } = fixture();
    await expect(
      boundary.toggleChecklist(session("viewer"), {
        leadId: 7,
        id: 11,
        completed: true,
      }),
    ).resolves.toEqual({ ok: false, reason: "read_only_role" });
    expect(checklistUpdates).toHaveLength(0);
    expect(audits.at(-1)).toEqual(
      expect.objectContaining({
        operation: "lead.checklist_toggle",
        reason: "read_only_role",
      }),
    );
  });

  it("binds checklist item ids to the requested lead before changing state", async () => {
    const { boundary, checklistUpdates, interactionWrites } = fixture();
    await expect(
      boundary.toggleChecklist(session("manager"), {
        leadId: 8,
        id: 11,
        completed: true,
      }),
    ).resolves.toEqual({ ok: false, reason: "not_found" });
    expect(checklistUpdates).toHaveLength(0);
    expect(interactionWrites).toHaveLength(0);
  });

  it("preserves V1 checklist completion and system interaction semantics", async () => {
    const { boundary, checklistUpdates, interactionWrites } = fixture();
    const result = await boundary.toggleChecklist(session("manager"), {
      leadId: 7,
      id: 11,
      completed: true,
    });
    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        value: expect.objectContaining({
          completed: true,
          completedAt: now,
          completedBySubject: "crm-manager",
        }),
      }),
    );
    expect(checklistUpdates).toEqual([true]);
    expect(interactionWrites).toEqual([
      { type: "system", content: "Checklist: etapa concluída" },
    ]);
  });

  it("rejects system-authored manual types and touches last contact for valid activity", async () => {
    const { boundary, interactionWrites, touches } = fixture();
    await expect(
      boundary.addInteraction(session("admin"), {
        leadId: 7,
        type: "system",
        content: "not allowed",
      }),
    ).resolves.toEqual({ ok: false, reason: "invalid_input" });
    expect(interactionWrites).toHaveLength(0);

    await expect(
      boundary.addInteraction(session("admin"), {
        leadId: 7,
        type: "note",
        content: "  Cliente pediu retorno amanhã.  ",
      }),
    ).resolves.toEqual({ ok: true, value: true });
    expect(interactionWrites).toEqual([
      { type: "note", content: "Cliente pediu retorno amanhã." },
    ]);
    expect(touches).toEqual([now]);
  });
});
