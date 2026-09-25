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

  await page.getByRole("tab", { name: "Produtos" }).click();

  let productForm = page.locator('[data-business-catalog-kind="product"]');
  await productForm.locator('[name="name"]').fill("Passeio Sunset Browser");
  await productForm
    .locator('[name="description"]')
    .fill("Produto canônico criado no navegador");
  await productForm.locator('[name="tags"]').fill("sunset, passeio");
  await productForm.getByRole("button", { name: "Criar product draft" }).click();
  await page.getByText("Draft salvo no catálogo canônico.").waitFor();

  let productEdit = page.locator('[data-business-catalog-edit="product"]').first();
  const productId = await productEdit.getAttribute("data-business-catalog-id");
  assert.ok(productId);
  await productEdit.click();
  productForm = page.locator('[data-business-catalog-kind="product"]');
  await productForm.locator('[name="status"]').selectOption("active");
  await productForm.getByRole("button", { name: "Salvar alterações" }).click();
  await page.getByText(/Alteração salva como revisão editável/u).waitFor();

  let offerForm = page.locator('[data-business-catalog-kind="offer"]');
  await offerForm.locator('[name="productId"]').selectOption(productId);
  await offerForm.locator('[name="price"]').fill("120,00");
  await offerForm.locator('[name="capacity"]').fill("25");
  await offerForm.getByRole("button", { name: "Criar offer draft" }).click();
  await page.getByText("Draft salvo no catálogo canônico.").waitFor();

  let offerEdit = page.locator('[data-business-catalog-edit="offer"]').first();
  const offerId = await offerEdit.getAttribute("data-business-catalog-id");
  assert.ok(offerId);
  await offerEdit.click();
  offerForm = page.locator('[data-business-catalog-kind="offer"]');
  await offerForm.locator('[name="status"]').selectOption("active");
  await offerForm.getByRole("button", { name: "Salvar alterações" }).click();
  await page.getByText(/Alteração salva como revisão editável/u).waitFor();

  let menuForm = page.locator('[data-business-catalog-kind="menu"]');
  await menuForm.locator('[name="name"]').fill("Cardápio Browser");
  await menuForm.locator('[name="description"]').fill("Menu canônico");
  await menuForm.getByRole("button", { name: "Criar menu draft" }).click();
  await page.getByText("Draft salvo no catálogo canônico.").waitFor();

  let menuEdit = page.locator('[data-business-catalog-edit="menu"]').first();
  const menuId = await menuEdit.getAttribute("data-business-catalog-id");
  assert.ok(menuId);
  await menuEdit.click();
  menuForm = page.locator('[data-business-catalog-kind="menu"]');
  await menuForm.locator('[name="status"]').selectOption("active");
  await menuForm.getByRole("button", { name: "Salvar alterações" }).click();
  await page.getByText(/Alteração salva como revisão editável/u).waitFor();

  let categoryForm = page.locator(
    '[data-business-catalog-kind="menu-category"]',
  );
  await categoryForm.locator('[name="menuId"]').selectOption(menuId);
  await categoryForm.locator('[name="name"]').fill("Experiências");
  await categoryForm.getByRole("button", { name: "Criar categoria" }).click();
  await page.getByText("Draft salvo no catálogo canônico.").waitFor();

  const categoryEdit = page
    .locator('[data-business-catalog-edit="menu-category"]')
    .first();
  const categoryId = await categoryEdit.getAttribute("data-business-catalog-id");
  assert.ok(categoryId);

  let itemForm = page.locator('[data-business-catalog-kind="menu-item"]');
  await itemForm.locator('[name="menuId"]').selectOption(menuId);
  await itemForm.locator('[name="categoryId"]').selectOption(categoryId);
  await itemForm.locator('[name="name"]').fill("Experiência Morro");
  await itemForm.locator('[name="description"]').fill("Item browser");
  await itemForm.locator('[name="price"]').fill("45,00");
  await itemForm.getByRole("button", { name: "Criar item draft" }).click();
  await page.getByText("Draft salvo no catálogo canônico.").waitFor();

  let itemEdit = page.locator('[data-business-catalog-edit="menu-item"]').first();
  const itemId = await itemEdit.getAttribute("data-business-catalog-id");
  assert.ok(itemId);
  await itemEdit.click();
  itemForm = page.locator('[data-business-catalog-kind="menu-item"]');
  await itemForm.locator('[name="available"]').check();
  await itemForm.getByRole("button", { name: "Salvar alterações" }).click();
  await page.getByText(/Alteração salva como revisão editável/u).waitFor();

  await page.getByRole("tab", { name: "Publicação" }).click();
  await page.getByRole("button", { name: "Solicitar revisão" }).click();
  await page.getByRole("button", { name: "Publicar revisão" }).waitFor();
  await page.getByRole("button", { name: "Publicar revisão" }).click();
  await page.getByText("Published", { exact: true }).first().waitFor();

  const detail = await context.request.get(
    `${origin}/api/places/v1/place-${businessId}`,
  );
  assert.equal(detail.status(), 200, await detail.text());
  const publicDetail = await detail.json();
  assert.equal(publicDetail.profile.name, "Empresa browser");
  assert.equal(publicDetail.commerce.offers[0].id, offerId);
  assert.equal(publicDetail.commerce.offers[0].productId, productId);
  assert.equal(publicDetail.commerce.menu.id, menuId);
  assert.equal(
    publicDetail.commerce.menu.categories[0].items[0].id,
    itemId,
  );

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
