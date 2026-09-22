const { writeFileSync } = require("node:fs");
const { chromium } = require("/tmp/pw/node_modules/playwright");

const origin = process.env.CONTROL_CENTER_ORIGIN || "http://127.0.0.1:4197";
const password = "control center home browser fixture";

const destinations = [
  {
    id: "morro-de-sao-paulo",
    status: "active",
    branding: { name: "Morro de São Paulo" },
  },
  {
    id: "itacare",
    status: "active",
    branding: {
      name: "Itacaré — destino com nome operacional longo para validação",
    },
  },
  { id: "barra-grande", status: "active", branding: { name: "Barra Grande" } },
];

const dashboardFixture = {
  generatedAt: "2026-09-22T09:00:00.000Z",
  summary: { businesses: 123456789 },
  health: {
    readiness: "ready",
    checks: [
      { name: "http-listener", status: "pass", detail: "internal" },
      { name: "release-identity", status: "pass", detail: "internal" },
    ],
  },
  attention: {
    status: "PARTIAL",
    knownCount: 7,
    items: [
      {
        id: "critical",
        kind: "business-approval",
        count: 2,
        severity: "critical",
        destinationId: "morro-de-sao-paulo",
        createdAt: "2026-09-22T08:00:00.000Z",
      },
      {
        id: "support",
        kind: "support-open",
        count: 1,
        severity: "warning",
        destinationId: "itacare",
        createdAt: "2026-09-22T07:00:00.000Z",
      },
      {
        id: "integration",
        kind: "integration-failure",
        count: 1,
        severity: "warning",
        destinationId: "morro-de-sao-paulo",
        title: "http-listener provider error",
      },
      {
        id: "refund",
        kind: "refund-review",
        count: 1,
        severity: "warning",
        destinationId: "barra-grande",
      },
      {
        id: "old",
        kind: "support-open",
        count: 1,
        severity: "low",
        destinationId: "morro-de-sao-paulo",
      },
      {
        id: "forbidden",
        kind: "support-open",
        count: 999,
        severity: "critical",
        destinationId: "secret-destination",
      },
      { id: "missing-id", kind: "support-open", count: 1, severity: "low" },
    ],
  },
  destinationSummary: {
    status: "PARTIAL",
    items: [
      {
        destinationId: "morro-de-sao-paulo",
        businesses: { count: 22, status: "READY" },
        affiliates: { knownCount: 5, status: "PARTIAL" },
        reservationsToday: { count: 8, status: "READY" },
        revenueToday: {
          minorUnits: 123456789012345,
          currency: "BRL",
          status: "PARTIAL",
        },
        alerts: { knownCount: 3, status: "PARTIAL" },
      },
      { destinationId: "itacare", businesses: { count: 17, status: "READY" } },
      {
        destinationId: "secret-destination",
        businesses: { count: 999999, status: "READY" },
      },
      { name: "Barra Grande", businesses: { count: 777, status: "READY" } },
    ],
  },
};

const auditEntries = [
  {
    timestamp: "2026-09-22T10:24:00.000Z",
    entityType: "reservation",
    entityId: "reservation-5842",
    destinationId: "morro-de-sao-paulo",
    actorUserId: "joao-silva",
    newState: { amount: { minorUnits: 32000, currency: "BRL" } },
  },
  {
    timestamp: "2026-09-22T09:17:00.000Z",
    entityType: "business",
    entityId:
      "empresa-com-identificador-extremamente-longo-para-regressao-de-layout-0001",
    destinationId: "itacare",
    actorUserId: "maria",
  },
  {
    timestamp: "2026-09-22T08:45:00.000Z",
    entityType: "payment",
    entityId: "PDE-7832",
    destinationId: "barra-grande",
    actorUserId: "financial-owner",
    newState: { amount: { minorUnits: 45000, currency: "BRL" } },
  },
  {
    timestamp: "2026-09-22T08:12:00.000Z",
    entityType: "integration",
    entityId: "provider-http-listener",
    destinationId: "secret-destination",
    actorUserId: "system",
  },
];

