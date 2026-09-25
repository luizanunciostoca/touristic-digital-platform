import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("/tmp/pw/node_modules/playwright");
const origin = "http://127.0.0.1:4198";
const password = "cms browser fixture password";
const businessId = `cms-browser-${Date.now()}`;

async function login(context, email) {
  const response = await context.request.post(
    `${origin}/api/dashboard/auth/login`,
    {
      headers: { Origin: origin, "Content-Type": "application/json" },
      data: { email, password },
    },
  );
  assert.equal(response.status(), 200, await response.text());
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  await login(context, "cms-admin@example.invalid");
  const page = await context.newPage();
  await page.goto(`${origin}/apps/control-center/public/index.html#businesses`);
  await page.locator("#business-cms-filter-form").waitFor();
  assert.equal(
    await page.getByText("Business CMS aguardando composição:").count(),
    0,
  );

  await page.getByRole("button", { name: /Nova empresa/u }).click();
  const wizard = page.locator("#business-cms-create-form");
  await wizard.locator('[name="name"]').fill("Empresa browser");
  await wizard.locator('[name="businessId"]').fill(businessId);
  await wizard.locator('[name="categoryId"]').selectOption("attractions");
  await wizard
    .locator('[name="destinationId"]')
    .selectOption("morro-de-sao-paulo");
  await wizard.locator('[name="shortDescription"]').fill("Experiência real");
  await wizard.getByRole("button", { name: "Criar draft" }).click();
  await page.getByRole("tab", { name: "Perfil" }).waitFor();
  assert.ok(page.url().includes(`#businesses:${businessId}`));

  await page.getByRole("tab", { name: "Perfil" }).click();
  await page.locator("#business-cms-profile-form").waitFor();
  const profile = page.locator("#business-cms-profile-form");
  await profile
    .locator('[name="description"]')
    .fill("Descrição publicada no teste browser");
  await profile.getByRole("button", { name: "Salvar perfil" }).click();
  await page.getByText("Perfil salvo como revisão editável.").waitFor();

  await page.getByRole("tab", { name: "Localização" }).click();
  const location = page.locator("#business-cms-location-form");
  await location.locator('[name="address"]').fill("Morro de São Paulo");
  await location.locator('[name="latitude"]').fill("-13.3833");
  await location.locator('[name="longitude"]').fill("-38.9167");
  await location.getByRole("button", { name: "Confirmar localização" }).click();
  await page.getByText("Localização salva como revisão editável.").waitFor();

  await page.getByRole("tab", { name: "Publicação" }).click();
  await page.getByRole("button", { name: "Solicitar revisão" }).click();
  await page.getByRole("button", { name: "Publicar revisão" }).waitFor();
  await page.getByRole("button", { name: "Publicar revisão" }).click();
  await page.getByText("Published", { exact: true }).first().waitFor();

  const detail = await context.request.get(
    `${origin}/api/places/v1/place-${businessId}`,
  );
  assert.equal(detail.status(), 200, await detail.text());
  assert.equal((await detail.json()).profile.name, "Empresa browser");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(
    `${origin}/apps/control-center/public/index.html#businesses:${businessId}`,
  );
  await page.getByRole("tab", { name: "Perfil" }).waitFor();
  assert.equal((await page.getByText("Empresa browser").count()) > 0, true);

  const denied = await browser.newContext();
  await login(denied, "cms-business-owner@example.invalid");
  const forbidden = await denied.request.get(
    `${origin}/api/admin/v1/businesses/cms`,
  );
  assert.equal(forbidden.status(), 403, await forbidden.text());
  await denied.close();
  await context.close();
  process.stdout.write("Business CMS browser + HTTP acceptance: PASS\n");
} finally {
  await browser.close();
}
