import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const playwrightPath =
  process.env.IF_PLAYWRIGHT_PATH ?? "/tmp/pw/node_modules/playwright";
const { chromium } = require(playwrightPath);
const base =
  process.env.IF_BASE_URL || "http://127.0.0.1:4173/labs/interface-fabric";
const manifest = JSON.parse(
  await readFile(
    new URL("../../manifest/interfaces.json", import.meta.url),
    "utf8",
  ),
);

const browser = await chromium.launch({ headless: true });
const errors = [];
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  locale: "pt-BR",
  reducedMotion: "reduce",
});
const page = await context.newPage();
page.on("pageerror", (error) => errors.push(error.message));

async function open(id, state = "populated") {
  const response = await page.goto(
    `${base}/interfaces/${id}.html?state=${state}`,
    { waitUntil: "networkidle" },
  );
  assert.ok(response?.ok(), id);
}

for (const { id } of manifest) {
  await open(id);
  assert.equal(
    await page.locator("body").getAttribute("data-interface-id"),
    id,
  );
  assert.ok(await page.locator("#main-content").isVisible(), id);
  const layout = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  assert.ok(
    layout.scrollWidth <= layout.clientWidth + 1,
    `${id}: page-level horizontal overflow ${layout.scrollWidth} > ${layout.clientWidth}`,
  );
}

await open("IF-PUB-006");
assert.ok(await page.locator(".map-canvas").isVisible());
await page.getByRole("button", { name: "Explorar" }).click();
await page.waitForURL(/IF-PUB-008\.html/);

await open("IF-PUB-014");
await page.locator("#composer-input").fill("Quero uma rota");
await page.getByRole("button", { name: "Enviar" }).click();
await page.getByText("Resposta de fixture").waitFor();

await open("IF-COM-004");
await page.locator("input[name=date]").fill("2026-10-11");
await page.locator("input[name=quantity]").fill("2");
await page
  .locator("form[data-demo-form]")
  .getByRole("button", { name: "Continuar" })
  .click();
await page.getByText("Nenhum backend real foi alterado").waitFor();

await open("IF-PUB-009");
const trigger = page.locator('[data-action="dialog"]').first();
await trigger.focus();
await trigger.click();
const dialog = page.locator("#fabric-dialog");
await page.waitForTimeout(50);
if (!(await dialog.evaluate((element) => element.open))) {
  throw new Error(
    `DIALOG_NOT_OPEN action=${await trigger.getAttribute("data-action")} pageErrors=${JSON.stringify(errors)}`,
  );
}
await page.keyboard.press("Escape");
assert.equal(await dialog.evaluate((element) => element.open), false);

await open("IF-PUB-006", "offline");
await page.getByRole("status").or(page.getByRole("alert")).first().waitFor();

await open("IF-PUB-006");
await page.locator("#locale-select").selectOption("he");
await page.waitForLoadState("networkidle");
assert.equal(await page.locator("html").getAttribute("dir"), "rtl");

assert.deepEqual(errors, []);
await context.close();
await browser.close();
console.log("FUNCTIONAL_BROWSER_PASS");
