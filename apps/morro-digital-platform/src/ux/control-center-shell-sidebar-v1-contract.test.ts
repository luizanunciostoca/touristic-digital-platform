import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const html = readFileSync(
  new URL("../../../control-center/public/index.html", import.meta.url),
  "utf8",
);
const css = readFileSync(
  new URL(
    "../../../control-center/public/control-center-shell-v1.css",
    import.meta.url,
  ),
  "utf8",
);
const shell = readFileSync(
  new URL(
    "../../../control-center/public/control-center-shell-v1.js",
    import.meta.url,
  ),
  "utf8",
);

const groups = [
  "Principal",
  "Operação",
  "Relacionamentos",
  "Comercial",
  "Reservas",
  "Financeiro",
  "Controle",
  "Plataforma",
];

const items = [
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
];

describe("Control Center UX V1 shell contract", () => {
  it("keeps available navigation items without misleading aliases", () => {
    for (const group of groups) expect(shell).toContain(`label: "${group}"`);
    for (const item of items) expect(shell).toContain(`label: "${item}"`);

    expect(shell).not.toContain('label: "Produtos e Ofertas"');
    const integration = shell.match(/\{\s*key: "integrations",[\s\S]*?\}/)?.[0];
    expect(integration).toContain("disabled: true");
    expect(integration).not.toContain("view:");
    expect(shell).toContain("Indisponível");
  });

  it("renders the complete primary topbar and removes operational SHA from prominence", () => {
    for (const id of [
      "global-scope",
      "destination-selector",
      "global-search",
      "notification-button",
      "profile-button",
    ]) {
      expect(html).toContain(`id="${id}"`);
    }

    expect(html).toContain("Touristic Digital Platform");
    expect(html).toContain('class="brand-wordmark__mark"');
    expect(html).toContain('id="release-chip" class="technical-meta" hidden');
    expect(html).toContain(
      'placeholder="Pesquisar empresa, afiliado, reserva, pedido..."',
    );
    expect(html).toContain('class="topbar-line-icon"');
    expect(html).toContain('data-scope="global"');
  });

  it("keeps the sidebar below the topbar and independently scrollable", () => {
    expect(css).toContain("--md-sidebar-width: 224px");
    expect(css).toContain("--md-topbar-height: 64px");
    expect(css).toContain("inset: var(--md-topbar-height) auto 0 0");
    expect(css).toContain("overflow-y: auto");
    expect(css).toContain("overflow-x: hidden");
    expect(css).toContain("overscroll-behavior: contain");
    expect(css).toContain("scrollbar-gutter: stable");
    expect(css).toContain("env(safe-area-inset-bottom)");
    expect(css).toContain("overflow: auto");
  });

  it("uses the governed V2 light shell tokens and active navigation treatment", () => {
    expect(css).toContain("--md-bg: #f7fafc");
    expect(css).toContain("--md-surface: #ffffff");
    expect(css).toContain("--md-text: #07152f");
    expect(css).toContain("--md-primary: #056fb5");
    expect(css).toContain("--md-primary-soft: #e8f6fb");
    expect(css).toContain("--md-border: #dce6f1");
    expect(css).toContain("--md-success: #16794b");
    expect(css).toContain("--md-warning: #d97706");
    expect(css).toContain("--md-danger: #d92d20");
    expect(css).toContain("--md-purple: #6d5ce8");
    expect(css).toContain("--md-radius-lg: 12px");
    expect(css).toContain('nav-item[aria-current="page"]');
    expect(css).not.toContain("linear-gradient");
  });

  it("supports tablet drawer, mobile simplification and keyboard focus visibility", () => {
    expect(css).toContain("@media (max-width: 1199px)");
    expect(css).toContain("@media (max-width: 767px)");
    expect(css).toContain("@media (max-width: 430px)");
    expect(css).toContain(
      "grid-template-columns: 44px minmax(132px, 1fr) 44px auto;",
    );
    expect(css).toContain(".scope-button {\n    display: none;");
    expect(css).toContain(".scope-controls {\n    display: flex;");
    expect(css).toContain(".brand-wordmark {\n    display: none;");
    expect(css).toContain(
      ".destination-control,\n  .destination-control select {\n    max-width: none;",
    );
    expect(css).toContain("outline: 3px solid var(--md-focus)");
    expect(shell).toContain('event.key !== "Escape"');
    expect(shell).toContain('scrollIntoView({ block: "nearest"');
    expect(shell).toContain('setAttribute("aria-current", "page")');
    expect(shell).toContain('setAttribute("aria-expanded"');
    expect(shell).toContain('"/api/admin/v1/destinations"');
    expect(shell).toContain('"md:destination-context-changed"');
    expect(shell).toContain("destinationScopeKey");
    expect(shell).toContain("destinationContextKey");
  });

  it("preserves unique legacy routes used by the current runtime", () => {
    for (const route of [
      "overview",
      "businesses",
      "users",
      "affiliates",
      "crm",
      "products",
      "reservations",
      "ticketing",
      "orders",
      "financial",
      "support",
      "audit",
      "system",
      "settings",
    ]) {
      expect(shell).toContain(`view: "${route}"`);
    }
  });
});

