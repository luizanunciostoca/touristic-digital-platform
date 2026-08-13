import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const root = new URL("../../../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");

describe("CRM M107 Create Lead browser flow", () => {
  it("exposes a create Lead form with the required company field", async () => {
    const html = await read("apps/admin-crm/public/index.html");

    expect(html).toContain('id="lead-create-form"');
    expect(html).toContain('name="companyName"');
    expect(html).toContain('name="companyName" required');
    expect(html).toContain('id="lead-create-status"');
  });

  it("creates Leads through the shared secure transport", async () => {
    const shell = await read("apps/admin-crm/public/shell.js");

    expect(shell).toContain('auth.secureFetch("/api/crm/leads"');
    expect(shell).toContain('method:"POST"');
    expect(shell).toContain('"Content-Type":"application/json"');
    expect(shell).toContain("JSON.stringify(payload)");
  });

  it("refreshes the list after a successful creation", async () => {
    const shell = await read("apps/admin-crm/public/shell.js");

    expect(shell).toContain("leadCreateForm.reset()");
    expect(shell).toContain("leadsLoaded=false");
    expect(shell).toContain("await loadLeads()");
  });

  it("keeps later Lead mutations out of M107", async () => {
    const shell = await read("apps/admin-crm/public/shell.js");

    expect(shell).not.toContain('method:"PATCH"');
    expect(shell).not.toContain('method:"DELETE"');
    expect(shell).not.toContain("/stage");
  });
});
