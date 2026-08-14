import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

async function source(path: string): Promise<string> {
  return readFile(new URL(path, import.meta.url), "utf8");
}

describe("CRM M122 contracts browser lifecycle", () => {
  it("exposes a contract creation form aligned with server limits", async () => {
    const page = await source("../../admin-crm/public/contracts.html");

    expect(page).toContain('id="contract-create-form"');
    expect(page).toContain('name="leadId"');
    expect(page).toContain('name="proposalId"');
    expect(page).toContain('name="title" required maxlength="180"');
    expect(page).toContain('name="content" required maxlength="100000"');
  });

  it("uses authenticated create, send and cancel commands", async () => {
    const client = await source("../../admin-crm/public/contracts.js");

    expect(client).toContain('auth.secureFetch("/api/crm/contracts"');
    expect(client).toContain('method: "POST"');
    expect(client).toContain(
      "/api/crm/contracts/${contract.id}/${action.suffix}",
    );
    expect(client).toContain('action.suffix === "cancel"');
    expect(client).toContain('contract.status === "draft"');
  });
});
