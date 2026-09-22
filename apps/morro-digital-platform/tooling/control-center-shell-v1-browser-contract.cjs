const { writeFileSync } = require("node:fs");
const { chromium } = require("/tmp/pw/node_modules/playwright");

const origin = process.env.CONTROL_CENTER_ORIGIN || "http://127.0.0.1:4196";
const password = "control center shell browser fixture";

const requiredGroups = [
  "Principal",
  "Operação",
  "Relacionamentos",
  "Comercial",
  "Reservas",
  "Financeiro",
  "Controle",
  "Plataforma",
];

const requiredItems = [
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

const viewports = [
  { width: 1440, height: 900, label: "1440" },
  { width: 1280, height: 800, label: "1280" },
  { width: 1024, height: 768, label: "1024" },
  { width: 768, height: 1024, label: "768" },
  { width: 390, height: 844, label: "390" },
];

async function login(page) {
  await page.goto(`${origin}/apps/control-center/public/index.html`, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await page.waitForURL((url) => url.pathname === "/dashboard/login.html", {
    timeout: 10000,
  });
  await page.locator("#email").fill("platform-owner-shell@example.com");
  await page.locator("#password").fill(password);
  await page.locator("#submit").click();
  await page.waitForURL(
    (url) => url.pathname === "/apps/control-center/public/index.html",
    { timeout: 15000 },
  );
  await page
    .locator("#app:not([hidden])")
    .waitFor({ state: "visible", timeout: 15000 });
  await page.locator(".nav-group").first().waitFor({ timeout: 10000 });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const evidence = {
    groups: [],
    items: [],
    viewports: [],
    keyboard: [],
    shell: {},
  };

  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await login(page);

    for (const group of requiredGroups) {
      const count = await page
        .locator(".nav-group-label", { hasText: group })
        .count();
      if (count !== 1) throw new Error(`Missing nav group: ${group}`);
      evidence.groups.push(group);
    }

    const sidebarNav = page.locator("#main-nav");
    for (const item of requiredItems) {
      const count = await sidebarNav
        .getByRole("button", { name: item, exact: true })
        .count();
      if (count !== 1)
        throw new Error(`Missing or duplicate nav item: ${item}`);
      evidence.items.push(item);
    }

    const topbarSelectors = [
      ".brand-wordmark",
      "#global-scope",
      "#destination-selector",
      "#global-search",
      "#notification-button",
      "#profile-button",
    ];
    for (const selector of topbarSelectors) {
      if ((await page.locator(selector).count()) !== 1) {
        throw new Error(`Topbar control missing: ${selector}`);
      }
    }
    if (!(await page.locator("#release-chip").isHidden())) {
      throw new Error("Operational SHA is visible in the primary topbar");
    }

    const shellVisual = await page.evaluate(() => {
      const sidebar = document.querySelector("#sidebar");
      const topbar = document.querySelector(".control-center-topbar");
      const active = document.querySelector('.nav-item[aria-current="page"]');
      const nav = document.querySelector("#main-nav");
      const sidebarStyle = getComputedStyle(sidebar);
      const topbarStyle = getComputedStyle(topbar);
      const activeStyle = getComputedStyle(active);
      return {
        sidebarBackground: sidebarStyle.backgroundColor,
        topbarBackground: topbarStyle.backgroundColor,
        sidebarTop: sidebar.getBoundingClientRect().top,
        topbarHeight: topbar.getBoundingClientRect().height,
        activeBackground: activeStyle.backgroundColor,
        activeColor: activeStyle.color,
        navClientHeight: nav.clientHeight,
        navScrollHeight: nav.scrollHeight,
      };
    });

    if (shellVisual.sidebarBackground !== "rgb(255, 255, 255)") {
      throw new Error(`Sidebar is not white: ${shellVisual.sidebarBackground}`);
    }
    if (shellVisual.topbarBackground !== "rgb(255, 255, 255)") {
      throw new Error(`Topbar is not white: ${shellVisual.topbarBackground}`);
    }
    if (Math.abs(shellVisual.topbarHeight - 64) > 1) {
      throw new Error(`Topbar height diverged: ${shellVisual.topbarHeight}`);
    }
    if (Math.abs(shellVisual.sidebarTop - 64) > 1) {
      throw new Error(
        `Sidebar does not start below topbar: ${shellVisual.sidebarTop}`,
      );
    }
    if (shellVisual.navScrollHeight <= shellVisual.navClientHeight) {
      throw new Error(
        `Sidebar scroll contract not exercised: ${JSON.stringify(shellVisual)}`,
      );
    }
    evidence.shell = shellVisual;

    const lastItem = page.getByRole("button", {
      name: "Configurações",
      exact: true,
    });
    await lastItem.focus();
    const focusVisibility = await lastItem.evaluate((node) => {
      const nav = document.querySelector("#main-nav").getBoundingClientRect();
      const item = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return {
        withinScrollport:
          item.top >= nav.top - 1 && item.bottom <= nav.bottom + 1,
        outlineWidth: parseFloat(style.outlineWidth || "0"),
      };
    });
    if (!focusVisibility.withinScrollport) {
      throw new Error(
        "Focused lower nav item remained hidden outside the scrollport",
      );
    }
    evidence.keyboard.push("focused-item-scrolls-into-view");

    await page.getByRole("button", { name: "Reembolsos", exact: true }).click();
    await page.waitForURL((url) => url.hash === "#financial", {
      timeout: 5000,
    });
    await page
      .locator('#main-nav [data-shell-key="refunds"][aria-current="page"]')
      .waitFor({ state: "visible", timeout: 5000 });
    const currentLabels = await page
      .locator('.nav-item[aria-current="page"]')
      .allTextContents();
    if (
      currentLabels.length !== 1 ||
      currentLabels[0].trim() !== "Reembolsos"
    ) {
      throw new Error(
        `Alias active state is incorrect: ${JSON.stringify(currentLabels)}`,
      );
    }
    await page.getByRole("heading", { name: "Financeiro" }).waitFor();
    evidence.keyboard.push("alias-route-active-state");

    await sidebarNav
      .getByRole("button", { name: "Visão Global", exact: true })
      .click();
    await page.getByRole("heading", { name: "Visão Geral" }).waitFor();

    await page.keyboard.press("Control+K");
    if (
      !(await page
        .locator("#global-search")
        .evaluate((node) => node === document.activeElement))
    ) {
      throw new Error("Ctrl+K did not focus UniversalSearch");
    }
    evidence.keyboard.push("ctrl-k-search");

    const destinationSelector = page.locator("#destination-selector");
    await destinationSelector.waitFor({ state: "visible" });
    const currentDestination = await destinationSelector.inputValue();
    if (!currentDestination) {
      throw new Error(
        "DestinationSelector has no readable current destination",
      );
    }
    await destinationSelector.evaluate((node) => {
      node.dispatchEvent(new Event("change", { bubbles: true }));
    });
    if (
      (await page.locator("#global-scope").getAttribute("aria-pressed")) !==
      "false"
    ) {
      throw new Error("Destination selection did not leave Global scope");
    }
    await page.locator("#global-scope").click();
    if (
      (await page.locator("#global-scope").getAttribute("aria-pressed")) !==
      "true"
    ) {
      throw new Error("Global scope did not become visually explicit");
    }
    evidence.keyboard.push("destination-context-global-toggle");

    for (const viewport of viewports) {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await page.waitForTimeout(80);

      const geometry = await page.evaluate(() => {
        const sidebar = document.querySelector("#sidebar");
        const topbar = document.querySelector(".control-center-topbar");
        const destination = document.querySelector("#destination-selector");
        const profileName = document.querySelector("#profile-name");
        const destinationRect = destination?.getBoundingClientRect();
        return {
          pageOverflow:
            document.documentElement.scrollWidth >
            document.documentElement.clientWidth + 2,
          sidebarWidth: sidebar.getBoundingClientRect().width,
          topbarHeight: topbar.getBoundingClientRect().height,
          destinationVisible:
            Boolean(destinationRect) &&
            destinationRect.width > 0 &&
            destinationRect.height > 0 &&
            getComputedStyle(destination).visibility !== "hidden",
          destinationWidth: destinationRect?.width ?? 0,
          profileNameVisible: profileName
            ? getComputedStyle(profileName).display !== "none"
            : false,
        };
      });

      if (geometry.pageOverflow) {
        throw new Error(`Horizontal overflow at ${viewport.label}px`);
      }
      if (Math.abs(geometry.topbarHeight - 64) > 1) {
        throw new Error(
          `Topbar height changed at ${viewport.label}px: ${geometry.topbarHeight}`,
        );
      }
      if (!geometry.destinationVisible) {
        throw new Error(
          `Destination context disappeared at ${viewport.label}px`,
        );
      }
      if (viewport.width <= 430 && geometry.destinationWidth < 120) {
        throw new Error(
          `Destination context is too narrow at ${viewport.label}px: ${geometry.destinationWidth}`,
        );
      }
      if (viewport.width < 1200 && geometry.profileNameVisible) {
        throw new Error(
          `Tablet/mobile profile name still compresses topbar at ${viewport.label}px`,
        );
      }

      if (viewport.width >= 1440 && Math.abs(geometry.sidebarWidth - 224) > 1) {
        throw new Error(
          `Desktop sidebar width invalid at ${viewport.label}px: ${geometry.sidebarWidth}`,
        );
      }
      if (
        viewport.width >= 1200 &&
        viewport.width < 1440 &&
        (geometry.sidebarWidth < 208 || geometry.sidebarWidth > 224)
      ) {
        throw new Error(
          `Compact desktop sidebar width invalid: ${geometry.sidebarWidth}`,
        );
      }

      if (viewport.width < 1200) {
        const menu = page.locator("#menu-button");
        await menu.click();
        if ((await menu.getAttribute("aria-expanded")) !== "true") {
          throw new Error(
            `Drawer did not expose expanded state at ${viewport.label}px`,
          );
        }
        await page.locator("#sidebar").waitFor({ state: "visible" });
        if (await page.locator("#sidebar-backdrop").isHidden()) {
          throw new Error(`Drawer backdrop missing at ${viewport.label}px`);
        }
        await page.keyboard.press("Escape");
        if ((await menu.getAttribute("aria-expanded")) !== "false") {
          throw new Error(`Escape did not close drawer at ${viewport.label}px`);
        }
        if (!(await menu.evaluate((node) => node === document.activeElement))) {
          throw new Error(
            `Focus was not restored to menu trigger at ${viewport.label}px`,
          );
        }
      }

      await page.screenshot({
        path: `/tmp/control-center-shell-v1-${viewport.label}.png`,
        fullPage: false,
      });

      evidence.viewports.push({
        ...viewport,
        ...geometry,
      });
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator("#notification-button").click();
    if (await page.locator("#notification-panel").isHidden()) {
      throw new Error("Notification Center visual panel did not open");
    }
    await page.keyboard.press("Escape");
    await page.locator("#profile-button").click();
    if (await page.locator("#user-menu-panel").isHidden()) {
      throw new Error("User Menu visual panel did not open");
    }

    if (pageErrors.length) {
      throw new Error(`Browser page errors: ${JSON.stringify(pageErrors)}`);
    }

    writeFileSync(
      "/tmp/control-center-shell-v1-evidence.json",
      JSON.stringify(evidence, null, 2),
    );
    await context.close();
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error("Control Center Shell V1 browser contract failed");
  process.exit(1);
});
