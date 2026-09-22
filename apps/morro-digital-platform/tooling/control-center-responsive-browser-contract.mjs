import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("/tmp/pw/node_modules/playwright");

const origin = "http://127.0.0.1:4194";
const evidencePath = "/tmp/control-center-responsive-evidence.json";
const authStatePath = "/tmp/control-center-a11y-auth-state.json";

const viewports = [
  { width: 1440, height: 900, label: "1440x900" },
  { width: 1280, height: 800, label: "1280x800" },
  { width: 1024, height: 768, label: "1024x768" },
  { width: 768, height: 1024, label: "768x1024" },
  { width: 430, height: 932, label: "430x932" },
  { width: 390, height: 844, label: "390x844" },
];

const landscapeViewport = {
  width: 844,
  height: 390,
  label: "844x390-landscape",
};

function persist(evidence) {
  writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
}

async function assertNoDocumentOverflow(page, label) {
  const layout = await page.evaluate(() => ({
    rootClient: document.documentElement.clientWidth,
    rootScroll: document.documentElement.scrollWidth,
    bodyClient: document.body.clientWidth,
    bodyScroll: document.body.scrollWidth,
    overflowing: [...document.querySelectorAll("body *")]
      .filter((node) => {
        if (!(node instanceof HTMLElement) || node.hidden) return false;
        const rect = node.getBoundingClientRect();
        return (
          rect.right > document.documentElement.clientWidth + 2 ||
          rect.left < -2
        );
      })
      .slice(0, 12)
      .map((node) => ({
        tag: node.tagName,
        id: node.id,
        className: node.className,
        text: node.textContent?.trim().slice(0, 80) ?? "",
        rect: node.getBoundingClientRect().toJSON(),
      })),
  }));
  if (
    layout.rootScroll > layout.rootClient + 2 ||
    layout.bodyScroll > layout.bodyClient + 2
  ) {
    throw new Error(`DOCUMENT_OVERFLOW:${label}:${JSON.stringify(layout)}`);
  }
  return layout;
}

async function waitForView(page, view, detail = "") {
  const hash = detail ? `#${view}:${encodeURIComponent(detail)}` : `#${view}`;
  await page.evaluate((nextHash) => {
    location.hash = nextHash;
  }, hash);
  await page.waitForURL((url) => url.hash === hash, { timeout: 30_000 });
  await page
    .locator(`#content[data-rendered-view="${view}"][aria-busy="false"]`)
    .waitFor({ state: "attached", timeout: 30_000 });
}

async function assertTableContract(page, label) {
  const tables = await page.locator(".table-wrap").evaluateAll((wraps) =>
    wraps.map((wrap) => {
      const table = wrap.querySelector("table");
      return {
        tabIndex: wrap.tabIndex,
        role: wrap.getAttribute("role"),
        ariaLabel: wrap.getAttribute("aria-label"),
        clientWidth: wrap.clientWidth,
        scrollWidth: wrap.scrollWidth,
        headings: [...(table?.querySelectorAll("thead th") ?? [])].map(
          (th) => ({
            text: th.textContent?.trim() ?? "",
            scope: th.getAttribute("scope"),
          }),
        ),
      };
    }),
  );
  if (!tables.length) throw new Error(`TABLE_MISSING:${label}`);
  for (const table of tables) {
    if (table.tabIndex < 0 || table.role !== "region" || !table.ariaLabel) {
      throw new Error(
        `TABLE_REGION_NOT_ACCESSIBLE:${label}:${JSON.stringify(table)}`,
      );
    }
    if (table.headings.some((heading) => heading.scope !== "col")) {
      throw new Error(
        `TABLE_HEADER_SCOPE_MISSING:${label}:${JSON.stringify(table)}`,
      );
    }
  }
  return tables;
}

async function assertFocusVisible(page, selector, label) {
  await page.keyboard.press("Control+K");
  const focus = await page.locator(selector).evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      active: node === document.activeElement,
      focusVisible: node.matches(":focus-visible"),
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      outlineColor: style.outlineColor,
    };
  });
  if (
    !focus.active ||
    !focus.focusVisible ||
    focus.outlineStyle === "none" ||
    focus.outlineWidth === "0px"
  ) {
    throw new Error(`FOCUS_NOT_VISIBLE:${label}:${JSON.stringify(focus)}`);
  }
  return focus;
}

async function assertTouchTargets(page, selectors, label) {
  const failures = [];
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (!(await locator.isVisible().catch(() => false))) continue;
    const box = await locator.boundingBox();
    if (!box) continue;
    if (box.height < 43.5 || box.width < 43.5) {
      failures.push({ selector, width: box.width, height: box.height });
    }
  }
  if (failures.length) {
    throw new Error(
      `TOUCH_TARGET_TOO_SMALL:${label}:${JSON.stringify(failures)}`,
    );
  }
}

