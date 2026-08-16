import type { AuthSessionIdentity } from "@touristic/auth";
import {
  CrmLeadDetailServerBoundary,
  type CrmLeadDetailAuditEvent,
  type CrmLeadDetailRepository,
} from "@touristic/crm/lead-detail-boundary";
import type { CrmLead } from "@touristic/crm";
import { describe, expect, it } from "vitest";

import { CrmLeadDetailHttpTransport } from "./lead-detail-http-transport.js";
import type { CrmTransportAuthPort } from "./http-transport.js";

const now = new Date("2026-08-16T04:15:00Z");

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

function record(value: unknown): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected record payload");
  }
  return value as Readonly<Record<string, unknown>>;
}

const lead: CrmLead = {
  id: 7,
  companyName: "Toca do Morcego",
  segment: null,
  contactName: null,
  phone: null,
  whatsapp: null,
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

function transportFixture(role: AuthSessionIdentity["role"] | null) {
  const audits: CrmLeadDetailAuditEvent[] = [];
  const interactions: string[] = [];
  const repository: CrmLeadDetailRepository = {
    findLeadById: async (id) => (id === 7 ? lead : null),
    listChecklist: async () => [
      {
        id: 11,
        leadId: 7,
        step: "first_contact",
        completed: false,
        completedAt: null,
        completedBySubject: null,
        notes: null,
        createdAt: now,
      },
    ],
    findChecklistItemById: async (id) =>
      id === 11
        ? {
            id: 11,
            leadId: 7,
            step: "first_contact",
            completed: false,
            completedAt: null,
            completedBySubject: null,
            notes: null,
            createdAt: now,
          }
        : null,
    setChecklistCompletion: async (input) => ({
      id: input.id,
      leadId: input.leadId,
      step: "first_contact",
      completed: input.completed,
      completedAt: input.completedAt,
      completedBySubject: input.completedBySubject,
      notes: null,
      createdAt: now,
    }),
    listInteractions: async () => [],
    appendInteraction: async (input) => void interactions.push(input.type),
    touchLeadLastContactAt: async () => undefined,
  };
  const boundary = new CrmLeadDetailServerBoundary(
    repository,
    { record: async (event) => void audits.push(event) },
    () => now,
  );
  const auth: CrmTransportAuthPort = {
    resolveSession: async () => (role ? session(role) : null),
    authorizeMutation: async () => ({ allowed: true }),
  };
  return {
    transport: new CrmLeadDetailHttpTransport(boundary, auth),
    audits,
    interactions,
    boundary,
  };
}

describe("CRM M140 lead detail transport", () => {
  it("serves authenticated lead detail and rejects anonymous reads", async () => {
    const authenticated = transportFixture("viewer");
    const allowed = await authenticated.transport.handle({
      method: "GET",
      pathname: "/api/crm/leads/7/detail",
    });
    expect(allowed.status).toBe(200);
    const detail = record(allowed.body.data);
    const detailLead = record(detail.lead);
    expect(detailLead.id).toBe(7);
    expect(Array.isArray(detail.checklist)).toBe(true);
    expect(Array.isArray(detail.interactions)).toBe(true);

    const anonymous = transportFixture(null);
    const denied = await anonymous.transport.handle({
      method: "GET",
      pathname: "/api/crm/leads/7/detail",
    });
    expect(denied.status).toBe(401);
    expect(denied.body.error).toBe("AUTH_REQUIRED");
  });

  it("routes checklist mutations through shared CSRF/origin security first", async () => {
    const { boundary } = transportFixture("manager");
    const denied = new CrmLeadDetailHttpTransport(boundary, {
      resolveSession: async () => session("manager"),
      authorizeMutation: async () => ({
        allowed: false,
        reason: "invalid_csrf",
      }),
    });
    const result = await denied.handle({
      method: "PATCH",
      pathname: "/api/crm/leads/7/checklist/11",
      body: { completed: true },
    });
    expect(result.status).toBe(403);
    expect(result.body.error).toBe("INVALID_CSRF");
  });

  it("keeps viewer checklist and interaction writes fail-closed", async () => {
    const { transport, interactions } = transportFixture("viewer");
    const checklist = await transport.handle({
      method: "PATCH",
      pathname: "/api/crm/leads/7/checklist/11",
      body: { completed: true },
    });
    expect(checklist.status).toBe(403);

    const interaction = await transport.handle({
      method: "POST",
      pathname: "/api/crm/leads/7/interactions",
      body: { type: "note", content: "Nope" },
    });
    expect(interaction.status).toBe(403);
    expect(interactions).toHaveLength(0);
  });

  it("persists valid checklist and manual interaction mutations", async () => {
    const { transport, interactions } = transportFixture("manager");
    const checklist = await transport.handle({
      method: "PATCH",
      pathname: "/api/crm/leads/7/checklist/11",
      body: { completed: true },
    });
    expect(checklist.status).toBe(200);
    expect(record(checklist.body.data).completed).toBe(true);

    const interaction = await transport.handle({
      method: "POST",
      pathname: "/api/crm/leads/7/interactions",
      body: { type: "note", content: "Retornar amanhã" },
    });
    expect(interaction.status).toBe(200);
    expect(interactions).toEqual(["system", "note"]);
  });
});
