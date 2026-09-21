import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));

async function readRepository(path: string): Promise<string> {
  return readFile(repositoryRoot + path, "utf8");
}

describe("Morro Digital Control Center UX Design V1 contract", () => {
  it("preserves canonical manual tokens and AA foreground derivatives", async () => {
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
      "--md-success-text: #087a45",
      "--md-warning: #d97706",
      "--md-warning-text: #9a4d00",
      "--md-danger: #d92d20",
      "--md-danger-text: #b42318",
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
    expect(html).toContain(
      'id="support-banner" class="support-banner" role="status" aria-live="polite"',
    );
    expect(html).toContain(
      'id="content" role="region" aria-labelledby="page-title" aria-busy="false"',
    );
    expect(html).not.toContain('id="content" aria-live=');
    expect(html).toContain("control-center-ux-v1.js");
  });

  it("implements the manual information architecture and product exclusions", async () => {
    const [core, ux, html] = await Promise.all([
      readRepository("apps/control-center/public/control-center.js"),
      readRepository("apps/control-center/public/control-center-ux-v1.js"),
      readRepository("apps/control-center/public/index.html"),
    ]);
    const source = core + "\n" + ux + "\n" + html;

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
      expect(source).toContain(label);
    }

    expect(source).toContain("Afiliados pertencem à Morro Digital");
    expect(source).toContain(
      "Os afiliados são da Morro Digital e são organizados por destino, não por empresa.",
    );
    expect(source).toContain("Precisa da sua atenção");
    expect(source).toContain("Resumo por destino");
    expect(source).toContain("Atividade recente");
    expect(source).not.toContain("Ações rápidas");
    expect(source).not.toContain("quick-actions");
    expect(source).not.toContain("assistant-floating");
    expect(source).not.toContain("assistant-fab");
  });

  it("uses shared primitives for real Control Center surfaces", async () => {
    const [primitives, core, ux] = await Promise.all([
      readRepository("apps/control-center/public/control-center-primitives.js"),
      readRepository("apps/control-center/public/control-center.js"),
      readRepository("apps/control-center/public/control-center-ux-v1.js"),
    ]);

    for (const primitive of [
      "statusBadge",
      "loadingState",
      "emptyState",
      "errorState",
      "partialState",
      "sectionHeader",
      "entityHeader",
      "enhanceDataTables",
      "enhanceCriticalActions",
      "enhanceControlCenterSurface",
    ]) {
      expect(primitives).toContain(`function ${primitive}`);
    }

    expect(core).toContain('from "./control-center-primitives.js"');
    expect(core).toContain("enhanceControlCenterSurface(content)");
    expect(core).toContain("loadingState()");
    expect(core).toContain("errorState(");
    expect(core).toContain("partialState(");
    expect(core).toContain("sectionHeader({");

    expect(ux).toContain('from "./control-center-primitives.js"');
    expect(ux).toContain("entityHeader({");
    expect(ux).toContain("enhanceDataTables(contentRoot)");
    expect(ux).toContain("enhanceControlCenterSurface(contentRoot)");
  });

  it("preserves Business, Affiliate and User 360 patterns without inventing functional tabs", async () => {
    const ux = await readRepository(
      "apps/control-center/public/control-center-ux-v1.js",
    );
    const primitives = await readRepository(
      "apps/control-center/public/control-center-primitives.js",
    );

    for (const label of [
      '"Empresa"',
      '"Afiliado"',
      '"Usuário"',
      '"Resumo"',
      '"Perfil"',
      '"Usuários"',
      '"Produtos"',
      '"Ofertas"',
      '"Reservas"',
      '"Financeiro"',
      '"CRM"',
      '"Histórico"',
      '"Auditoria"',
      '"Destinos"',
      '"Atribuições"',
      '"Conversões"',
      '"Comissões"',
      '"Conta"',
      '"Permissões"',
      '"Sessões"',
    ]) {
      expect(ux).toContain(label);
    }
    expect(primitives).toContain("Visão 360° administrativa");
    expect(primitives).toContain('class="entity-tabs"');
    expect(primitives).toContain('tabindex="0"');
    expect(ux).toContain("Contexto de destino protegido");
    expect(ux).toContain("não atribui registros por inferência");
  });

  it("keeps responsive, keyboard, touch and reduced-motion safeguards", async () => {
    const [css, responsiveContract, workflow] = await Promise.all([
      readRepository("apps/control-center/public/control-center.css"),
      readRepository(
        "apps/morro-digital-platform/tooling/control-center-responsive-browser-contract.mjs",
      ),
      readRepository(".github/workflows/control-center-browser-contract.yml"),
    ]);

    for (const breakpoint of [
      "@media (max-width: 1359px)",
      "@media (max-width: 1199px)",
      "@media (max-width: 900px)",
      "@media (max-width: 767px)",
      "@media (max-width: 520px)",
      "@media (max-width: 390px)",
      "@media (pointer: coarse), (max-width: 900px)",
      "@media (max-height: 520px) and (orientation: landscape)",
    ]) {
      expect(css).toContain(breakpoint);
    }

    for (const viewport of [
      'label: "1440x900"',
      'label: "1280x800"',
      'label: "1024x768"',
      'label: "768x1024"',
      'label: "430x932"',
      'label: "390x844"',
    ]) {
      expect(responsiveContract).toContain(viewport);
    }

    expect(css).toContain(":focus-visible");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain(".responsive-cards");
    expect(css).toContain("min-height: 44px");
    expect(css).toContain("min-height: 100dvh");
    expect(workflow).toContain(
      "control-center-responsive-browser-contract.mjs",
    );
    expect(workflow).toContain("/tmp/control-center-visual-*.png");
  });
});
