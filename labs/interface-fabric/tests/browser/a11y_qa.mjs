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
const ids = [
  "IF-PUB-006",
  "IF-PUB-010",
  "IF-COM-004",
  "IF-AFF-005",
  "IF-BIZ-003",
  "IF-CRM-001",
  "IF-CTL-001",
  "IF-GRW-001",
];
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
      nodes: v.nodes.length,
    });
  await page.close();
}
await browser.close();
assert.deepEqual(violations, []);
console.log("A11Y_AXE_PASS");
