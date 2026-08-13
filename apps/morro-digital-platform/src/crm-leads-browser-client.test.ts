import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const root = new URL("../../../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");

describe("CRM M106 Leads browser client", () => {
  it("exposes a dedicated Leads view in the authenticated shell", async () => {
    const html = await read("apps/admin-crm/public/index.html");

    expect(html).toContain('id="leads-view"');
    expect(html).toContain('id="leads-table"');
    expect(html).toContain('id="leads-body"');
    expect(html).toContain("Consulta autenticada do cadastro comercial atual.");
  });

  it("loads Leads through the shared secure browser transport", async () => {
    const shell = await read("apps/admin-crm/public/shell.js");

    expect(shell).toContain('auth.secureFetch("/api/crm/leads"');
    expect(shell).toContain('Accept:"application/json"');
    expect(shell).toContain("response.status!==401");
    expect(shell).toContain("Array.isArray(payload.data)");
  });

  it("renders server data as text nodes instead of HTML", async () => {
    const shell = await read("apps/admin-crm/public/shell.js");

    expect(shell).toContain("cell.textContent=");
    expect(shell).toContain("leadsBody.replaceChildren()");
    expect(shell).not.toContain(".innerHTML");
    expect(shell).not.toContain("insertAdjacentHTML");
  });

  it("keeps edit, delete and stage mutation out of the Leads surface", async () => {
    const shell = await read("apps/admin-crm/public/shell.js");

    expect(shell).not.toContain('method:"PATCH"');
    expect(shell).not.toContain('method:"DELETE"');
    expect(shell).not.toContain("/stage");
  });
});
