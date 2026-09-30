import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const playwrightPath =
  process.env.IF_PLAYWRIGHT_PATH ?? "/tmp/pw/node_modules/playwright";
const axePath =
  process.env.IF_AXE_PATH ?? "/tmp/pw/node_modules/axe-core/axe.min.js";
const { chromium } = require(playwrightPath);
const { readFile } = await import("node:fs/promises");
const axeSource = await readFile(axePath, "utf8");
const base =
  process.env.IF_BASE_URL || "http://127.0.0.1:4173/labs/interface-fabric";
const manifest = JSON.parse(\n  await readFile(new URL("../../manifest/interfaces.json", import.meta.url), "utf8"),\n);\nconst ids = manifest.map(({ id }) => id);
const browser = await chromium.launch({ headless: true });
const violations = [];
for (const id of ids) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${base}/interfaces/${id}.html`, {
    waitUntil: "networkidle",
  });
  await page.addScriptTag({ content: axeSource });
  const result = await page.evaluate(
    async () =>
      await axe.run(document, {
        runOnly: {
          type: "tag",
          values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
        },
      }),
  );
  for (const v of result.violations)
    violations.push({
      id,
      rule: v.id,
      impact: v.impact,
      nodes: v.nodes.map((node) => ({
        target: node.target,
        html: node.html,
        failureSummary: node.failureSummary,
      })),
    });
  await page.close();
}
await browser.close();
assert.deepEqual(violations, []);
console.log("A11Y_AXE_PASS");
