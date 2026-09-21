import { writeFileSync } from "node:fs";
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

async function main() {
  const browser = await chromium.launch({ headless: true });
  const evidence = [];
  let currentView = "__bootstrap__";
  let stage = "bootstrap";
  let page = null;
  try {
    stage = "browser-context";
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    });
    stage = "axe-register";
    await context.addInitScript({ path: axePath });
    stage = "login";
    const login = await context.request.post(
      `${origin}/api/dashboard/auth/login`,
      {
        headers: { Origin: origin, "Content-Type": "application/json" },
        data: { email: "platform-owner-a11y@example.com", password },
      },
    );
    if (login.status() !== 200) throw new Error("OWNER_LOGIN_FAILED");

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
