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

  await page.getByRole("tab", { name: "Fotos e mídia" }).click();
  const mediaForm = page.locator("#business-cms-media-form");
  await mediaForm.waitFor();
  await mediaForm.locator('[name="file"]').setInputFiles({
    name: "cover.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlN8AAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await mediaForm.locator('[name="alt"]').fill("Capa canônica da Empresa browser");
  await mediaForm.locator('[name="role"]').selectOption("cover");
  await mediaForm.getByRole("button", { name: "Enviar imagem" }).click();
  await page.getByText("Imagem salva na revisão editável.").waitFor();
  assert.equal(
    await page.locator('[data-business-cms-panel="media"] img[src^="/media/"]').count(),
    1,
  );

  await page.getByRole("tab", { name: "Produtos" }).click();

  let productForm = page.locator('[data-business-catalog-kind="product"]');
  await productForm.locator('[name="name"]').fill("Passeio Sunset");
  await productForm
    .locator('[name="description"]')
    .fill("Produto browser canônico");
  await productForm.locator('[name="tags"]').fill("sunset, passeio");
  await productForm.getByRole("button", { name: "Salvar produto" }).click();
  await page.getByText(/Catálogo salvo como revisão editável/u).waitFor();

  await page
    .locator(".module-row")
    .filter({ hasText: "Passeio Sunset" })
    .getByRole("button", { name: "Editar" })
    .click();
  productForm = page.locator('[data-business-catalog-kind="product"]');
  await productForm.locator('[name="status"]').selectOption("active");
  await productForm.getByRole("button", { name: "Salvar produto" }).click();
  await page.getByText(/Catálogo salvo como revisão editável/u).waitFor();

  let offerForm = page.locator('[data-business-catalog-kind="offer"]');
  await offerForm.locator('[name="productId"]').selectOption({ index: 1 });
  await offerForm.locator('[name="price"]').fill("120,00");
  await offerForm.locator('[name="capacity"]').fill("20");
  await offerForm.getByRole("button", { name: "Salvar oferta" }).click();
  await page.getByText(/Catálogo salvo como revisão editável/u).waitFor();

  const offerRow = page
    .locator(".module-row")
    .filter({ hasText: "BRL 120.00" })
    .first();
  await offerRow.getByRole("button", { name: "Editar" }).click();
  offerForm = page.locator('[data-business-catalog-kind="offer"]');
  await offerForm.locator('[name="status"]').selectOption("active");
  await offerForm.getByRole("button", { name: "Salvar oferta" }).click();
  await page.getByText(/Catálogo salvo como revisão editável/u).waitFor();

  let menuForm = page.locator('[data-business-catalog-kind="menu"]');
  await menuForm.locator('[name="name"]').fill("Cardápio Browser");
  await menuForm.locator('[name="description"]').fill("Cardápio canônico");
  await menuForm.getByRole("button", { name: "Salvar menu" }).click();
  await page.getByText(/Catálogo salvo como revisão editável/u).waitFor();

  await page
    .locator(".module-row")
    .filter({ hasText: "Cardápio Browser" })
    .getByRole("button", { name: "Editar" })
    .click();
  menuForm = page.locator('[data-business-catalog-kind="menu"]');
  await menuForm.locator('[name="status"]').selectOption("active");
  await menuForm.getByRole("button", { name: "Salvar menu" }).click();
  await page.getByText(/Catálogo salvo como revisão editável/u).waitFor();

  let categoryForm = page.locator(
    '[data-business-catalog-kind="menu-category"]',
  );
  await categoryForm.locator('[name="menuId"]').selectOption({ index: 1 });
  await categoryForm.locator('[name="name"]').fill("Experiências");
  await categoryForm.locator('[name="sortOrder"]').fill("0");
  await categoryForm.getByRole("button", { name: "Salvar categoria" }).click();
  await page.getByText(/Catálogo salvo como revisão editável/u).waitFor();

  let itemForm = page.locator('[data-business-catalog-kind="menu-item"]');
  await itemForm.locator('[name="menuId"]').selectOption({ index: 1 });
  await itemForm.locator('[name="categoryId"]').selectOption({ index: 1 });
  await itemForm.locator('[name="name"]').fill("Experiência Morro");
  await itemForm.locator('[name="description"]').fill("Item browser");
  await itemForm.locator('[name="price"]').fill("45,00");
  await itemForm.locator('[name="sortOrder"]').fill("0");
  await itemForm.getByRole("button", { name: "Salvar item" }).click();
  await page.getByText(/Catálogo salvo como revisão editável/u).waitFor();

  await page
    .locator(".module-row")
    .filter({ hasText: "Experiência Morro" })
    .getByRole("button", { name: "Editar" })
    .click();
  itemForm = page.locator('[data-business-catalog-kind="menu-item"]');
  await itemForm.locator('[name="available"]').check();
  await itemForm.getByRole("button", { name: "Salvar item" }).click();
  await page.getByText(/Catálogo salvo como revisão editável/u).waitFor();

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
  assert.equal(publicDetail.commerce.offers.length, 1);
  assert.equal(publicDetail.commerce.offers[0].name, "Passeio Sunset");
  assert.equal(publicDetail.commerce.menu.name, "Cardápio Browser");
  assert.equal(
    publicDetail.commerce.menu.categories[0].items[0].name,
    "Experiência Morro",
  );
  assert.equal(
    publicDetail.media.coverImage.alt,
    "Capa canônica da Empresa browser",
  );
  assert.match(publicDetail.media.coverImage.providerReference, /^\/media\//u);
  const mediaResponse = await context.request.get(
    `${origin}${publicDetail.media.coverImage.providerReference}`,
  );
  assert.equal(mediaResponse.status(), 200, await mediaResponse.text());
  assert.equal(mediaResponse.headers()["content-type"], "image/png");

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
  const forbiddenCatalog = await denied.request.post(
    `${origin}/api/admin/v1/businesses/${businessId}/cms/catalog/product`,
    {
      headers: { "Content-Type": "application/json" },
      data: { name: "Forbidden", description: "must be denied" },
    },
  );
  assert.equal(forbiddenCatalog.status(), 403, await forbiddenCatalog.text());
  await denied.close();
  await context.close();
  process.stdout.write("Business CMS browser + HTTP acceptance: PASS\n");
} finally {
  await browser.close();
}
