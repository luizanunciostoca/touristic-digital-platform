import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
const root = new URL("../../../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");
describe("CRM M107 Create Lead browser flow", () => {
  it("keeps the create form and secure POST contract", async () => {
    const html = await read("apps/admin-crm/public/index.html");
    const shell = await read("apps/admin-crm/public/shell.js");
    expect(html).toContain('id="lead-create-form"');
    expect(html).toContain('name="companyName" required');
    expect(shell).toContain('method:"POST"');
    expect(shell).toContain("leadCreateForm.reset()");
  });
  it("keeps destructive and stage mutations excluded", async () => {
    const shell = await read("apps/admin-crm/public/shell.js");
    expect(shell).not.toContain('method:"DELETE"');
    expect(shell).not.toContain("/stage");
  });
});
