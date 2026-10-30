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

describe("Home business KPI semantics", () => {
  const source = readFileSync(
    new URL(
      "../../../control-center/public/control-center-home-overview-v1.js",
      import.meta.url,
    ),
    "utf8",
  );
  const build = runInNewContext(
    source.replaceAll("export ", "") + "\nbuildHomeModelV1;",
    {},
  ) as (input: object) => {
    metrics: Array<{
      key: string;
      label: string;
      value: string;
      state: string;
      hint: string;
    }>;
  };
  it("identifies linked-user businesses and keeps the authoritative total", () => {
    const metric = build({
      dashboard: { summary: { businesses: 2 }, businesses: Array(15).fill({}) },
    }).metrics[0];
    expect(metric.label).toBe("Empresas com usuários vinculados");
    expect(metric.value).toBe("2");
    expect(metric.hint).toBe("Total global de empresas com vínculo de usuário");
  });
  it.each([undefined, null])(
    "keeps missing totals unavailable (%s)",
    (businesses) => {
      expect(
        build({ dashboard: { summary: { businesses } } }).metrics[0],
      ).toMatchObject({ value: "—", state: "unavailable" });
    },
  );
  it("preserves a genuine zero and does not present global totals as destination totals", () => {
    expect(
      build({ dashboard: { summary: { businesses: 0 } } }).metrics[0].value,
    ).toBe("0");
    expect(
      build({
        dashboard: { summary: { businesses: 2 } },
        destinations: [{ id: "a" }],
        destinationAvailable: true,
        scope: { scope: "destination", destinationId: "a" },
      }).metrics[0],
    ).toMatchObject({ value: "—", state: "unavailable" });
  });
});

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
          invalidateSearch() {},
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
        invalidateSearch() {},
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

