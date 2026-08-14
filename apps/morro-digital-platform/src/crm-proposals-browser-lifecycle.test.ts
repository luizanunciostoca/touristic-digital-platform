import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

async function source(path: string): Promise<string> {
  return readFile(new URL(path, import.meta.url), "utf8");
}

describe("CRM M121 proposals browser lifecycle", () => {
  it("exposes a proposal creation form aligned with server limits", async () => {
    const page = await source("../../admin-crm/public/proposals.html");

    expect(page).toContain('id="proposal-create-form"');
    expect(page).toContain('name="leadId"');
    expect(page).toContain('name="title" required maxlength="180"');
    expect(page).toContain('name="planName" maxlength="120"');
    expect(page).toContain('name="monthlyValue" required');
  });

  it(
    "uses authenticated create, send and response endpoints with server-authoritative transitions",
    async () => {
      const client = await source("../../admin-crm/public/proposals.js");

      expect(client).toContain('auth.secureFetch("/api/crm/proposals"');
      expect(client).toContain('method: "POST"');
      expect(client).toContain("/api/crm/proposals/${proposal.id}/send");
      expect(client).toContain('proposal.status === "draft"');
      expect(client).toContain('proposal.status === "sent"');
      expect(client).toContain("/api/crm/proposals/${proposal.id}/respond");
      expect(client).toContain('JSON.stringify({ accepted: true })');
      expect(client).toContain('JSON.stringify({ accepted: false })');
      expect(client).toContain("await loadProposals()");
    },
  );
});
