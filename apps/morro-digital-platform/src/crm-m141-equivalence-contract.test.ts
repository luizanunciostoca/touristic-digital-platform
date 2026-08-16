import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
const root = new URL("../../../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");
describe("CRM M141 residual equivalence contracts", () => {
  it("preserves frozen V1 optional-field clearing on Lead Detail", async () => {
    const browser = await read("apps/admin-crm/public/lead-detail.js");
    expect(browser).toContain(
      'return { [name]: String(data.get(name) || "").trim() };',
    );
    expect(browser).toContain('method: "PATCH"');
  });
  it("exposes server-authoritative follow-up sent/responded transitions", async () => {
    const browser = await read("apps/admin-crm/public/follow-ups.js");
    const document = await read("apps/admin-crm/public/follow-ups.html");
    const stylesheet = await read("apps/admin-crm/public/crm.css");
    expect(browser).toContain("Marcar como enviado");
    expect(browser).toContain("Lead respondeu");
    expect(browser).toContain("/api/crm/follow-ups/${id}/${transition}");
    expect(browser).toContain("createDashboardAuthClient");
    expect(browser).not.toContain("createAuthBrowserClient");
    expect(document).toContain('type="importmap"');
    expect(document).toContain("@touristic/auth-browser");
    expect(document).toContain('class="lead-create-form"');
    expect(document).toContain('class="grid"');
    expect(stylesheet).toContain("[hidden]{display:none!important}");
    expect(stylesheet).toContain("@media(max-width:560px)");
  });
  it("keeps AI authority in a CRM-owned authorized context boundary", async () => {
    const contract = await read("packages/crm/src/ai-content-contract.ts");
    expect(contract).toContain('capability: "crm.content.generate"');
    expect(contract).toContain("CrmSharedAssistantContentPort");
    expect(contract).toContain("authorizeCrmAccess");
    expect(contract).toContain("listRecentInteractions(leadId, 5)");
    expect(contract).not.toContain("apiKey");
    expect(contract).not.toContain("fetch(");
  });
});
