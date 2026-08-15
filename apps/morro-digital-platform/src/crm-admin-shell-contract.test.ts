import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const root = new URL("../../../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");

describe("CRM M104 browser shell", () => {
  it("exposes the frozen V1 primary modules without claiming UI parity", async () => {
    const html = await read("apps/admin-crm/public/index.html");
    for (const module of [
      "Dashboard",
      "Leads",
      "Reuniões",
      "Propostas",
      "Contratos",
      "Follow-ups",
      "Trials",
      "Indicações",
      "Configurações",
    ]) {
      expect(html).toContain(module);
    }
    expect(html).toContain("criação + envio + resposta");
    expect(html).toContain("envio + cancelamento");
    expect(html).toContain("histórico + configurações");
    expect(html).toContain("cancelamento + expiração");
    expect(html).toContain("vínculo + contato + conversão/perda");
    expect(html).toContain("sem boundary CRM genérico");
    expect(html).not.toContain('href="#settings"');
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain("Em breve");
    expect(html).toContain("/apps/admin-crm/public/meetings.html");
    expect(html).not.toContain('id="meetings-view"');
  });

  it("keeps the shell behind the shared platform session surface", async () => {
    const shell = await read("apps/admin-crm/public/shell.js");
    const loginEntry = await read(
      "apps/morro-digital-platform/src/business-login-entry.ts",
    );
    expect(shell).toContain("@touristic/auth-browser");
    expect(shell).toContain("getSession");
    expect(shell).toContain("/dashboard/login.html");
    expect(shell).not.toContain('hash==="#meetings"');
    expect(shell).not.toContain("loadMeetings");
    expect(shell).not.toContain("renderMeetings");
    expect(loginEntry).toContain("/apps/admin-crm/");
  });
});

describe("CRM M138 authoritative dashboard browser", () => {
  it("renders the frozen dashboard metric and funnel vocabulary", async () => {
    const html = await read("apps/admin-crm/public/index.html");
    for (const marker of [
      'id="metric-total"',
      'id="metric-active"',
      'id="metric-converted"',
      'id="metric-conversion-rate"',
      'id="metric-revenue"',
      'id="metric-lost"',
      'id="dashboard-funnel"',
      'id="dashboard-recent-leads"',
      'id="dashboard-recent-interactions"',
      "Total de Leads",
      "Clientes Ativos",
      "Receita Mensal",
      "Leads Perdidos",
      "Funil de Vendas",
      "Leads Recentes",
      "Atividade Recente",
    ]) {
      expect(html).toContain(marker);
    }
    expect(html).toContain("Métricas operacionais calculadas pelo servidor");
  });

  it("loads only the authenticated server metric contract and safely renders text", async () => {
    const shell = await read("apps/admin-crm/public/shell.js");
    expect(shell).toContain('/api/crm/metrics/funnel"');
    expect(shell).toContain("dashboardRefreshMs=30_000");
    expect(shell).toContain(
      'funnelStages=["new_lead","first_contact","meeting_scheduled","proposal_sent","trial","contract_signed","payment_done","active_client"]',
    );
    expect(shell).toContain("textContent");
    expect(shell).toContain("replaceChildren");
    expect(shell).not.toContain("innerHTML");
  });

  it("composes metrics through the shared CRM runtime instead of a browser-owned calculation", async () => {
    const runtime = await read("apps/morro-digital-platform/tooling/crm-api.mjs");
    expect(runtime).toContain("CrmMetricsServerBoundary");
    expect(runtime).toContain("MySqlCrmMetricsRepository");
    expect(runtime).toContain("MySqlCrmMetricsAuditPort");
    expect(runtime).toContain("CrmMetricsHttpTransport");
    expect(runtime).toContain('"/api/crm/metrics"');
  });
});
