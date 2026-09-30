import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const playwrightPath =
  process.env.IF_PLAYWRIGHT_PATH ?? "/tmp/pw/node_modules/playwright";
const { chromium } = require(playwrightPath);
const base =
  process.env.IF_BASE_URL || "http://127.0.0.1:4173/labs/interface-fabric";
const browser = await chromium.launch({ headless: true });
const errors = [];
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  locale: "pt-BR",
  reducedMotion: "reduce",
});
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(e.message));
async function open(id, state = "populated") {
  const r = await page.goto(`${base}/interfaces/${id}.html?state=${state}`, {
    waitUntil: "networkidle",
  });
  assert.ok(r?.ok(), id);
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
const trigger = page.getByRole("button", { name: "Abrir" }).first();
await trigger.focus();
await trigger.click();
const dialog = page.locator("#fabric-dialog");
await assert.equal(await dialog.evaluate((el) => el.open), true);
await page.keyboard.press("Escape");
await assert.equal(await dialog.evaluate((el) => el.open), false);
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
