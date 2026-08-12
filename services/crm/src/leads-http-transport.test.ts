import type { AuthSessionIdentity } from "@touristic/auth";
import type {
  CrmLead,
  CrmLeadAuditEvent,
  CrmLeadBoundaryRepository,
} from "@touristic/crm";
import { CrmLeadServerBoundary } from "@touristic/crm/leads-boundary";
import { describe, expect, it } from "vitest";

import { CrmLeadHttpTransport, type CrmTransportAuthPort } from "./leads-http-transport.js";
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
  return { transport: new CrmLeadHttpTransport(boundary, auth), audits };
}

describe("CRM M72 authenticated lead transport", () => {
  it("maps unauthenticated reads through the CRM boundary and durable audit contract", async () => {
    const { transport, audits } = transportFixture(null);
    await expect(
      transport.handle({ method: "GET", pathname: "/api/crm/leads" }),
    ).resolves.toEqual(
      expect.objectContaining({ status: 401, body: expect.objectContaining({ error: "AUTH_REQUIRED" }) }),
    );
    expect(audits).toEqual([
      expect.objectContaining({ operation: "lead.list", reason: "authentication_required" }),
    ]);
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
    expect(invalid).toEqual(
      expect.objectContaining({ status: 400, body: expect.objectContaining({ error: "INVALID_INPUT" }) }),
    );
  });

  it("fails viewer mutations closed after platform mutation security succeeds", async () => {
    const { transport, audits } = transportFixture("viewer");
    const result = await transport.handle({
      method: "POST",
      pathname: "/api/crm/leads",
      body: { companyName: "Blocked" },
    });
    expect(result.status).toBe(403);
    expect(audits.at(-1)).toEqual(
      expect.objectContaining({ operation: "lead.create", reason: "read_only_role" }),
    );
  });

  it("rejects mutation security before CRM writes without reimplementing CSRF rules", async () => {
    const { transport } = transportFixture("manager");
    const denied = new CrmLeadHttpTransport(
      (transport as unknown as { boundary: CrmLeadServerBoundary }).boundary,
      {
        resolveSession: async () => session("manager"),
        authorizeMutation: async () => ({ allowed: false, reason: "invalid_csrf" }),
      },
    );
    await expect(
      denied.handle({ method: "POST", pathname: "/api/crm/leads", body: { companyName: "Nope" } }),
    ).resolves.toEqual(
      expect.objectContaining({ status: 403, body: expect.objectContaining({ error: "INVALID_CSRF" }) }),
    );
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
    expect(crmM71SchemaSql).toContain("CREATE TABLE IF NOT EXISTS crm_audit_events");
    expect(crmM71SchemaSql).toContain("actor_subject VARCHAR(191) NULL");
  });
});
