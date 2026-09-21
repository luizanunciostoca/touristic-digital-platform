import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("/tmp/pw/node_modules/playwright");
const axePath = require.resolve("/tmp/pw/node_modules/axe-core/axe.min.js");

const origin = "http://127.0.0.1:4194";
const password = "control center browser fixture";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const evidence = [];
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    });
    const login = await context.request.post(
      `${origin}/api/dashboard/auth/login`,
      {
        headers: { Origin: origin, "Content-Type": "application/json" },
        data: { email: "platform-owner@example.com", password },
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
    }

    writeFileSync(
      "/tmp/control-center-accessibility-evidence.json",
      JSON.stringify(evidence, null, 2),
    );

    const failures = evidence.filter((entry) => entry.violations.length > 0);
    if (failures.length) {
      throw new Error(
        `CONTROL_CENTER_ACCESSIBILITY_FAILED:${JSON.stringify(failures)}`,
      );
    }

    console.log(
      `CONTROL_CENTER_ACCESSIBILITY_PASS:${evidence.length}_ROUTES`,
    );
    await context.close();
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
