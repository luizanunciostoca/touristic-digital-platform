import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
const root = new URL("../../../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");

describe("CRM M108 Edit Lead browser flow", () => {
  it("exposes a separate Lead editor", async () => {
    const html = await read("apps/admin-crm/public/index.html");
    expect(html).toContain('id="lead-edit-card"');
    expect(html).toContain('id="lead-edit-form"');
    expect(html).toContain('id="lead-edit-submit"');
    expect(html).toContain('id="lead-edit-cancel"');
  });
  it("opens the editor from a safe text action", async () => {
    const shell = await read("apps/admin-crm/public/shell.js");
    expect(shell).toContain('button.textContent="Editar"');
    expect(shell).toContain("button.dataset.leadId");
    expect(shell).toContain("openLeadEditor");
  });
  it("updates the selected Lead through secure PATCH", async () => {
    const shell = await read("apps/admin-crm/public/shell.js");
    expect(shell).toContain('method:"PATCH"');
    expect(shell).toContain('`/api/crm/leads/${selectedLeadId}`');
    expect(shell).toContain("JSON.stringify(payload)");
  });
  it("refreshes after edit while keeping destructive and stage mutations excluded", async () => {
    const shell = await read("apps/admin-crm/public/shell.js");
    expect(shell).toContain("closeLeadEditor()");
    expect(shell).toContain("leadsLoaded=false");
    expect(shell).not.toContain('method:"DELETE"');
    expect(shell).not.toContain("/stage");
  });
});
