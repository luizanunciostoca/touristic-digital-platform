/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import type { AuthSessionIdentity } from "@touristic/auth";
import { describe, expect, it, vi } from "vitest";
import type { CrmLead } from "./index.js";
import {
  CrmAiContentBoundary,
  type CrmAiContentAuditEvent,
} from "./ai-content-contract.js";

const now = new Date("2026-08-16T07:00:00Z");
const lead: CrmLead = {
  id: 7,
  companyName: "Toca do Morcego",
  segment: "Eventos",
  contactName: "Luiz",
  phone: null,
  whatsapp: null,
  email: null,
  address: null,
  website: null,
  notes: null,
  stage: "proposal_sent",
  status: "active",
  source: null,
  referredById: null,
  assignedToId: null,
  monthlyValue: "499.90",
  createdAt: now,
  updatedAt: now,
  lastContactAt: null,
  convertedAt: null,
};
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
describe("CRM M141 AI-assisted content contract", () => {
  it("builds shared capability input only from authorized CRM-owned context", async () => {
    const audits: CrmAiContentAuditEvent[] = [];
    const generate = vi.fn(async () => ({ text: "Mensagem personalizada" }));
    const boundary = new CrmAiContentBoundary(
      {
        findLead: async (id) => (id === 7 ? lead : null),
        listRecentInteractions: async () => [
          { type: "note", content: "Cliente pediu retorno amanhã" },
        ],
      },
      { generate },
      { record: async (event) => void audits.push(event) },
      () => now,
    );
    await expect(
      boundary.generate(session("manager"), {
        leadId: 7,
        kind: "follow_up_message",
      }),
    ).resolves.toEqual({
      ok: true,
      value: {
        leadId: 7,
        kind: "follow_up_message",
        text: "Mensagem personalizada",
      },
    });
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        capability: "crm.content.generate",
        locale: "pt-BR",
        context: expect.objectContaining({
          companyName: "Toca do Morcego",
          contactName: "Luiz",
        }),
      }),
    );
    expect(audits.at(-1)).toEqual(
      expect.objectContaining({ allowed: true, reason: "allowed" }),
    );
  });
  it("fails closed for viewer access and never invokes shared capability", async () => {
    const generate = vi.fn(async () => ({ text: "blocked" }));
    const boundary = new CrmAiContentBoundary(
      { findLead: async () => lead, listRecentInteractions: async () => [] },
      { generate },
      { record: async () => undefined },
      () => now,
    );
    await expect(
      boundary.generate(session("viewer"), {
        leadId: 7,
        kind: "contract_draft",
      }),
    ).resolves.toEqual({ ok: false, reason: "read_only_role" });
    expect(generate).not.toHaveBeenCalled();
  });
  it("keeps provider failures fail closed", async () => {
    const boundary = new CrmAiContentBoundary(
      { findLead: async () => lead, listRecentInteractions: async () => [] },
      {
        generate: async () => {
          throw new Error("provider unavailable");
        },
      },
      { record: async () => undefined },
      () => now,
    );
    await expect(
      boundary.generate(session("admin"), {
        leadId: 7,
        kind: "partnership_announcement",
      }),
    ).resolves.toEqual({ ok: false, reason: "provider_failure" });
  });
});
