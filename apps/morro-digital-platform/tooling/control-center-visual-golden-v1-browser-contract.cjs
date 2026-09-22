const { mkdirSync, copyFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { chromium } = require("/tmp/pw/node_modules/playwright");
const pixelmatch = require("/tmp/pw/node_modules/pixelmatch");
const { PNG } = require("/tmp/pw/node_modules/pngjs");

const origin = process.env.CONTROL_CENTER_ORIGIN || "http://127.0.0.1:4199";
const exactHead = process.env.GITHUB_SHA || "local";
const mutation = process.env.CONTROL_CENTER_GOLDEN_MUTATION || "";
const baselineDir = join(
  process.cwd(),
  "tests/visual-regression/control-center-v1",
);
const artifactRoot = "/tmp/control-center-visual-golden-v1";
const expectedDir = join(artifactRoot, "expected");
const actualDir = join(artifactRoot, "actual");
const diffDir = join(artifactRoot, "diff");
for (const path of [artifactRoot, expectedDir, actualDir, diffDir])
  mkdirSync(path, { recursive: true });

const viewports = [
  { width: 1440, height: 900, label: "1440x900" },
  { width: 1280, height: 800, label: "1280x800" },
  { width: 1024, height: 768, label: "1024x768" },
  { width: 768, height: 1024, label: "768x1024" },
  { width: 390, height: 844, label: "390x844" },
];
const expectedKpis = [
  "Empresas",
  "Afiliados",
  "Reservas Hoje",
  "Receita Hoje",
  "Alertas",
];
const frozenNow = "2026-09-22T10:00:00.000Z";
const password = "control center responsive browser fixture";

const destinations = [
  {
    id: "morro-de-sao-paulo",
    status: "active",
    branding: {
      name: "Morro de São Paulo — destino operacional com nome muito longo",
    },
  },
  { id: "itacare", status: "active", branding: { name: "Itacaré" } },
];
const dashboard = {
  generatedAt: "2026-09-22T10:00:00.000Z",
  summary: { businesses: 123456789012345 },
  attention: {
    status: "PARTIAL",
    knownCount: 99,
    items: Array.from({ length: 7 }, (_, index) => ({
      id: "attention-" + index,
      kind: index ? "support-open" : "business-approval",
      count: index ? 1 : 99,
      severity: index ? "warning" : "critical",
      destinationId: index % 2 ? "itacare" : "morro-de-sao-paulo",
      title:
        "Alerta operacional com texto propositalmente longo para expansão de conteúdo " +
        index,
    })),
  },
  destinationSummary: {
    status: "PARTIAL",
    items: [
      {
        destinationId: "morro-de-sao-paulo",
        businesses: { count: 987654321, status: "READY" },
        reservationsToday: { count: 123456, status: "READY" },
        revenueToday: {
          minorUnits: 999999999999999,
          currency: "BRL",
          status: "PARTIAL",
        },
        alerts: { knownCount: 99, status: "PARTIAL" },
      },
      {
        destinationId: "itacare",
        businesses: { count: 7654321, status: "READY" },
      },
    ],
  },
};
const auditEntries = Array.from({ length: 12 }, (_, index) => ({
  timestamp: new Date(Date.UTC(2026, 8, 22, 10, index)).toISOString(),
  entityType: "business",
  entityId:
    "empresa-com-identificador-extremamente-longo-para-string-expansion-" +
    String(index).padStart(2, "0"),
  destinationId: index % 2 ? "itacare" : "morro-de-sao-paulo",
  actorUserId:
    "usuario-com-nome-administrativo-muito-longo-para-validacao-de-layout",
}));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function isLight(rgb) {
  const values =
    String(rgb)
      .match(/\d+(?:\.\d+)?/g)
      ?.slice(0, 3)
      .map(Number) || [];
  if (values.length !== 3) return false;
  return values.reduce((sum, value) => sum + value, 0) / 3 >= 205;
}
async function installRoutes(page, empty = false) {
  const emptyDashboard = {
    generatedAt: dashboard.generatedAt,
    summary: {},
    attention: { status: "READY", knownCount: 0, items: [] },
    destinationSummary: { status: "READY", items: [] },
  };
  await page.route("**/api/admin/v1/dashboard", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(empty ? emptyDashboard : dashboard),
    }),
  );
  await page.route("**/api/admin/v1/destinations", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ destinations: empty ? [] : destinations }),
    }),
  );
  await page.route("**/api/admin/v1/affiliates?*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: empty ? [] : Array.from({ length: 250 }, (_, id) => ({ id })),
      }),
    }),
  );
  await page.route("**/api/admin/v1/audit?*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ entries: empty ? [] : auditEntries }),
    }),
  );
}
async function login(page, empty = false) {
  await installRoutes(page, empty);
  await page.goto(origin + "/apps/control-center/public/index.html", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await page.waitForURL((url) => url.pathname === "/dashboard/login.html", {
    timeout: 10000,
  });
  await page.locator("#email").fill("platform-owner-responsive@example.com");
  await page.locator("#password").fill(password);
  await page.locator("#submit").click();
  await page.waitForURL(
    (url) => url.pathname === "/apps/control-center/public/index.html",
    { timeout: 15000 },
  );
  await page
    .locator("#app:not([hidden])")
    .waitFor({ state: "visible", timeout: 15000 });
  await page.locator("[data-home-overview-v1]").waitFor({ timeout: 15000 });
  await page.locator("#profile-name").evaluate((node) => {
    node.textContent =
      "Administrador Plataforma Morro Digital com nome operacional muito longo";
  });
  await page.locator("#notification-badge").evaluate((node) => {
    node.hidden = false;
    node.textContent = "99+";
  });
  await page.evaluate(() => document.fonts?.ready);
  await page.addStyleTag({
    content:
      "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}html{scroll-behavior:auto!important}",
  });
}
async function applyMutation(page) {
  if (!mutation) return;
  const css = {
    "dark-topbar":
      ".control-center-topbar{background:#08111f!important;color:#fff!important}",
    "hide-destination": ".destination-control{display:none!important}",
    "narrow-attention": ".home-attention{width:34%!important}",
    "remove-kpi": ".home-kpi:nth-child(3){display:none!important}",
    "shift-sidebar":
      "@media(min-width:1200px){.control-center-sidebar{width:300px!important}.control-center-main{margin-left:300px!important}}",
  }[mutation];
  if (!css) throw new Error("Unknown mutation: " + mutation);
  await page.addStyleTag({ content: css });
}
async function geometry(page, viewport) {
  return page.evaluate(
    ({ width, expectedKpis }) => {
      const rect = (selector) =>
        document.querySelector(selector)?.getBoundingClientRect();
      const style = (selector) => {
        const node = document.querySelector(selector);
        return node ? getComputedStyle(node) : null;
      };
      const visible = (selector) => {
        const node = document.querySelector(selector);
        return Boolean(
          node &&
          node.getClientRects().length &&
          getComputedStyle(node).visibility !== "hidden",
        );
      };
      const labels = [
        ...document.querySelectorAll("[data-home-kpi] .home-kpi__label"),
      ]
        .filter((node) => node.getClientRects().length)
        .map((node) => node.textContent.trim());
      const attentionLabels = [
        ...document.querySelectorAll(".home-attention-tile__copy b"),
      ];
      const contentRect = rect("[data-home-overview-v1]");
      const attentionRect = rect("[data-home-attention]");
      const blocks = [
        ["kpis", rect(".home-kpi-grid")],
        ["attention", attentionRect],
        ["destinations", rect("[data-home-destinations]")],
        ["lower", rect(".home-lower-grid")],
      ];
      return {
        bodyBackground: getComputedStyle(document.body).backgroundColor,
        topbarBackground: style(".control-center-topbar")?.backgroundColor,
        sidebarBackground: style(".control-center-sidebar")?.backgroundColor,
        topbarHeight: Math.round(rect(".control-center-topbar")?.height || 0),
        sidebarWidth: Math.round(rect(".control-center-sidebar")?.width || 0),
        destinationVisible:
          visible("#destination-selector") &&
          (rect("#destination-selector")?.width || 0) >= 90,
        globalVisible: width < 768 ? true : visible("#global-scope"),
        searchVisible: visible("#global-search"),
        notificationVisible: visible("#notification-button"),
        profileVisible: visible("#profile-button"),
        headingVisible:
          visible("#page-title") &&
          /^(Bom dia|Boa tarde|Boa noite),\s+\S+/u.test(
            document.querySelector("#page-title")?.textContent.trim() || "",
          ) &&
          document.querySelector("#breadcrumb")?.textContent.trim() ===
            "Control Center / Visão Geral" &&
          document.querySelector("#page-description")?.textContent.trim() ===
            "Resumo da operação da plataforma." &&
          visible(".home-heading-meta"),
        labels,
        kpiCount: labels.length,
        kpiOrderCorrect:
          JSON.stringify(labels) === JSON.stringify(expectedKpis),
        attentionWidthRatio:
          contentRect && attentionRect
            ? attentionRect.width / contentRect.width
            : 0,
        destinationSummaryVisible: visible("[data-home-destinations]"),
        recentVisible: visible(".home-activity-list"),
        affiliateVisible: visible("[data-home-affiliate-card]"),
        technicalMetaVisible: [
          ...document.querySelectorAll(".technical-meta"),
        ].some(
          (node) =>
            node.getClientRects().length &&
            getComputedStyle(node).display !== "none",
        ),
        verticalizedAttention: attentionLabels.some((node) => {
          const r = node.getBoundingClientRect();
          return r.width < 38 && r.height > 48;
        }),
        overflow:
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth + 2,
        blockOrder:
          blocks.every(([, r]) => r) &&
          blocks.every(
            ([, r], index) => index === 0 || r.top >= blocks[index - 1][1].top,
          ),
        drawerTriggerVisible: visible("#menu-button"),
        activeNavBackground: (() => {
          const node = document.querySelector(
            ".nav-item.active,.nav-item[aria-current='page']",
          );
          return node ? getComputedStyle(node).backgroundColor : "";
        })(),
      };
    },
    { width: viewport.width, expectedKpis },
  );
}
function comparePng(expectedPath, actualPath, diffPath) {
  const expected = PNG.sync.read(require("node:fs").readFileSync(expectedPath));
  const actual = PNG.sync.read(require("node:fs").readFileSync(actualPath));
  assert(
    expected.width === actual.width && expected.height === actual.height,
    "Screenshot dimensions diverged",
  );
  const diff = new PNG({ width: expected.width, height: expected.height });
  const pixels = pixelmatch(
    expected.data,
    actual.data,
    diff.data,
    expected.width,
    expected.height,
    { threshold: 0.12, includeAA: false },
  );
  PNG.sync.write(diff).copy ? null : null;
  writeFileSync(diffPath, PNG.sync.write(diff));
  return {
    pixels,
    total: expected.width * expected.height,
    ratio: pixels / (expected.width * expected.height),
  };
}
function assertManual(state, viewport) {
  assert(
    isLight(state.bodyBackground),
    "M-V1-000 body background is no longer light",
  );
  assert(
    isLight(state.topbarBackground) && state.topbarHeight === 64,
    "M-V1-001 topbar must remain light and 64px",
  );
  if (viewport.width >= 1200) {
    assert(
      isLight(state.sidebarBackground),
      "M-V1-002 sidebar must remain light",
    );
    if (viewport.width >= 1440)
      assert(
        state.sidebarWidth === 224,
        "M-V1-002 sidebar must be 224px at 1440",
      );
    else
      assert(
        state.sidebarWidth >= 208 && state.sidebarWidth <= 224,
        "M-V1-002 sidebar outside 208..224px at 1280",
      );
  }
  assert(
    state.destinationVisible &&
      state.globalVisible &&
      state.searchVisible &&
      state.notificationVisible &&
      state.profileVisible,
    "M-V1-003 topbar context contract failed",
  );
  assert(state.headingVisible, "Home header is missing or changed");
  assert(
    state.kpiCount === 5 && state.kpiOrderCorrect,
    "M-V1-004 KPI count/order diverged: " + JSON.stringify(state.labels),
  );
  assert(
    state.attentionWidthRatio >= 0.72,
    "M-V1-005 Attention Queue became too narrow",
  );
  assert(
    state.destinationSummaryVisible,
    "M-V1-006 destination summary missing",
  );
  assert(state.recentVisible, "M-V1-007 recent activity missing");
  assert(
    !state.technicalMetaVisible && isLight(state.bodyBackground),
    "M-V1-008 technical/dark hierarchy regression",
  );
  assert(state.affiliateVisible, "M-V1-009 affiliate explanatory card missing");
  assert(!state.verticalizedAttention, "M-V1-010 verticalized Attention text");
  assert(!state.overflow, "M-V1-011 horizontal overflow");
  assert(state.blockOrder, "M-V1-012 primary block order changed");
  assert(
    viewport.width < 1200
      ? state.drawerTriggerVisible
      : !state.drawerTriggerVisible,
    "M-V1-013 drawer trigger breakpoint regression",
  );
}
(async () => {
  const browser = await chromium.launch({ headless: true });
  const evidence = {
    exactHead,
    mutation: mutation || null,
    frozenNow,
    thresholds: { pixelmatch: 0.12, maxDiffRatio: 0.003 },
    viewports: [],
    drawer: {},
    empty: {},
  };
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: "pt-BR",
      timezoneId: "America/Bahia",
      colorScheme: "light",
      reducedMotion: "reduce",
      deviceScaleFactor: 1,
    });
    await context.addInitScript(
      ({ frozenNow }) => {
        const NativeDate = Date;
        const fixed = new NativeDate(frozenNow).valueOf();
        class FrozenDate extends NativeDate {
          constructor(...args) {
            super(...(args.length ? args : [fixed]));
          }
          static now() {
            return fixed;
          }
        }
        FrozenDate.parse = NativeDate.parse;
        FrozenDate.UTC = NativeDate.UTC;
        globalThis.Date = FrozenDate;
        globalThis.sessionStorage?.clear();
        globalThis.localStorage?.clear();
      },
      { frozenNow },
    );
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await login(page);
    await applyMutation(page);

    for (const viewport of viewports) {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await page.waitForTimeout(80);
      const state = await geometry(page, viewport);
      assertManual(state, viewport);
      const expectedPath = join(
        baselineDir,
        "control-center-v1-" + viewport.label + ".png",
      );
      const actualPath = join(
        actualDir,
        "control-center-v1-" + viewport.label + ".png",
      );
      const diffPath = join(
        diffDir,
        "control-center-v1-" + viewport.label + "-diff.png",
      );
      const expectedArtifactPath = join(
        expectedDir,
        "control-center-v1-" + viewport.label + ".png",
      );
      copyFileSync(expectedPath, expectedArtifactPath);
      await page.screenshot({
        path: actualPath,
        fullPage: false,
        animations: "disabled",
      });
      const diff = comparePng(expectedPath, actualPath, diffPath);
      assert(
        diff.ratio <= 0.003,
        "Golden diff exceeded 0.3% at " +
          viewport.label +
          ": " +
          (diff.ratio * 100).toFixed(4) +
          "%",
      );
      evidence.viewports.push({ ...viewport, ...state, diff });
    }

    await page.setViewportSize({ width: 768, height: 1024 });
    const menu = page.locator("#menu-button");
    await menu.click();
    assert(
      (await menu.getAttribute("aria-expanded")) === "true",
      "M-V1-013 drawer did not open",
    );
    await page.keyboard.press("Escape");
    assert(
      (await menu.getAttribute("aria-expanded")) === "false",
      "M-V1-013 drawer did not close on Escape",
    );
    evidence.drawer = { open: true, escapeClose: true };

    const emptyContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      locale: "pt-BR",
      timezoneId: "America/Bahia",
      colorScheme: "light",
      reducedMotion: "reduce",
      deviceScaleFactor: 1,
    });
    await emptyContext.addInitScript(
      ({ frozenNow }) => {
        const NativeDate = Date;
        const fixed = new NativeDate(frozenNow).valueOf();
        class FrozenDate extends NativeDate {
          constructor(...args) {
            super(...(args.length ? args : [fixed]));
          }
          static now() {
            return fixed;
          }
        }
        FrozenDate.parse = NativeDate.parse;
        FrozenDate.UTC = NativeDate.UTC;
        globalThis.Date = FrozenDate;
        globalThis.sessionStorage?.clear();
        globalThis.localStorage?.clear();
      },
      { frozenNow },
    );
    const emptyPage = await emptyContext.newPage();
    await login(emptyPage, true);
    const emptyTexts = await emptyPage
      .locator(".home-empty-state,.home-table-empty")
      .allTextContents();
    assert(emptyTexts.length >= 2, "M-V1-014 explicit empty states missing");
    assert(
      emptyTexts.every((text) => text.trim().length > 0),
      "M-V1-014 empty state without copy",
    );
    await emptyPage.screenshot({
      path: join(actualDir, "control-center-v1-empty-390x844.png"),
      fullPage: false,
      animations: "disabled",
    });
    evidence.empty = { viewport: "390x844", texts: emptyTexts };
    await emptyContext.close();

    assert(
      pageErrors.length === 0,
      "Browser page errors: " + JSON.stringify(pageErrors),
    );
    writeFileSync(
      join(artifactRoot, "report.json"),
      JSON.stringify(evidence, null, 2),
    );
    await context.close();
  } catch (error) {
    writeFileSync(
      join(artifactRoot, "failure.json"),
      JSON.stringify(
        {
          exactHead,
          mutation: mutation || null,
          message: error?.message || String(error),
        },
        null,
        2,
      ),
    );
    throw error;
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
