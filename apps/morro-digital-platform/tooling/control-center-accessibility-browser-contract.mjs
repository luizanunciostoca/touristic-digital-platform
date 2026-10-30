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

async function proveBusinessNavigation(page) {
  const listRoute = /\/api\/admin\/v1\/businesses\/cms(?:\?.*)?$/u;
  const records = [
    {
      businessId: "wp02-one",
      name: "Sambass A:B?C&D",
      destinationId: "morro",
      categoryId: "restaurants",
      publicationState: "published",
      locationStatus: "confirmed",
    },
    {
      businessId: "wp02-two",
      name: "Outra empresa",
      destinationId: "itacare",
      categoryId: "shops",
      publicationState: "draft",
      locationStatus: "missing",
    },
  ];
  const requests = [];
  let posts = 0;
  await page.route(listRoute, async (route) => {
    if (route.request().method() !== "GET") {
      posts++;
      await route.fulfill({ json: {} });
      return;
    }
    const filters = Object.fromEntries(
      new URL(route.request().url()).searchParams,
    );
    requests.push(filters);
    const businesses = records.filter((row) =>
      Object.entries(filters).every(
        ([key, value]) =>
          !value ||
          (key === "query"
            ? row.name.toLowerCase().includes(value.toLowerCase())
            : row[key] === value),
      ),
    );
    await route.fulfill({
      json: {
        filters,
        businesses,
        destinations: [
          { id: "morro", name: "Morro" },
          { id: "itacare", name: "Itacaré" },
        ],
        categories: [
          { id: "restaurants", name: "Restaurantes" },
          { id: "shops", name: "Lojas" },
        ],
      },
    });
  });
  const base = `${origin}/apps/control-center/public/index.html`;
  const ready = async (filters = {}) => {
    const keys = [
      "query",
      "destinationId",
      "categoryId",
      "publicationState",
      "locationStatus",
    ];
    const deadline = Date.now() + 15000;
    let matched = false;
    while (Date.now() < deadline) {
      await page
        .locator('#content[data-rendered-view="businesses"][aria-busy="false"]')
        .waitFor({ state: "attached", timeout: 15000 });
      const values = await Promise.all(
        keys.map((key) =>
          page
            .locator(`#business-cms-filter-form [name="${key}"]`)
            .inputValue(),
        ),
      );
      if (keys.every((key, index) => values[index] === (filters[key] ?? ""))) {
        matched = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.equal(
      matched,
      true,
      "rendered filters must match the URL without unsafe-eval",
    );
    assert.equal(
      await page
        .locator('#main-nav [data-view="businesses"][aria-current="page"]')
        .count(),
      1,
    );
    for (const [key, value] of Object.entries(filters))
      assert.equal(requests.at(-1)[key], value);
    const expected = records.filter((row) =>
      Object.entries(filters).every(
        ([key, value]) =>
          !value ||
          (key === "query"
            ? row.name.toLowerCase().includes(value.toLowerCase())
            : row[key] === value),
      ),
    );
    const names = await page
      .locator('#content a[href^="#businesses:"] strong')
      .allTextContents();
    assert.deepEqual(
      names,
      expected.map((row) => row.name),
    );
  };
  try {
    await page.goto(`${base}#businesses`);
    await ready();
    const cases = [
      { query: "Sambass" },
      { categoryId: "restaurants" },
      { destinationId: "morro" },
      { publicationState: "published" },
      { locationStatus: "confirmed" },
      {
        query: "Sambass A:B?C&D",
        categoryId: "restaurants",
        destinationId: "morro",
        publicationState: "published",
        locationStatus: "confirmed",
      },
    ];
    for (const filters of cases) {
      const form = page.locator("#business-cms-filter-form");
      await form.locator('[name="query"]').fill(filters.query ?? "");
      for (const key of [
        "categoryId",
        "destinationId",
        "publicationState",
        "locationStatus",
      ])
        await form.locator(`[name="${key}"]`).selectOption(filters[key] ?? "");
      const response = page.waitForResponse(
        (r) => listRoute.test(r.url()) && r.request().method() === "GET",
      );
      await form.getByRole("button", { name: "Aplicar filtros" }).click();
      await response;
      await ready(filters);
      assert.equal(new URL(page.url()).hash.split("?")[0], "#businesses");
    }
    const combined = cases.at(-1);
    await page.reload();
    await ready(combined);
    await page.goto(`${base}#businesses?query=Sambass`);
    await ready({ query: "Sambass" });
    await page.goBack();
    await ready(combined);
    await page.goForward();
    await ready({ query: "Sambass" });
    await page.getByRole("link", { name: "Limpar filtros" }).click();
    await ready();
    assert.equal(new URL(page.url()).hash, "#businesses");

    const invoker = page.getByRole("button", { name: /Nova empresa/u });
    const dialog = page.locator("#business-cms-wizard");
    const form = page.locator("#business-cms-create-form");
    const focusedInvoker = async () =>
      assert.equal(
        await invoker.evaluate((node) => node === document.activeElement),
        true,
      );
    for (const state of ["empty", "partial", "invalid", "valid"]) {
      for (const label of ["Fechar", "Cancelar"]) {
        await invoker.click();
        await form.evaluate((node) => {
          node.reset();
          node.elements.namedItem("name").setCustomValidity("");
        });
        if (state !== "empty")
          await form.locator('[name="name"]').fill("Empresa cancelada");
        if (state === "valid" || state === "invalid") {
          await form.locator('[name="categoryId"]').selectOption("restaurants");
          await form.locator('[name="destinationId"]').selectOption("morro");
        }
        if (state === "invalid")
          await form
            .locator('[name="name"]')
            .evaluate((node) =>
              node.setCustomValidity("Dados inválidos de teste"),
            );
        await form.getByRole("button", { name: label, exact: true }).click();
        await dialog.waitFor({ state: "hidden" });
        await focusedInvoker();
        assert.equal(posts, 0, `${label}: ${state} must not POST`);
      }
    }
    await invoker.click();
    await form.evaluate((node) => {
      node.reset();
      node.elements.namedItem("name").setCustomValidity("");
    });
    await form.getByRole("button", { name: "Criar draft" }).click();
    assert.equal(await dialog.isVisible(), true);
    assert.equal(await form.evaluate((node) => node.checkValidity()), false);
    assert.equal(posts, 0);
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    await focusedInvoker();
    assert.equal(posts, 0);
    await invoker.click();
    await form.locator('[name="name"]').fill("Draft válido isolado");
    await form.locator('[name="categoryId"]').selectOption("restaurants");
    await form.locator('[name="destinationId"]').selectOption("morro");
    await form.getByRole("button", { name: "Criar draft" }).click();
    await form.getByText("Draft criado.", { exact: true }).waitFor();
    assert.equal(posts, 1, "valid creation still uses its POST contract");
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    const integrations = page
      .locator("#main-nav")
      .getByRole("button", { name: "Integrações", exact: true });
    assert.equal(await integrations.isDisabled(), true);
    assert.ok((await integrations.textContent()).includes("Indisponível"));
    assert.equal(await integrations.getAttribute("data-shell-view"), null);
    const beforeUnavailableClick = page.url();
    await integrations.evaluate((node) => node.click());
    assert.equal(page.url(), beforeUnavailableClick);
    await page.locator('#main-nav [data-view="settings"]').click();
    await page.locator("#control-center-settings-form").waitFor();
    assert.equal(
      await page
        .locator('#main-nav [data-view="settings"][aria-current="page"]')
        .count(),
      1,
    );
    assert.ok(
      (
        await page.locator('#main-nav [data-view="settings"]').textContent()
      ).includes("Configurações"),
    );
    await page
      .getByText("estas preferências são locais a este navegador.", {
        exact: false,
      })
      .waitFor();
    return {
      view: "business-filters-cancellation-navigation",
      scope: "authenticated browser with isolated CMS responses",
      violations: [],
      filters: "PASS",
      history: "PASS",
      cancellationCases: 8,
      cancellationPosts: 0,
      validCreationPosts: 1,
      settings: "PASS",
    };
  } finally {
    await page.unroute(listRoute);
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

    stage = "business-navigation-acceptance";
    evidence.push(await proveBusinessNavigation(page));
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