async function waitForDrawerOpen(page, timeoutMs = 2_000) {
  const sidebar = page.locator("#sidebar");
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const box = await sidebar.boundingBox();
    if (box && box.x >= -2) return box;
    await page.waitForTimeout(25);
  }
  throw new Error("DRAWER_OPEN_TIMEOUT");
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const evidence = {
    viewports: [],
    supportBanner: [],
    landscape: null,
    dialogs: "not-applicable-no-dialog-surface",
  };
  let context = null;

  try {
    if (!existsSync(authStatePath)) {
      throw new Error("AUTH_STORAGE_STATE_MISSING");
    }
    context = await browser.newContext({
      viewport: viewports[0],
      storageState: authStatePath,
    });
    unlinkSync(authStatePath);
    const page = await context.newPage();
    const runtimeErrors = [];
    page.on("pageerror", (error) => runtimeErrors.push(error.message));

    await page.goto(
      `${origin}/apps/control-center/public/index.html#overview`,
      {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      },
    );
    await page.locator("#app:not([hidden])").waitFor({ timeout: 15_000 });
    await page
      .locator('#content[data-rendered-view="overview"][aria-busy="false"]')
      .waitFor({ state: "attached", timeout: 15_000 });
    await page
      .locator(".kpi-grid .metric-card")
      .first()
      .waitFor({ state: "visible", timeout: 15_000 });

    // Support Mode banner is validated with deliberately long text before the
    // regular responsive matrix, then closed so the remaining surfaces run in
    // the normal PLATFORM_OWNER context.
    await waitForView(page, "support");
    await page.locator("#support-user").selectOption("business-owner-1");
    await page
      .locator("#support-reason")
      .fill(
        "Validação responsiva e acessível do banner de suporte com contexto administrativo deliberadamente longo para comprovar quebra segura de texto sem overflow horizontal.",
      );
    await page.getByRole("button", { name: "Entrar em modo suporte" }).click();
    await page
      .locator("#support-banner:not([hidden])")
      .waitFor({ state: "visible", timeout: 15_000 });

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      const layout = await assertNoDocumentOverflow(
        page,
        `support-${viewport.label}`,
      );
      const banner = await page.locator("#support-banner").boundingBox();
      if (
        !banner ||
        banner.x < -1 ||
        banner.x + banner.width > viewport.width + 1
      ) {
        throw new Error(
          `SUPPORT_BANNER_OUT_OF_BOUNDS:${viewport.label}:${JSON.stringify(banner)}`,
        );
      }
      evidence.supportBanner.push({ ...viewport, layout, banner });
    }

    await page.getByRole("button", { name: "Encerrar modo suporte" }).click();
    await page
      .locator("#support-banner")
      .waitFor({ state: "hidden", timeout: 15_000 });

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await waitForView(page, "overview");
      await page
        .locator(".kpi-grid .metric-card")
        .first()
        .waitFor({ timeout: 15_000 });

      if ((await page.locator(".quick-actions").count()) !== 0) {
        throw new Error(`QUICK_ACTIONS_REINTRODUCED:${viewport.label}`);
      }
      if (
        (await page
          .locator(
            "[data-assistant-floating], .assistant-floating, .assistant-fab",
          )
          .count()) !== 0
      ) {
        throw new Error(`FLOATING_ASSISTANT_REINTRODUCED:${viewport.label}`);
      }

      const shell = await page.evaluate(() => ({
        sidebarVisible:
          getComputedStyle(document.querySelector("#sidebar")).display !==
          "none",
        topbar:
          document.querySelector(".topbar")?.getBoundingClientRect().toJSON() ??
          null,
        destination:
          document
            .querySelector("#destination-selector")
            ?.getBoundingClientRect()
            .toJSON() ?? null,
        search:
          document
            .querySelector("#global-search")
            ?.getBoundingClientRect()
            .toJSON() ?? null,
      }));
      if (!shell.topbar || !shell.destination || !shell.search) {
        throw new Error(
          `SHELL_SURFACE_MISSING:${viewport.label}:${JSON.stringify(shell)}`,
        );
      }

      await assertFocusVisible(
        page,
        "#global-search",
        `search-${viewport.label}`,
      );
      await page.locator("#global-search").fill("business-owner@example.com");
      await page
        .locator("#search-results:not([hidden])")
        .waitFor({ state: "visible", timeout: 15_000 });
      await page.keyboard.press("ArrowDown");
      const activeDescendant = await page
        .locator("#global-search")
        .getAttribute("aria-activedescendant");
      if (!activeDescendant)
        throw new Error(
          `SEARCH_KEYBOARD_ACTIVE_DESCENDANT_MISSING:${viewport.label}`,
        );
      await page.keyboard.press("Escape");
      if (!(await page.locator("#search-results").isHidden())) {
        throw new Error(`SEARCH_ESCAPE_FAILED:${viewport.label}`);
      }

      if (viewport.width <= 900) {
        await page.locator("#menu-button").click();
        if (
          (await page.locator("#menu-button").getAttribute("aria-expanded")) !==
          "true"
        ) {
          throw new Error(`DRAWER_ARIA_STATE_FAILED:${viewport.label}`);
        }
        const sidebar = await waitForDrawerOpen(page);
        if (
          !sidebar ||
          sidebar.x < -2 ||
          sidebar.x + sidebar.width > viewport.width + 2
        ) {
          throw new Error(
            `DRAWER_OUT_OF_BOUNDS:${viewport.label}:${JSON.stringify(sidebar)}`,
          );
        }
        await page.keyboard.press("Escape");
        if (
          (await page.locator("#menu-button").getAttribute("aria-expanded")) !==
          "false"
        ) {
          throw new Error(`DRAWER_ESCAPE_FAILED:${viewport.label}`);
        }
        if (
          !(await page
            .locator("#menu-button")
            .evaluate((node) => node === document.activeElement))
        ) {
          throw new Error(`DRAWER_FOCUS_RETURN_FAILED:${viewport.label}`);
        }
        await assertTouchTargets(
          page,
          [
            "#menu-button",
            ".destination-control",
            "#global-search",
            "#notification-button",
            "#profile-button",
          ],
          viewport.label,
        );
      }

      await waitForView(page, "users");
      const userTables = await assertTableContract(
        page,
        `users-${viewport.label}`,
      );
      await assertNoDocumentOverflow(page, `users-${viewport.label}`);

      await waitForView(page, "users", "business-owner-1");
      await page
        .locator(".entity-header[data-ux-v1]")
        .waitFor({ timeout: 15_000 });
      const criticalForms = await page
        .locator("form[data-critical-action=true]")
        .count();
      if (criticalForms < 2) {
        throw new Error(
          `CRITICAL_ACTION_AFFORDANCE_MISSING:${viewport.label}:${criticalForms}`,
        );
      }
      await assertTableContract(page, `user-360-${viewport.label}`);
      await assertNoDocumentOverflow(page, `user-360-${viewport.label}`);

      await waitForView(page, "businesses", "toca-do-morcego");
      await page
        .locator(".entity-header[data-ux-v1]")
        .waitFor({ timeout: 15_000 });
      await assertNoDocumentOverflow(page, `business-360-${viewport.label}`);

      await waitForView(page, "financial");
      await page
        .getByRole("heading", { name: "Financeiro" })
        .waitFor({ timeout: 15_000 });
      await assertNoDocumentOverflow(page, `financial-${viewport.label}`);
      if ((await page.locator(".table-wrap").count()) > 0) {
        await assertTableContract(page, `financial-${viewport.label}`);
      }

      const screenshotPath = `/tmp/control-center-visual-${viewport.label}.png`;
      await waitForView(page, "overview");
      await page
        .locator(".kpi-grid .metric-card")
        .first()
        .waitFor({ timeout: 15_000 });
      await assertNoDocumentOverflow(page, `overview-${viewport.label}`);
      await page.screenshot({ path: screenshotPath, fullPage: true });

      evidence.viewports.push({
        ...viewport,
        shell,
        userTables,
        criticalForms,
        screenshotPath,
      });
      persist(evidence);
    }

    await page.setViewportSize(landscapeViewport);
    await waitForView(page, "overview");
    await page
      .locator(".kpi-grid .metric-card")
      .first()
      .waitFor({ timeout: 15_000 });
    const landscapeLayout = await assertNoDocumentOverflow(
      page,
      landscapeViewport.label,
    );
    await page.locator("#menu-button").click();
    const landscapeSidebar = await page.locator("#sidebar").boundingBox();
    await page.keyboard.press("Escape");
    evidence.landscape = {
      ...landscapeViewport,
      layout: landscapeLayout,
      sidebar: landscapeSidebar,
    };

    await page.emulateMedia({ reducedMotion: "reduce" });
    const reducedMotion = await page.locator("#sidebar").evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        transitionDuration: style.transitionDuration,
        animationDuration: style.animationDuration,
      };
    });
    const reducedTransitionSeconds = Number.parseFloat(
      reducedMotion.transitionDuration.split(",", 1)[0],
    );
    if (
      !Number.isFinite(reducedTransitionSeconds) ||
      reducedTransitionSeconds > 0.001
    ) {
      throw new Error(
        `REDUCED_MOTION_NOT_APPLIED:${JSON.stringify(reducedMotion)}`,
      );
    }
    evidence.reducedMotion = reducedMotion;

    const dialogs = await page.locator('dialog, [role="dialog"]').count();
    if (dialogs !== 0) {
      throw new Error(`UNEXPECTED_DIALOG_SURFACE:${dialogs}`);
    }

    if (runtimeErrors.length) {
      throw new Error(`PAGE_ERRORS:${JSON.stringify(runtimeErrors)}`);
    }

    persist(evidence);
    console.log(
      `CONTROL_CENTER_RESPONSIVE_PASS:VIEWPORTS=${evidence.viewports.length}/${viewports.length}:LANDSCAPE=PASS`,
    );
    await context.close();
    context = null;
  } finally {
    if (existsSync(authStatePath)) unlinkSync(authStatePath);
    if (context) await context.close().catch(() => {});
    await browser.close();
  }
}

main().catch((error) => {
  const failure = {
    fatal: {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : String(error),
    },
  };
  persist(failure);
  console.error(
    "CONTROL_CENTER_RESPONSIVE_FAILED",
    error instanceof Error ? error.name : "UnknownError",
  );
  process.exit(1);
});