async function installOwnerRoutes(page) {
  await page.route("**/api/admin/v1/dashboard", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(dashboardFixture),
    }),
  );
  await page.route("**/api/admin/v1/affiliates?*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: Array.from({ length: 250 }, (_, index) => ({
          id: "affiliate-" + index,
        })),
      }),
    }),
  );
  await page.route("**/api/admin/v1/destinations", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ destinations }),
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
  await installOwnerRoutes(page);
  await page.goto(origin + "/apps/control-center/public/index.html", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await page.waitForURL((url) => url.pathname === "/dashboard/login.html", {
    timeout: 10000,
  });
  await page.locator("#email").fill("platform-owner-home@example.com");
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
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const evidence = {
    viewports: [],
    kpis: [],
    attention: {},
    destinations: {},
    recent: {},
    security: {},
  };
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await login(page);

    const kpiLabels = await page
      .locator("[data-home-kpi] .home-kpi__label")
      .allTextContents();
    const expectedKpis = [
      "Empresas",
      "Afiliados",
      "Reservas Hoje",
      "Receita Hoje",
      "Alertas",
    ];
    if (JSON.stringify(kpiLabels) !== JSON.stringify(expectedKpis))
      throw new Error("KPI labels diverged: " + JSON.stringify(kpiLabels));
    evidence.kpis = kpiLabels;

    const affiliateKpi = page.locator('[data-home-kpi="affiliates"]');
    if (
      (await affiliateKpi.locator(".home-kpi__value").textContent()).trim() !==
      "—"
    )
      throw new Error("Paginated affiliate slice was fabricated into a total");
    if ((await affiliateKpi.getAttribute("data-state")) !== "partial")
      throw new Error("Affiliate slice did not expose partial state");
    for (const key of ["reservations", "revenue"]) {
      if (
        (
          await page
            .locator('[data-home-kpi="' + key + '"] .home-kpi__value')
            .textContent()
        ).trim() !== "—"
      ) {
        throw new Error(key + " fabricated an unavailable total");
      }
    }

    const attentionTiles = page.locator(".home-attention-tile");
    if ((await attentionTiles.count()) !== 4)
      throw new Error("Attention visual cap is not four tiles");
    const attentionText = await page
      .locator("[data-home-attention]")
      .innerText();
    for (const technical of [
      "http-listener",
      "shutdown-readiness",
      "release-identity",
    ]) {
      if (attentionText.includes(technical))
        throw new Error("Technical vocabulary leaked into Home: " + technical);
    }
    if (attentionText.includes("999"))
      throw new Error("Unauthorized destination attention leaked");
    evidence.attention = {
      tiles: await attentionTiles.count(),
      text: attentionText,
    };

    const destinationRows = page.locator("[data-home-destination-id]");
    const destinationIds = await destinationRows.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-home-destination-id")),
    );
    if (destinationIds.includes("secret-destination"))
      throw new Error("Unauthorized destination summary leaked");
    if (destinationIds.length !== 3)
      throw new Error(
        "Authorized destination cardinality diverged: " +
          JSON.stringify(destinationIds),
      );
    const barraRow = page
      .locator('[data-home-destination-id="barra-grande"]')
      .locator("xpath=ancestor::tr");
    if ((await barraRow.locator("td").nth(1).innerText()).trim() !== "—")
      throw new Error("Destination metric was inferred by label");
    evidence.destinations.ids = destinationIds;

    const recentText = await page.locator("[data-home-recent]").innerText();
    if (
      recentText.includes("secret-destination") ||
      recentText.includes("provider-http-listener")
    )
      throw new Error("Cross-destination audit leakage detected");
    if (!recentText.includes("R$"))
      throw new Error("Human formatted financial activity is missing");
    evidence.recent.text = recentText;

    for (const viewport of [
      { width: 1440, height: 900, label: "1440" },
      { width: 1280, height: 800, label: "1280" },
    ]) {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await page.waitForTimeout(80);
      const geometry = await page.evaluate(() => {
        const root = document.documentElement;
        const cards = [...document.querySelectorAll(".home-kpi")];
        return {
          pageOverflow: root.scrollWidth > root.clientWidth + 2,
          kpiCount: cards.length,
          verticalized: cards.some((node) => {
            const label = node.querySelector(".home-kpi__label");
            if (!label) return false;
            const rect = label.getBoundingClientRect();
            return rect.height > 42 && rect.width < 36;
          }),
        };
      });
      if (geometry.pageOverflow)
        throw new Error("Horizontal page overflow at " + viewport.label);
      if (geometry.kpiCount !== 5)
        throw new Error("KPI count changed at " + viewport.label);
      if (geometry.verticalized)
        throw new Error("KPI text verticalized at " + viewport.label);
      await page.screenshot({
        path: "/tmp/control-center-home-overview-v1-" + viewport.label + ".png",
        fullPage: true,
      });
      evidence.viewports.push({ ...viewport, ...geometry });
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator('[data-home-destination-id="itacare"]').click();
    await page.waitForTimeout(150);
    if (
      (await page.locator("#global-scope").getAttribute("aria-pressed")) !==
      "false"
    )
      throw new Error("Destination row did not enter destination context");
    const selected = await page.locator("#destination-selector").inputValue();
    if (selected !== "itacare")
      throw new Error("Destination row selected wrong id: " + selected);
    if (
      (
        await page
          .locator('[data-home-kpi="businesses"] .home-kpi__value')
          .textContent()
      ).trim() !== "—"
    )
      throw new Error("Global business total leaked into destination KPI");
    const scopedIds = await page
      .locator("[data-home-destination-id]")
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("data-home-destination-id")),
      );
    if (JSON.stringify(scopedIds) !== JSON.stringify(["itacare"]))
      throw new Error(
        "Destination scope leaked other destinations: " +
          JSON.stringify(scopedIds),
      );
    evidence.security = {
      selectedDestination: selected,
      scopedIds,
      globalBusinessSuppressed: true,
    };

    if (pageErrors.length)
      throw new Error("Browser page errors: " + JSON.stringify(pageErrors));
    writeFileSync(
      "/tmp/control-center-home-overview-v1-evidence.json",
      JSON.stringify(evidence, null, 2),
    );
    await context.close();
  } finally {
    await browser.close();
  }
})().catch(() => {
  console.error("Control Center Home Overview V1 browser contract failed");
  process.exit(1);
});