const routeSource = readFileSync(
  new URL(
    "../../../control-center/public/control-center-route.js",
    import.meta.url,
  ),
  "utf8",
).replace(/^export /gm, "");
const dispatcher = readFileSync(
  new URL("../../../control-center/public/control-center.js", import.meta.url),
  "utf8",
);
const openHashSource = dispatcher.slice(
  dispatcher.indexOf("function openHash("),
  dispatcher.indexOf("\nlet searchTimer;"),
);
const shellRouteSource = shell.slice(
  shell.indexOf("function routeFromHash("),
  shell.indexOf("\nfunction selectedItem("),
);

describe("Control Center route consumers", () => {
  it.each([
    "query=Sambass",
    "categoryId=restaurants",
    "destinationId=morro",
    "publicationState=published",
    "locationStatus=confirmed",
    "query=A%3AB%3FC%26D&destinationId=morro&categoryId=restaurants&publicationState=published",
    "query=A:B?C",
  ])(
    "keeps filtered business routes in both content and sidebar: %s",
    (query) => {
      const hash = `#businesses?${query}`;
      const renders: unknown[] = [];
      const route: unknown = runInNewContext(
        routeSource +
          shellRouteSource +
          openHashSource +
          "\nopenHash(hash); routeFromHash();",
        {
          hash,
          location: { hash },
          readControlCenterPreferences: () => ({ defaultView: "overview" }),
          pageCopy: { businesses: true, overview: true },
          render: (view: string, detail: string | undefined) =>
            renders.push({ view, detail }),
        },
      );
      expect(route).toBe("businesses");
      expect(renders).toEqual([{ view: "businesses", detail: undefined }]);
      expect(
        runInNewContext(routeSource + "\nparseControlCenterHash(hash).query", {
          hash,
        }),
      ).toBe(query);
    },
  );

  it.each([
    [
      "#businesses:encoded%3Aid?query=A:B",
      "overview",
      "businesses",
      "encoded%3Aid",
    ],
    ["", "settings", "settings", undefined],
    ["#unknown?query=x", "overview", "overview", undefined],
    ["#businesses", "overview", "businesses", undefined],
  ])(
    "preserves details, defaults and unknown-route fallback: %s",
    (hash, defaultView, view, detail) => {
      const renders: unknown[] = [];
      runInNewContext(routeSource + openHashSource + "\nopenHash(hash)", {
        hash,
        readControlCenterPreferences: () => ({ defaultView }),
        pageCopy: { businesses: true, settings: true, overview: true },
        render: (view: string, detail: string | undefined) =>
          renders.push({ view, detail }),
      });
      expect(renders).toEqual([{ view, detail }]);
    },
  );
});
