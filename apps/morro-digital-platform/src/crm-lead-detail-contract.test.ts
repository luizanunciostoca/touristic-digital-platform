import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const root = new URL("../../../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");

describe("CRM M140 Lead Detail permanent contract", () => {
  it("exposes a dedicated authenticated detail/activity surface", async () => {
    const html = await read("apps/admin-crm/public/lead-detail.html");
    for (const marker of [
      'id="lead-detail-shell"',
      'id="lead-summary"',
      'id="lead-stage-form"',
      'id="lead-edit-form"',
      'id="lead-checklist"',
      'id="lead-interaction-form"',
      'id="lead-interactions"',
      "Checklist do processo",
      "Atividade recente",
      "Módulos relacionados",
      "@touristic/crm/lead-detail-contract",
    ]) {
      expect(html).toContain(marker);
    }
  });

  it("navigates list rows to the canonical detail page without changing the legacy list lifecycle", async () => {
    const index = await read("apps/admin-crm/public/index.html");
    const links = await read("apps/admin-crm/public/lead-detail-links.js");
    expect(index).toContain("/apps/admin-crm/public/lead-detail-links.js");
    expect(index).toContain("detalhe/atividade");
    expect(links).toContain(".lead-action-cell");
    expect(links).toContain(".lead-edit-button[data-lead-id]");
    expect(links).toContain("lead-detail.html?id=");
    expect(links).toContain("MutationObserver");
  });

  it("uses shared Auth, canonical mutations and safe DOM rendering", async () => {
    const browser = await read("apps/admin-crm/public/lead-detail.js");
    expect(browser).toContain("@touristic/auth-browser");
    expect(browser).toContain("createDashboardAuthClient");
    expect(browser).toContain("getSession");
    expect(browser).toContain("crmLeadDetailStages");
    expect(browser).toContain("crmLeadDetailManualInteractionTypes");
    expect(browser).toContain("/detail`");
    expect(browser).toContain("/checklist/${item.id}`");
    expect(browser).toContain("/interactions`");
    expect(browser).toContain("/stage`");
    expect(browser).toContain('method: "PATCH"');
    expect(browser).toContain("textContent");
    expect(browser).toContain("replaceChildren");
    expect(browser).not.toContain("innerHTML");
  });

  it("composes the server-only aggregate through the existing CRM runtime", async () => {
    const runtime = await read(
      "apps/morro-digital-platform/tooling/crm-api.mjs",
    );
    expect(runtime).toContain("CrmLeadDetailServerBoundary");
    expect(runtime).toContain("MySqlCrmLeadDetailRepository");
    expect(runtime).toContain("MySqlCrmLeadDetailAuditPort");
    expect(runtime).toContain("CrmLeadDetailHttpTransport");
    expect(runtime).toContain(
      "new CrmLeadDetailHttpTransport(leadDetailBoundary, authPort)",
    );
    expect(runtime.indexOf("new CrmLeadDetailHttpTransport")).toBeLessThan(
      runtime.indexOf("new CrmLeadHttpTransport"),
    );
  });
  it("keeps lead forms responsive without inline grid spans", async () => {
    const [html, css] = await Promise.all([
      read("apps/admin-crm/public/lead-detail.html"),
      read("apps/admin-crm/public/crm.css"),
    ]);

    expect(html).not.toMatch(/style="grid-column:/u);
    expect(html).toContain('class="lead-form-span-full"');
    expect(html).toContain('class="lead-form-span-wide"');
    expect(html).toContain("lead-checklist-card");
    expect(css).toContain(
      ".lead-create-form .lead-form-span-full{grid-column:1/-1}",
    );
    expect(css).toContain(
      ".lead-create-form .lead-form-span-wide{grid-column:span 2}",
    );
    expect(css).toContain(
      ".lead-create-form .lead-form-span-full,.lead-create-form .lead-form-span-wide{grid-column:1/-1}",
    );
    expect(css).toContain(
      ".lead-checklist-card .dashboard-list-item{gap:4px;padding:8px 0}",
    );
    expect(css).toContain(".lead-create-form>*{min-width:0}");
  });
});
