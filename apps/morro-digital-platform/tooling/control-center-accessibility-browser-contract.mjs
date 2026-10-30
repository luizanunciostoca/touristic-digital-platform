import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("/tmp/pw/node_modules/playwright");
const axePath = require.resolve("/tmp/pw/node_modules/axe-core/axe.min.js");

const origin = "http://127.0.0.1:4194";
const password = "control center browser fixture";

const evidencePath = "/tmp/control-center-accessibility-evidence.json";

function persistEvidence(evidence) {
  writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
}

async function proveKeyboardNavigation(page) {
  // Isolate UI behavior without creating records or changing server authority.
  const searchRoute = "**/api/admin/v1/search?*";
  const cmsRoute = "**/api/admin/v1/businesses/keyboard-fixture/cms";
  await page.route(searchRoute, (route) =>
    route.fulfill({
      json: {
        results: [
          {
            title: "Empresa teclado",
            type: "business",
            href: "#businesses:keyboard-fixture",
          },
          { title: "Visão geral teclado", type: "page", href: "#overview" },
        ],
      },
    }),
  );
  await page.route(cmsRoute, (route) =>
    route.fulfill({
      json: {
        businessId: "keyboard-fixture",
        profile: { name: "Empresa teclado" },
        publication: { state: "draft" },
      },
    }),
  );
  const search = page.getByRole("searchbox", { name: "Busca universal" });
  const links = page.locator("#search-results a.search-result");
  const focused = async (locator) =>
    assert.equal(
      await locator.evaluate((node) => node === document.activeElement),
      true,
    );
  const focusVisible = async (locator) =>
    assert.equal(
      await locator.evaluate((node) => {
        const style = getComputedStyle(node);
        return (
          node.matches(":focus-visible") &&
          style.outlineStyle !== "none" &&
          parseFloat(style.outlineWidth) > 0
        );
      }),
      true,
    );
  try {
    await page.keyboard.press("Control+k");
    await focused(search);
    await search.fill("teclado");
    await links.first().waitFor();
    await page.keyboard.press("Tab");
    await focused(page.getByRole("link", { name: "Empresa teclado business" }));
    await focusVisible(links.first());
    await page.keyboard.press("Enter");
    await page.waitForURL((url) => url.hash === "#businesses:keyboard-fixture");
    assert.equal(await search.inputValue(), "");
    assert.equal(await page.locator("#search-results").isVisible(), false);
    await focused(search);

    const tabs = page
      .getByRole("tablist", { name: "Administração da empresa" })
      .getByRole("tab");
    await tabs.first().waitFor();
    assert.equal(await tabs.count(), 10);
    const assertTab = async (index) => {
      await focused(tabs.nth(index));
      assert.deepEqual(
        await tabs.evaluateAll((nodes) =>
          nodes.map((node) => ({
            selected: node.getAttribute("aria-selected"),
            tabIndex: node.tabIndex,
            hidden: document.getElementById(node.getAttribute("aria-controls"))
              ?.hidden,
          })),
        ),
        Array.from({ length: 10 }, (_, i) => ({
          selected: String(i === index),
          tabIndex: i === index ? 0 : -1,
          hidden: i !== index,
        })),
      );
    };
    assert.equal(
      await tabs.evaluateAll((nodes) =>
        nodes.every(
          (node) =>
            Boolean(node.id) &&
            document
              .getElementById(node.getAttribute("aria-controls"))
              ?.getAttribute("aria-labelledby") === node.id,
        ),
      ),
      true,
    );
    await tabs.first().focus();
    await assertTab(0);
    await page.keyboard.press("ArrowLeft");
    await assertTab(9);
    await page.keyboard.press("ArrowRight");
    await assertTab(0);
    for (let index = 1; index < 10; index++) {
      await page.keyboard.press("ArrowRight");
      await assertTab(index);
    }
    await page.keyboard.press("Home");
    await assertTab(0);
    await page.keyboard.press("End");
    await assertTab(9);
    await tabs.nth(1).click();
    await assertTab(1);
    await page.keyboard.press("ArrowRight");
    await assertTab(2);
    await focusVisible(tabs.nth(2));
    await page.keyboard.press("Enter");
    await assertTab(2);
    await page.keyboard.press("Space");
    await assertTab(2);
    await page.keyboard.press("Tab");
    await focused(
      page.getByRole("tabpanel", { name: "Localização", exact: true }),
    );
    await page.keyboard.press("Shift+Tab");
    await assertTab(2);

    await page.keyboard.press("Meta+k");
    await focused(search);
    await search.fill("teclado");
    await links.first().waitFor();
    await page.keyboard.press("ArrowUp");
    await focused(links.last());
    await page.keyboard.press("ArrowDown");
    await focused(links.first());
    await page.keyboard.press("End");
    await focused(links.last());
    await page.keyboard.press("Home");
    await focused(links.first());
    await page.keyboard.press("Escape");
    await focused(search);
    assert.equal(await page.locator("#search-results").isVisible(), false);
    await search.fill("teclado novamente");
    await links.first().waitFor();
    await page.keyboard.press("ArrowDown");
    await focused(links.first());
    await links.last().click();
    await page.waitForURL((url) => url.hash === "#overview");
    assert.equal(await search.inputValue(), "");
    assert.equal(await page.locator("#search-results").isVisible(), false);
    return {
      view: "keyboard-search-and-cms-tabs",
      violations: [],
      tabCount: 10,
      keyboardAcceptance: "PASS",
    };
  } finally {
    await page.unroute(searchRoute);
    await page.unroute(cmsRoute);
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const evidence = [];
  let currentView = "__bootstrap__";
  let stage = "bootstrap";
  let page = null;
  try {
    stage = "browser-context";
    const storageStatePath =
      process.env.CONTROL_CENTER_AUTH_STORAGE_STATE ??
      "/tmp/control-center-owner-storage.json";
    const hasSharedAuthState = existsSync(storageStatePath);
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      ...(hasSharedAuthState ? { storageState: storageStatePath } : {}),
    });
    stage = "axe-register";
    await context.addInitScript({ path: axePath });
    if (!hasSharedAuthState) {
      stage = "login";
      const login = await context.request.post(
        `${origin}/api/dashboard/auth/login`,
        {
          headers: { Origin: origin, "Content-Type": "application/json" },
          data: { email: "platform-owner-a11y@example.com", password },
        },
      );
      if (login.status() !== 200) throw new Error("OWNER_LOGIN_FAILED");
    }

    stage = "page-create";
    page = await context.newPage();
    stage = "page-goto";
    await page.goto(
      `${origin}/apps/control-center/public/index.html#overview`,
      { waitUntil: "domcontentloaded", timeout: 30_000 },
    );
    stage = "app-ready";
    await page.locator("#app:not([hidden])").waitFor({ timeout: 15_000 });
    stage = "axe-ready";
    await page.waitForFunction(() => Boolean(globalThis.axe), null, {
      timeout: 10_000,
    });

    stage = "keyboard-acceptance";
    evidence.push(await proveKeyboardNavigation(page));
    persistEvidence(evidence);

    stage = "nav-discovery";
    const views = await page
      .locator("#main-nav [data-view]")
      .evaluateAll((nodes) => nodes.map((node) => node.dataset.view));

    for (const view of views) {
      currentView = view ?? "__unknown__";
      stage = "navigate";
      await page.locator(`#main-nav [data-view="${view}"]`).click();
      await page.waitForURL((url) => url.hash === `#${view}`, {
        timeout: 30_000,
      });
      await page
        .locator(`#content[data-rendered-view="${view}"][aria-busy="false"]`)
        .waitFor({ state: "attached", timeout: 30_000 });

      stage = "axe";
      const accessibility = await page.evaluate(async () => {
        const result = await globalThis.axe.run(document, {
          runOnly: {
            type: "tag",
            values: ["wcag2a", "wcag2aa", "wcag21aa"],
          },
        });
        const describe = (element) => {
          if (!(element instanceof HTMLElement)) return null;
          const style = getComputedStyle(element);
          return {
            clientWidth: element.clientWidth,
            clientHeight: element.clientHeight,
            scrollWidth: element.scrollWidth,
            scrollHeight: element.scrollHeight,
            overflowX: style.overflowX,
            overflowY: style.overflowY,
            tabIndex: element.tabIndex,
          };
        };
        return {
          layout: {
            root: describe(document.documentElement),
            body: describe(document.body),
            app: describe(document.querySelector("#app")),
            main: describe(document.querySelector(".main")),
            page: describe(document.querySelector(".page")),
            content: describe(document.querySelector("#content")),
          },
          violations: result.violations.map((violation) => ({
            id: violation.id,
            impact: violation.impact,
            help: violation.help,
            nodes: violation.nodes.slice(0, 8).map((node) => ({
              target: node.target,
              html: node.html,
              failureSummary: node.failureSummary,
            })),
          })),
        };
      });
      evidence.push({ view, ...accessibility });
      persistEvidence(evidence);
    }

    persistEvidence(evidence);

    const failures = evidence.filter((entry) => entry.violations.length > 0);
    if (failures.length) {
      throw new Error("ACCESSIBILITY_VIOLATIONS");
    }

    console.log(`CONTROL_CENTER_ACCESSIBILITY_PASS:${evidence.length}_ROUTES`);
    await context.close();
  } catch (error) {
    let runtimeState = null;
    if (page) {
      runtimeState = await page
        .evaluate(() => ({
          hash: location.hash,
          renderedView:
            document.querySelector("#content")?.dataset.renderedView ?? null,
          ariaBusy:
            document.querySelector("#content")?.getAttribute("aria-busy") ??
            null,
          contentText:
            document
              .querySelector("#content")
              ?.textContent?.trim()
              .slice(0, 500) ?? null,
          navViews: Array.from(
            document.querySelectorAll("#main-nav [data-view]"),
            (node) => node.getAttribute("data-view"),
          ),
        }))
        .catch(() => null);
    }
    evidence.push({
      view: currentView,
      stage,
      runtimeFailure: error instanceof Error ? error.name : "UnknownError",
      runtimeMessage: error instanceof Error ? error.message : String(error),
      runtimeState,
    });
    persistEvidence(evidence);
    throw error;
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(
    "CONTROL_CENTER_ACCESSIBILITY_FAILED",
    error instanceof Error ? error.name : "UnknownError",
  );
  process.exit(1);
});
