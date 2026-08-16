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
    expect(html).toContain(
      "/apps/admin-crm/public/settings.html\">Configurações",
    );
    expect(html).toContain(
      "Follow-up mutável + visão canônica do funil e sistema",
    );
    expect(html).not.toContain("sem boundary CRM genérico");
    expect(html).not.toContain("Configurações <small>Em breve</small>");
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
    const runtime = await read(
      "apps/morro-digital-platform/tooling/crm-api.mjs",
    );
    expect(runtime).toContain("CrmMetricsServerBoundary");
    expect(runtime).toContain("MySqlCrmMetricsRepository");
    expect(runtime).toContain("MySqlCrmMetricsAuditPort");
    expect(runtime).toContain("CrmMetricsHttpTransport");
    expect(runtime).toContain('"/api/crm/metrics"');
  });
});

describe("CRM M139 Settings browser contract", () => {
  it("restores the frozen V1 Settings sections without inventing a second mutable settings domain", async () => {
    const html = await read("apps/admin-crm/public/settings.html");
    for (const marker of [
      "Configurações do sistema CRM",
      "Follow-up Automático",
      "Sobre o Sistema",
      "Etapas do Funil de Vendas",
      'name="intervalDays" type="number" min="1" max="30"',
      'name="maxAttempts" type="number" min="1" max="20"',
      "@touristic/crm/settings-contract",
    ]) {
      expect(html).toContain(marker);
    }
    expect(html).not.toContain("Follow-up com IA ativo");
    expect(html).not.toContain("WhatsApp, LLM (IA)");
  });

  it("requires the shared session and reuses the existing audited Follow-up settings boundary", async () => {
    const browser = await read("apps/admin-crm/public/settings.js");
    expect(browser).toContain("@touristic/auth-browser");
    expect(browser).toContain("createDashboardAuthClient");
    expect(browser).toContain("getSession");
    expect(browser).toContain('/api/crm/follow-ups/settings"');
    expect(browser).toContain('method: "PUT"');
    expect(browser).toContain(
      "messageTemplate: currentSetting?.messageTemplate ?? null",
    );
    expect(browser).toContain("crmSettingsFunnelStages");
    expect(browser).toContain("crmSettingsV1Baseline");
    expect(browser).toContain("textContent");
    expect(browser).toContain("replaceChildren");
    expect(browser).not.toContain("innerHTML");
  });

  it("keeps Settings presentation vocabulary derived from the CRM package", async () => {
    const contract = await read("packages/crm/src/settings-contract.ts");
    expect(contract).toContain("crmActiveFunnelStages.map");
    expect(contract).toContain('new_lead: "Novo Lead"');
    expect(contract).toContain('payment_done: "Pagamento Recebido"');
    expect(contract).toContain('active_client: "Cliente Ativo"');
    expect(contract).toContain(
      "intervalDays: Object.freeze({ min: 1, max: 30 })",
    );
    expect(contract).toContain(
      "maxAttempts: Object.freeze({ min: 1, max: 20 })",
    );
  });
});
