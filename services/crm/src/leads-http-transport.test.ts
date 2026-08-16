import type { AuthSessionIdentity } from "@touristic/auth";
import type { CrmLead } from "@touristic/crm";
import {
  CrmLeadServerBoundary,
  type CrmLeadAuditEvent,
  type CrmLeadBoundaryRepository,
} from "@touristic/crm/leads-boundary";
import { describe, expect, it } from "vitest";

import {
  CrmLeadHttpTransport,
  type CrmTransportAuthPort,
} from "./leads-http-transport.js";
import { MySqlCrmLeadAuditPort } from "./mysql-audit-port.js";
import { crmM71SchemaSql } from "./schema.js";

const now = new Date("2026-08-12T01:00:00Z");

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
}

function transportFixture(role: AuthSessionIdentity["role"] | null) {
  let current = lead();
  const audits: CrmLeadAuditEvent[] = [];
  const repository: CrmLeadBoundaryRepository = {
    list: async () => [current],
    findById: async (id) => (id === current.id ? current : null),
    create: async (record) => {
      current = { ...current, id: 42, companyName: record.companyName };
      return current;
    },
    update: async (_id, patch) => {
      current = { ...current, ...patch };
      return current;
    },
    updateStage: async (_id, stage, lastContactAt) => {
      current = { ...current, stage, lastContactAt };
      return current;
    },
    delete: async () => undefined,
    initializeChecklist: async () => undefined,
    appendInteraction: async () => undefined,
  };
  const boundary = new CrmLeadServerBoundary(
    repository,
    { record: async (event) => void audits.push(event) },
    () => now,
  );
  const auth: CrmTransportAuthPort = {
    resolveSession: async () => (role ? session(role) : null),
    authorizeMutation: async () => ({ allowed: true }),
  };
  return {
    boundary,
    transport: new CrmLeadHttpTransport(boundary, auth),
    audits,
  };
}

describe("CRM M72 authenticated lead transport", () => {
  it("maps unauthenticated reads through the CRM boundary and durable audit contract", async () => {
    const { transport, audits } = transportFixture(null);
    const result = await transport.handle({
      method: "GET",
      pathname: "/api/crm/leads",
    });
    expect(result.status).toBe(401);
    expect(result.body.error).toBe("AUTH_REQUIRED");
    expect(audits).toHaveLength(1);
    expect(audits[0]?.operation).toBe("lead.list");
    expect(audits[0]?.reason).toBe("authentication_required");
  });

  it("allows authenticated reads and delegates validation to the server boundary", async () => {
    const { transport } = transportFixture("viewer");
    const allowed = await transport.handle({
      method: "GET",
      pathname: "/api/crm/leads",
      query: { limit: 25, offset: 0 },
    });
    expect(allowed.status).toBe(200);

    const invalid = await transport.handle({
      method: "GET",
      pathname: "/api/crm/leads",
      query: { limit: 5000 },
    });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error).toBe("INVALID_INPUT");
  });

  it("normalizes decimal route ids before GET PATCH and stage boundaries", async () => {
    const { transport } = transportFixture("manager");

    const read = await transport.handle({
      method: "GET",
      pathname: "/api/crm/leads/7",
    });
    expect(read.status).toBe(200);
    expect((read.body.data as CrmLead).id).toBe(7);

    const updated = await transport.handle({
      method: "PATCH",
      pathname: "/api/crm/leads/7",
      body: { contactName: "Luiz M140" },
    });
    expect(updated.status).toBe(200);
    expect((updated.body.data as CrmLead).contactName).toBe("Luiz M140");

    const staged = await transport.handle({
      method: "POST",
      pathname: "/api/crm/leads/7/stage",
      body: { stage: "first_contact" },
    });
    expect(staged.status).toBe(200);
    expect((staged.body.data as CrmLead).stage).toBe("first_contact");
  });

  it("fails viewer mutations closed after platform mutation security succeeds", async () => {
    const { transport, audits } = transportFixture("viewer");
    const result = await transport.handle({
      method: "POST",
      pathname: "/api/crm/leads",
      body: { companyName: "Blocked" },
    });
    expect(result.status).toBe(403);
    expect(audits.at(-1)?.operation).toBe("lead.create");
    expect(audits.at(-1)?.reason).toBe("read_only_role");
  });

  it("rejects mutation security before CRM writes without reimplementing CSRF rules", async () => {
    const { boundary } = transportFixture("manager");
    const denied = new CrmLeadHttpTransport(boundary, {
      resolveSession: async () => session("manager"),
      authorizeMutation: async () => ({
        allowed: false,
        reason: "invalid_csrf",
      }),
    });
    const result = await denied.handle({
      method: "POST",
      pathname: "/api/crm/leads",
      body: { companyName: "Nope" },
    });
    expect(result.status).toBe(403);
    expect(result.body.error).toBe("INVALID_CSRF");
  });

  it("persists boundary audit events with prepared placeholders", async () => {
    const calls: Array<{ sql: string; values: unknown[] | undefined }> = [];
    const pool = {
      execute: async (sql: string, values?: unknown[]) => {
        calls.push({ sql, values });
        return [[], []];
      },
    };
    const audit = new MySqlCrmLeadAuditPort(pool as never);
    await audit.record({
      operation: "lead.delete",
      allowed: false,
      reason: "read_only_role",
      actorSubject: "crm-viewer",
      leadId: 7,
    });
    expect(calls[0]?.sql).toContain("VALUES (?, ?, ?, ?, ?)");
    expect(calls[0]?.sql).not.toContain("crm-viewer");
    expect(calls[0]?.values).toEqual([
      "lead.delete",
      false,
      "read_only_role",
      "crm-viewer",
      7,
    ]);
  });

  it("freezes the durable audit table in the server schema", () => {
    expect(crmM71SchemaSql).toContain(
      "CREATE TABLE IF NOT EXISTS crm_audit_events",
    );
    expect(crmM71SchemaSql).toContain("actor_subject VARCHAR(191) NULL");
  });
});
