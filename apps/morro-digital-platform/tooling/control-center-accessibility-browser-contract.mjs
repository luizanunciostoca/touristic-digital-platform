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
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      // Axe is injected only by this headless audit harness. Keep the product CSP
      // unchanged and bypass it solely inside Playwright so the audit can run.
      bypassCSP: true,
    });
    const login = await context.request.post(
      `${origin}/api/dashboard/auth/login`,
      {
        headers: { Origin: origin, "Content-Type": "application/json" },
        data: { email: "platform-owner-a11y@example.com", password },
      },
    );
    if (login.status() !== 200) throw new Error("OWNER_LOGIN_FAILED");

    const page = await context.newPage();
    await page.goto(
      `${origin}/apps/control-center/public/index.html#overview`,
      { waitUntil: "domcontentloaded", timeout: 30_000 },
    );
    await page.locator("#app:not([hidden])").waitFor({ timeout: 15_000 });
    await page.addScriptTag({ path: axePath });

    const views = await page
      .locator("#main-nav [data-view]")
      .evaluateAll((nodes) => nodes.map((node) => node.dataset.view));

    for (const view of views) {
      currentView = view ?? "__unknown__";
      stage = "navigate";
      await page.evaluate((target) => {
        location.hash = `#${target}`;
      }, view);
      await page.waitForFunction(
        (target) =>
          location.hash === `#${target}` &&
          !document
            .querySelector("#content")
            ?.textContent?.includes("Carregando"),
        view,
        { timeout: 15_000 },
      );

      stage = "axe";
      const violations = await page.evaluate(async () => {
        const result = await globalThis.axe.run(document, {
          runOnly: {
            type: "tag",
            values: ["wcag2a", "wcag2aa", "wcag21aa"],
          },
        });
        return result.violations.map((violation) => ({
          id: violation.id,
          impact: violation.impact,
          help: violation.help,
          nodes: violation.nodes.slice(0, 8).map((node) => node.target),
        }));
      });
      evidence.push({ view, violations });
      persistEvidence(evidence);
    }

    persistEvidence(evidence);

    const failures = evidence.filter((entry) => entry.violations.length > 0);
    if (failures.length) {
      console.error(
        "CONTROL_CENTER_ACCESSIBILITY_VIOLATIONS",
        JSON.stringify(failures, null, 2),
      );
      throw new Error("ACCESSIBILITY_VIOLATIONS");
    }

    console.log(`CONTROL_CENTER_ACCESSIBILITY_PASS:${evidence.length}_ROUTES`);
    await context.close();
  } catch (error) {
    evidence.push({
      view: currentView,
      stage,
      runtimeFailure: error instanceof Error ? error.name : "UnknownError",
      runtimeMessage: error instanceof Error ? error.message : String(error),
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
    error instanceof Error ? `${error.name}: ${error.message}` : String(error),
  );
  process.exit(1);
});