function sourceFunction(source: string, name: string) {
  const start = source.search(new RegExp(`(?:async )?function ${name}\\(`));
  if (start < 0) throw new Error(`Missing function ${name}`);
  return source.slice(start, source.indexOf("\n}\n", start) + 2);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function searchHarness() {
  type Response = { results: { title: string }[] };
  const requests = new Map<string, ReturnType<typeof deferred<Response>>>();
  let onInput = () => {};
  let timer: (() => Promise<void>) | undefined;
  const input = {
    value: "",
    addEventListener(_key: string, callback: () => void) {
      onInput = callback;
    },
  };
  const results = { hidden: true, innerHTML: "" };
  const invalidate = runInNewContext(
    dispatcher.slice(
      dispatcher.indexOf("let searchTimer;"),
      dispatcher.indexOf('searchResults.addEventListener("click"'),
    ) + "\ninvalidateSearch;",
    {
      searchInput: input,
      searchResults: results,
      escapeHtml: String,
      clearTimeout() {
        timer = undefined;
      },
      setTimeout(callback: () => Promise<void>) {
        timer = callback;
      },
      api(path: string) {
        const request = deferred<Response>();
        requests.set(path, request);
        return request.promise;
      },
    },
  ) as () => void;
  return {
    results,
    invalidate,
    input(value: string) {
      input.value = value;
      onInput();
    },
    start() {
      if (!timer) throw new Error("No scheduled search");
      const callback = timer;
      timer = undefined;
      return callback();
    },
    request(query: string) {
      const request = requests.get(`/search?q=${query}`);
      if (!request) throw new Error("No request");
      return request;
    },
  };
}

describe("Control Center async generation isolation", () => {
  it("obsolete overview cannot change headings after owner projections finish", async () => {
    const source = readFileSync(
      new URL(
        "../../../control-center/public/control-center-home-overview-v1.js",
        import.meta.url,
      ),
      "utf8",
    );
    const response = deferred<Record<string, unknown>>();
    let current = true;
    let modelBuilt = false;
    const render = runInNewContext(
      sourceFunction(source, "renderHomeOverviewV1") +
        "\nrenderHomeOverviewV1;",
      {
        buildHomeModelV1() {
          modelBuilt = true;
          throw new Error("Obsolete render reached model");
        },
      },
    ) as (ctx: object) => Promise<void>;
    const work = render({
      api: () => response.promise,
      isCurrent: () => current,
      content: {},
    });
    current = false;
    response.resolve({ data: [], destinations: [], entries: [] });
    await work;
    expect(modelBuilt).toBe(false);
  });

  it.each([false, true])(
    "obsolete CMS response cannot mount content or start legacy fallback (reject=%s)",
    async (reject) => {
      const source = readFileSync(
        new URL(
          "../../../control-center/public/control-center-business-cms.js",
          import.meta.url,
        ),
        "utf8",
      );
      const response = deferred<Record<string, unknown>>();
      let current = true;
      let legacyCalled = false;
      const content = { innerHTML: "CURRENT" };
      const render = runInNewContext(
        "let businessCmsRuntimeUnavailable=false;\n" +
          sourceFunction(source, "renderBusinessCms") +
          "\nrenderBusinessCms;",
        {
          businessCmsContract: { detail: () => "/detail" },
          isCmsContractUnavailable: () => true,
          detailTabs: () => "STALE",
          bindDetail() {},
        },
      ) as (ctx: object, id: string, options: object) => Promise<void>;
      const work = render(
        {
          api: () => response.promise,
          isCurrent: () => current,
          content,
          actorHasCapability: () => false,
        },
        "old",
        {
          legacyRender() {
            legacyCalled = true;
          },
        },
      );
      current = false;
      if (reject) response.reject(new Error("PLACE_PLATFORM_UNAVAILABLE"));
      else response.resolve({ businessId: "old" });
      await work;
      expect(content.innerHTML).toBe("CURRENT");
      expect(legacyCalled).toBe(false);
    },
  );

  it("keeps newer search results when old success arrives last", async () => {
    const h = searchHarness();
    h.input("old");
    const old = h.start();
    h.input("new");
    const current = h.start();
    h.request("new").resolve({ results: [{ title: "CURRENT" }] });
    await current;
    h.request("old").resolve({ results: [{ title: "STALE" }] });
    await old;
    expect(h.results.innerHTML).toContain("CURRENT");
    expect(h.results.innerHTML).not.toContain("STALE");
    expect(h.results.hidden).toBe(false);
  });
  it("does not let old errors hide current results", async () => {
    const h = searchHarness();
    h.input("old");
    const old = h.start();
    h.input("new");
    const current = h.start();
    h.request("new").resolve({ results: [{ title: "CURRENT" }] });
    await current;
    h.request("old").reject(new Error("old failure"));
    await old;
    expect(h.results.hidden).toBe(false);
  });
  it.each(["", "x", "new"])(
    "invalidates immediately when input changes to %j before debounce",
    async (value) => {
      const h = searchHarness();
      h.input("old");
      const old = h.start();
      h.input(value);
      h.request("old").resolve({ results: [{ title: "STALE" }] });
      await old;
      expect(h.results.hidden).toBe(true);
      expect(h.results.innerHTML).not.toContain("STALE");
    },
  );
  it("dismissal invalidates pending search even without transport abort", async () => {
    const h = searchHarness();
    h.input("old");
    const old = h.start();
    h.invalidate();
    h.request("old").resolve({ results: [{ title: "STALE" }] });
    await old;
    expect(h.results.hidden).toBe(true);
    expect(dispatcher).toMatch(
      /if \(event.key === "Escape"\) \{[\s\S]*?invalidateSearch\(\)/,
    );
  });
  it("does not confuse repeated query text with the same generation", async () => {
    const h = searchHarness();
    h.input("same");
    const old = h.start();
    const oldRequest = h.request("same");
    h.input("");
    h.input("same");
    const current = h.start();
    h.request("same").resolve({ results: [{ title: "CURRENT" }] });
    await current;
    oldRequest.resolve({ results: [{ title: "STALE" }] });
    await old;
    expect(h.results.innerHTML).toContain("CURRENT");
  });

  function renderHarness() {
    const requests: ReturnType<typeof deferred<Record<string, unknown>>>[] = [];
    const content = {
      innerHTML: "",
      dataset: {} as Record<string, string>,
      busy: "",
      setAttribute(_key: string, value: string) {
        this.busy = value;
      },
    };
    let heading = "";
    const render = runInNewContext(
      "let renderGeneration=0;\n" +
        ["captureRenderGuard", "renderAudit", "renderSystem", "render"]
          .map((name) => sourceFunction(dispatcher, name))
          .join("\n") +
        "\nrender;",
      {
        content,
        state: {},
        escapeHtml: String,
        statusBadge: String,
        renderNav() {},
        setHeading(v: string) {
          heading = v;
        },
        installAdvancedDisclosures() {},
        document: {
          querySelector() {
            return null;
          },
        },
        renderSettings() {
          content.innerHTML = "SETTINGS";
        },
        api() {
          const r = deferred<Record<string, unknown>>();
          requests.push(r);
          return r.promise;
        },
      },
    ) as (view: string) => Promise<void>;
    return {
      content,
      request(index: number) {
        const request = requests[index];
        if (!request)
          throw new Error(`Render request ${index} was not observed`);
        return request;
      },
      render,
      heading: () => heading,
    };
  }
  it.each([false, true])(
    "ignores old module completion and errors (reject=%s)",
    async (reject) => {
      const h = renderHarness();
      const old = h.render("audit");
      await h.render("settings");
      if (reject) h.request(0).reject(new Error("STALE"));
      else h.request(0).resolve({ entries: [], durability: "STALE" });
      await old;
      expect(h.heading()).toBe("settings");
      expect(h.content.innerHTML).toBe("SETTINGS");
      expect(h.content.dataset.renderedView).toBe("settings");
      expect(h.content.busy).toBe("false");
    },
  );
  it("old finally cannot clear loading of a newer module", async () => {
    const h = renderHarness();
    const old = h.render("audit");
    const current = h.render("system");
    h.request(0).resolve({ entries: [], durability: "STALE" });
    await old;
    expect(h.content.busy).toBe("true");
    expect(h.content.dataset.renderedView).toBeUndefined();
    expect(h.content.innerHTML).toContain("Carregando");
    h.request(1).resolve({ release: { sha: "CURRENT" } });
    await current;
    expect(h.content.innerHTML).toContain("CURRENT");
    expect(h.content.dataset.renderedView).toBe("system");
  });
  it("isolates repeated navigation to the same module", async () => {
    const h = renderHarness();
    const old = h.render("audit");
    const current = h.render("audit");
    h.request(1).resolve({ entries: [], durability: "CURRENT" });
    await current;
    h.request(0).resolve({ entries: [], durability: "STALE" });
    await old;
    expect(h.content.innerHTML).toContain("CURRENT");
    expect(h.content.innerHTML).not.toContain("STALE");
  });
  it("current errors remain visible", async () => {
    const h = renderHarness();
    const current = h.render("audit");
    h.request(0).reject(new Error("CURRENT FAILURE"));
    await current;
    expect(h.content.innerHTML).toContain("CURRENT FAILURE");
    expect(h.content.busy).toBe("false");
  });
});
