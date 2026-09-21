import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));

async function readRepository(path: string): Promise<string> {
  return readFile(repositoryRoot + path, "utf8");
}

describe("Morro Digital Control Center UX Design V1 contract", () => {
  it("uses the canonical administrative design tokens from the manual", async () => {
    const css = await readRepository(
      "apps/control-center/public/control-center.css",
    );

    for (const contract of [
      "--md-bg: #f4f8fc",
      "--md-surface: #ffffff",
      "--md-text: #0b2447",
      "--md-text-muted: #60738f",
      "--md-primary: #0b63ce",
      "--md-primary-soft: #eaf3ff",
      "--md-success: #10a760",
      "--md-warning: #d97706",
      "--md-danger: #d92d20",
      "--md-purple: #6d5ce8",
      "--md-border: #dce6f1",
      "--md-focus: #2e90fa",
      "--md-sidebar-width: 224px",
      "--md-topbar-height: 64px",
    ]) {
      expect(css).toContain(contract);
    }
  });

  it("keeps destination, universal search, support and account context in the top-level shell", async () => {
    const html = await readRepository("apps/control-center/public/index.html");

    expect(html).toContain('id="destination-selector"');
    expect(html).toContain('id="global-scope"');
    expect(html).toContain(
      'placeholder="Pesquisar empresa, afiliado, reserva, pedido..."',
    );
    expect(html).toContain('id="notification-button"');
    expect(html).toContain('id="profile-button"');
    expect(html).toContain('id="support-banner"');
    expect(html).toContain("control-center-ux-v1.js");
  });

  it("implements the manual information architecture and platform-owned affiliate rule", async () => {
    const ux = await readRepository(
      "apps/control-center/public/control-center-ux-v1.js",
    );

    for (const label of [
      "Visão Global",
      "Visão Geral",
      "Empresas",
      "Usuários",
      "Afiliados",
      "CRM",
      "Produtos",
      "Ofertas",
      "Reservas",
      "Ticketing",
      "Check-in",
      "Pedidos",
      "Pagamentos",
      "Reembolsos",
      "Comissões",
      "Suporte",
      "Auditoria",
      "Sistema",
      "Integrações",
      "Configurações",
    ]) {
      expect(ux).toContain(label);
    }

    expect(ux).toContain("Afiliados pertencem à Morro Digital");
    expect(ux).toContain(
      "Os afiliados são da Morro Digital e são organizados por destino, não por empresa.",
    );
    expect(ux).toContain("Precisa da sua atenção");
    expect(ux).toContain("Resumo por destino");
    expect(ux).toContain("Atividade recente");
    expect(ux).toContain("Ações rápidas");
  });

  it("preserves reusable 360-degree patterns and destination fail-closed behavior", async () => {
    const ux = await readRepository(
      "apps/control-center/public/control-center-ux-v1.js",
    );

    expect(ux).toContain("Visão 360° administrativa");
    expect(ux).toContain(
      'businesses: ["Empresa", ["Resumo", "Perfil", "Usuários", "Produtos", "Ofertas", "Reservas", "Financeiro", "CRM", "Histórico", "Auditoria"]]',
    );
    expect(ux).toContain(
      'affiliates: ["Afiliado", ["Resumo", "Perfil", "Destinos", "Atribuições", "Conversões", "Comissões", "Histórico", "Auditoria"]]',
    );
    expect(ux).toContain(
      'users: ["Usuário", ["Resumo", "Conta", "Permissões", "Empresas", "Sessões", "Histórico", "Auditoria"]]',
    );
    expect(ux).toContain("Contexto de destino protegido");
    expect(ux).toContain("não atribui registros por inferência");
  });

  it("keeps the required responsive, accessibility and reduced-motion primitives", async () => {
    const css = await readRepository(
      "apps/control-center/public/control-center.css",
    );

    for (const breakpoint of [
      "@media (max-width: 1359px)",
      "@media (max-width: 1199px)",
      "@media (max-width: 900px)",
      "@media (max-width: 767px)",
      "@media (max-width: 520px)",
      "@media (max-width: 390px)",
    ]) {
      expect(css).toContain(breakpoint);
    }

    expect(css).toContain(":focus-visible");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain(".responsive-cards");
    expect(css).toContain("min-height: 100dvh");
  });
});
