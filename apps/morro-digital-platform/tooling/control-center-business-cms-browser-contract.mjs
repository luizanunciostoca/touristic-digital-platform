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

  const crossDestination = await context.request.post(
    `${origin}/api/admin/v1/businesses/${businessId}/cms/products`,
    {
      headers: { "Content-Type": "application/json" },
      data: {
        productId: `cross-destination-${businessId}`,
        businessId,
        placeId: `place-${businessId}`,
        destinationId: "other-destination",
        name: "Blocked product",
        description: "must not cross destination",
        status: "active",
        tags: [],
      },
    },
  );
  assert.equal(crossDestination.status(), 403, await crossDestination.text());

  await page.getByRole("tab", { name: "Produtos" }).click();
  let product = page.locator("#business-cms-product-form");
  await product.locator('[name="productId"]').fill(`product-${businessId}`);
  await product.locator('[name="name"]').fill("Passeio Sunset");
  await product.locator('[name="description"]').fill("Produto browser canônico");
  await product.locator('[name="tags"]').fill("sunset, passeio");
  await product.locator('[name="status"]').selectOption("active");
  await product.getByRole("button", { name: "Salvar produto" }).click();
  await page
    .getByText(/Catálogo salvo como estado editável/u)
    .waitFor();

  const invalidOfferRelation = await context.request.post(
    `${origin}/api/admin/v1/businesses/${businessId}/cms/offers`,
    {
      headers: { "Content-Type": "application/json" },
      data: {
        offerId: `invalid-offer-${businessId}`,
        productId: `missing-product-${businessId}`,
        priceMinorUnits: 1000,
        currency: "BRL",
        status: "active",
      },
    },
  );
  assert.equal(invalidOfferRelation.status(), 404, await invalidOfferRelation.text());

  let offer = page.locator("#business-cms-offer-form");
  await offer.locator('[name="offerId"]').fill(`offer-${businessId}`);
  await offer.locator('[name="productId"]').selectOption(`product-${businessId}`);
  await offer.locator('[name="priceMinorUnits"]').fill("12000");
  await offer.locator('[name="currency"]').fill("BRL");
  await offer.locator('[name="status"]').selectOption("active");
  await offer.getByRole("button", { name: "Salvar oferta" }).click();
  await page
    .getByText(/Catálogo salvo como estado editável/u)
    .waitFor();

  let menu = page.locator("#business-cms-menu-form");
  await menu.locator('[name="menuId"]').fill(`menu-${businessId}`);
  await menu.locator('[name="name"]').fill("Cardápio Browser");
  await menu.locator('[name="description"]').fill("Cardápio canônico");
  await menu.locator('[name="status"]').selectOption("active");
  await menu.getByRole("button", { name: "Salvar menu" }).click();
  await page
    .getByText(/Catálogo salvo como estado editável/u)
    .waitFor();

  let category = page.locator("#business-cms-category-form");
  await category.locator('[name="menuId"]').selectOption(`menu-${businessId}`);
  await category
    .locator('[name="categoryId"]')
    .fill(`category-${businessId}`);
  await category.locator('[name="name"]').fill("Experiências");
  await category.locator('[name="sortOrder"]').fill("0");
  await category.getByRole("button", { name: "Salvar categoria" }).click();
  await page.getByText("Categoria salva no catálogo editável.").waitFor();

  let item = page.locator("#business-cms-item-form");
  await item.locator('[name="menuId"]').selectOption(`menu-${businessId}`);
  await item
    .locator('[name="categoryId"]')
    .selectOption(`category-${businessId}`);
  await item.locator('[name="itemId"]').fill(`item-${businessId}`);
  await item.locator('[name="name"]').fill("Experiência Morro");
  await item.locator('[name="description"]').fill("Item browser");
  await item.locator('[name="priceMinorUnits"]').fill("4500");
  await item.locator('[name="currency"]').fill("BRL");
  await item.locator('[name="sortOrder"]').fill("0");
  await item.getByRole("button", { name: "Salvar item" }).click();
  await page.getByText("Item salvo no catálogo editável.").waitFor();

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
  assert.equal(publicDetail.commerce.offers[0].productId, `product-${businessId}`);
  assert.equal(publicDetail.commerce.menu.id, `menu-${businessId}`);
  assert.equal(
    publicDetail.commerce.menu.categories[0].items[0].id,
    `item-${businessId}`,
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
  const forbiddenCatalogMutation = await denied.request.post(
    `${origin}/api/admin/v1/businesses/${businessId}/cms/products`,
    {
      headers: { "Content-Type": "application/json" },
      data: {
        productId: `forbidden-${businessId}`,
        name: "Forbidden",
        description: "must be denied",
        status: "draft",
        tags: [],
      },
    },
  );
  assert.equal(
    forbiddenCatalogMutation.status(),
    403,
    await forbiddenCatalogMutation.text(),
  );
  await denied.close();
  await context.close();
  process.stdout.write("Business CMS browser + HTTP acceptance: PASS\n");
} finally {
  await browser.close();
}
