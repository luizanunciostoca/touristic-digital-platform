const { writeFileSync } = require("node:fs");
const { chromium } = require("/tmp/pw/node_modules/playwright");
const axe = require("/tmp/pw/node_modules/axe-core");

const origin = process.env.CONTROL_CENTER_ORIGIN || "http://127.0.0.1:4198";
const password = "control center responsive browser fixture";
const viewports = [
  { width: 1440, height: 900, label: "1440" },
  { width: 1280, height: 800, label: "1280" },
  { width: 1024, height: 768, label: "1024" },
  { width: 768, height: 1024, label: "768" },
  { width: 390, height: 844, label: "390" },
];

const destinations = [
  {
    id: "morro-de-sao-paulo",
    status: "active",
    branding: {
      name: "Morro de São Paulo — destino operacional com nome muito longo",
    },
  },
  {
    id: "itacare",
    status: "active",
    branding: { name: "Itacaré" },
  },
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

async function installRoutes(page) {
  await page.route("**/api/admin/v1/dashboard", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(dashboard),
    }),
  );
  await page.route("**/api/admin/v1/destinations", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ destinations }),
    }),
  );
  await page.route("**/api/admin/v1/affiliates?*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: Array.from({ length: 250 }, (_, id) => ({ id })),
      }),
    }),
  );
  await page.route("**/api/admin/v1/audit?*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ entries: auditEntries }),
    }),
  );
}

async function login(page) {
  await installRoutes(page);
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
  await page.locator("#app:not([hidden])").waitFor({
    state: "visible",
    timeout: 15000,
  });
  await page.locator("[data-home-overview-v1]").waitFor({ timeout: 15000 });
}

async function geometry(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const topbar = document.querySelector(".control-center-topbar");
    const sidebar = document.querySelector(".control-center-sidebar");
    const destination = document.querySelector("#destination-selector");
    const profile = document.querySelector("#profile-button");
    const attentionLabels = [
      ...document.querySelectorAll(".home-attention-tile__copy b"),
    ];
    const targets = [
      ...document.querySelectorAll(
        "#menu-button, #notification-button, #profile-button, .nav-item, .home-attention-tile, .home-destination-cell button",
      ),
    ].filter((node) => node.getClientRects().length > 0);
    return {
      overflow: root.scrollWidth > root.clientWidth + 2,
      topbarHeight: Math.round(topbar?.getBoundingClientRect().height || 0),
      sidebarWidth: Math.round(sidebar?.getBoundingClientRect().width || 0),
      destinationVisible:
        Boolean(destination) &&
        destination.getClientRects().length > 0 &&
        destination.getBoundingClientRect().width >= 90,
      profileWidth: Math.round(profile?.getBoundingClientRect().width || 0),
      verticalizedAttention: attentionLabels.some((node) => {
        const rect = node.getBoundingClientRect();
        return rect.width < 38 && rect.height > 48;
      }),
      undersizedTargets: targets
        .map((node) => ({
          id: node.id || node.className,
          width: Math.round(node.getBoundingClientRect().width),
          height: Math.round(node.getBoundingClientRect().height),
        }))
        .filter((target) => target.width < 40 || target.height < 40),
    };
  });
}

async function checkAxe(page) {
  await page.addScriptTag({ content: axe.source });
  return page.evaluate(async () => {
    const result = await axe.run(document, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"],
      },
    });
    return result.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.length,
    }));
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const evidence = {
    viewports: [],
    keyboard: {},
    drawer: {},
    popovers: {},
    table: {},
    reducedMotion: {},
    accessibility: {},
  };

  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await login(page);

    await page.locator("#profile-name").evaluate((node) => {
      node.textContent =
        "Administrador Plataforma Morro Digital com nome operacional muito longo";
    });
    await page.locator("#notification-badge").evaluate((node) => {
      node.hidden = false;
      node.textContent = "99+";
    });

    for (const viewport of viewports) {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await page.waitForTimeout(100);
      const state = await geometry(page);
      if (state.overflow)
        throw new Error("Horizontal overflow at " + viewport.label);
      if (!state.destinationVisible)
        throw new Error("Destination context hidden at " + viewport.label);
      if (state.topbarHeight !== 64)
        throw new Error(
          "Topbar height changed at " +
            viewport.label +
            ": " +
            state.topbarHeight,
        );
      if (viewport.width >= 1200) {
        const expected =
          viewport.width >= 1440
            ? 224
            : state.sidebarWidth >= 208 && state.sidebarWidth <= 224;
        if (expected !== true && state.sidebarWidth !== expected)
          throw new Error(
            "Desktop sidebar width changed at " +
              viewport.label +
              ": " +
              state.sidebarWidth,
          );
      }
      if (state.verticalizedAttention)
        throw new Error("Attention text verticalized at " + viewport.label);
      if (state.undersizedTargets.length)
        throw new Error(
          "Undersized touch target at " +
            viewport.label +
            ": " +
            JSON.stringify(state.undersizedTargets),
        );
      await page.screenshot({
        path:
          "/tmp/control-center-responsive-accessibility-v1-" +
          viewport.label +
          ".png",
        fullPage: true,
      });
      evidence.viewports.push({ ...viewport, ...state });
    }

    await page.setViewportSize({ width: 768, height: 1024 });
    const menu = page.locator("#menu-button");
    await menu.focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(50);
    const firstNav = page.locator(".nav-item").first();
    if (!(await firstNav.evaluate((node) => node === document.activeElement)))
      throw new Error("Drawer did not move focus to first navigation item");
    if ((await menu.getAttribute("aria-expanded")) !== "true")
      throw new Error("Drawer aria-expanded did not become true");
    await page.keyboard.press("Escape");
    if ((await menu.getAttribute("aria-expanded")) !== "false")
      throw new Error("Drawer did not close on Escape");
    if (!(await menu.evaluate((node) => node === document.activeElement)))
      throw new Error("Drawer focus did not return to menu trigger");
    evidence.drawer = { enter: true, escape: true, focusRestore: true };

    await page.keyboard.press("Control+K");
    if (
      !(await page
        .locator("#global-search")
        .evaluate((node) => node === document.activeElement))
    )
      throw new Error("Ctrl+K did not focus universal search");
    evidence.keyboard.ctrlK = true;

    await page.locator("#notification-button").click();
    await page.locator("#notification-panel:not([hidden])").waitFor();
    await page.keyboard.press("Escape");
    if (
      !(await page
        .locator("#notification-button")
        .evaluate((node) => node === document.activeElement))
    )
      throw new Error("Notification Escape did not restore focus");
    evidence.popovers.notificationEscapeFocus = true;

    await page.locator("#profile-button").click();
    await page.locator("#user-menu-panel:not([hidden])").waitFor();
    await page.locator("#user-menu-logout").focus();
    await page.keyboard.press("Tab");
    if (
      !(await page
        .locator("#user-menu-logout")
        .evaluate((node) => node === document.activeElement))
    )
      throw new Error("User menu focus containment failed");
    await page.keyboard.press("Escape");
    if (
      !(await page
        .locator("#profile-button")
        .evaluate((node) => node === document.activeElement))
    )
      throw new Error("User menu Escape did not restore focus");
    evidence.popovers.userMenuKeyboard = true;

    const table = page.locator(".home-table-wrap").first();
    if ((await table.getAttribute("tabindex")) !== "0")
      throw new Error("Scrollable table is not keyboard focusable");
    await table.focus();
    const tableState = await table.evaluate((node) => ({
      clientWidth: node.clientWidth,
      scrollWidth: node.scrollWidth,
      focused: node === document.activeElement,
    }));
    if (!tableState.focused || tableState.scrollWidth <= tableState.clientWidth)
      throw new Error("Table scroll contract not exercised");
    evidence.table = tableState;

    const reducedContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      reducedMotion: "reduce",
    });
    const reducedPage = await reducedContext.newPage();
    await login(reducedPage);
    const transition = await reducedPage
      .locator(".control-center-sidebar")
      .evaluate((node) => getComputedStyle(node).transitionDuration);
    if (!["0s", "0.01ms"].includes(transition))
      throw new Error(
        "Reduced motion transition is not suppressed: " + transition,
      );
    evidence.reducedMotion.transitionDuration = transition;
    await reducedContext.close();

    await page.setViewportSize({ width: 390, height: 844 });
    const violations = await checkAxe(page);
    const serious = violations.filter((item) =>
      ["critical", "serious"].includes(item.impact),
    );
    if (serious.length)
      throw new Error(
        "WCAG serious/critical violations: " + JSON.stringify(serious),
      );
    evidence.accessibility.axeViolations = violations;

    if (pageErrors.length)
      throw new Error("Browser page errors: " + JSON.stringify(pageErrors));

    writeFileSync(
      "/tmp/control-center-responsive-accessibility-v1-evidence.json",
      JSON.stringify(evidence, null, 2),
    );
    await context.close();
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(
    error?.message || "Control Center responsive accessibility failed",
  );
  process.exit(1);
});
