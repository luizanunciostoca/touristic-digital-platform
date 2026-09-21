import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("/tmp/pw/node_modules/playwright");

const origin = "http://127.0.0.1:4194";
const password = "control center browser fixture";

async function login(context) {
  const response = await context.request.post(
    `${origin}/api/dashboard/auth/login`,
    {
      headers: { Origin: origin, "Content-Type": "application/json" },
      data: { email: "platform-owner@example.com", password },
    },
  );
  if (response.status() !== 200) {
    throw new Error(`OWNER_LOGIN_FAILED:${response.status()}`);
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    });
    await login(context);
    const page = await context.newPage();

    let productCreated = false;
    let productDisabled = false;
    const productId = "mpi_browser_000000000000000000000001";
    const productOffer = () => ({
      id: productId,
      destinationId: "morro-de-sao-paulo",
      product: { kind: "tour", reference: "volta-a-ilha-browser-admin" },
      label: "Volta a Ilha Browser Admin",
      unitAmount: { minorUnits: 15900, currency: "BRL" },
      pricingVersion: "browser-v1",
      capacity: 20,
      maxPerReservation: 4,
      salesStartAt: "2026-09-22T10:00:00.000Z",
      salesEndAt: "2026-09-22T18:00:00.000Z",
      startsAt: "2026-09-23T10:00:00.000Z",
      endsAt: "2026-09-23T18:00:00.000Z",
      enabled: !productDisabled,
    });

    await page.route(
      `${origin}/api/admin/v1/products?limit=100`,
      async (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: productCreated
              ? [
                  {
                    offer: productOffer(),
                    businessId: "toca-do-morcego",
                    committedQuantity: 0,
                    availableQuantity: 20,
                    reservationCount: 0,
                  },
                ]
              : [],
          }),
        }),
    );
    await page.route(
      `${origin}/api/admin/v1/products/offers`,
      async (route) => {
        const body = route.request().postDataJSON();
        if (
          body.businessId !== "toca-do-morcego" ||
          body.confirmation !== "CRIAR OFERTA" ||
          !String(body.requestKey || "").startsWith("cc_offer_")
        ) {
          throw new Error(`PRODUCT_CREATE_DIVERGED:${JSON.stringify(body)}`);
        }
        productCreated = true;
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            data: { id: productId, businessId: "toca-do-morcego" },
          }),
        });
      },
    );
    await page.route(
      `${origin}/api/admin/v1/products/${productId}`,
      async (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: {
              projection: {
                offer: productOffer(),
                businessId: "toca-do-morcego",
                committedQuantity: 0,
                availableQuantity: 20,
                reservationCount: 0,
              },
              availability: { remainingQuantity: productDisabled ? 0 : 20 },
            },
          }),
        }),
    );
    await page.route(
      `${origin}/api/admin/v1/products/${productId}/disable`,
      async (route) => {
        const body = route.request().postDataJSON();
        if (
          body.businessId !== "toca-do-morcego" ||
          body.confirmation !== "DESATIVAR OFERTA"
        ) {
          throw new Error(`PRODUCT_DISABLE_DIVERGED:${JSON.stringify(body)}`);
        }
        productDisabled = true;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: {
              id: productId,
              businessId: "toca-do-morcego",
              enabled: false,
            },
          }),
        });
      },
    );

    let reservationCancelled = false;
    const reservationId = "trv_browser_held_0001";
    await page.route(
      `${origin}/api/admin/v1/reservations/${reservationId}`,
      async (route) => {
        const status = reservationCancelled ? "cancelled" : "held";
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: {
              reservation: {
                id: reservationId,
                status,
                quantity: 1,
                unitAmount: { minorUnits: 12500, currency: "BRL" },
                destinationId: "morro-de-sao-paulo",
                holderReference: "holder_browser_0001",
                inventoryId: "tin_browser_0001",
                product: { kind: "tour", reference: "volta-a-ilha-browser" },
                orderId: null,
                paymentId: null,
                createdAt: "2026-09-21T12:00:00.000Z",
              },
              businessId: "toca-do-morcego",
              inventoryLabel: "Volta a Ilha Browser",
              events: [
                {
                  eventType: status,
                  occurredAt: "2026-09-21T12:00:00.000Z",
                  actorReference: "browser",
                },
              ],
            },
          }),
        });
      },
    );
    await page.route(
      `${origin}/api/admin/v1/reservations/${reservationId}/cancel`,
      async (route) => {
        const body = route.request().postDataJSON();
        if (body.confirmation !== "CANCELAR RESERVA") {
          throw new Error(
            `RESERVATION_CANCEL_DIVERGED:${JSON.stringify(body)}`,
          );
        }
        reservationCancelled = true;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: {
              previousState: { id: reservationId, status: "held" },
              newState: { id: reservationId, status: "cancelled" },
            },
          }),
        });
      },
    );

    await page.goto(
      `${origin}/apps/control-center/public/index.html#products`,
      { waitUntil: "domcontentloaded", timeout: 30_000 },
    );
    await page.locator("#app:not([hidden])").waitFor({ timeout: 15_000 });

    const create = page.locator("#product-create-form");
    await create
      .locator('select[name="businessId"]')
      .selectOption("toca-do-morcego");
    await create
      .locator('input[name="productReference"]')
      .fill("volta-a-ilha-browser-admin");
    await create
      .locator('input[name="label"]')
      .fill("Volta a Ilha Browser Admin");
    await create.locator('input[name="unitAmountMinor"]').fill("15900");
    await create.locator('input[name="pricingVersion"]').fill("browser-v1");
    await create.locator('input[name="capacity"]').fill("20");
    await create.locator('input[name="maxPerReservation"]').fill("4");
    await create.locator('input[name="salesStartAt"]').fill("2026-09-22T10:00");
    await create.locator('input[name="salesEndAt"]').fill("2026-09-22T18:00");
    await create.locator('input[name="startsAt"]').fill("2026-09-23T10:00");
    await create.locator('input[name="endsAt"]').fill("2026-09-23T18:00");
    await create
      .locator('textarea[name="reason"]')
      .fill("Criar oferta no browser governado");
    await create.locator('input[name="password"]').fill(password);
    await create.locator('input[name="confirmation"]').fill("CRIAR OFERTA");
    await create
      .getByRole("button", { name: "Criar oferta governada" })
      .click();
    await page
      .getByText("Volta a Ilha Browser Admin", { exact: true })
      .first()
      .waitFor();

    const disable = page.locator("#product-disable-form");
    await disable.locator('input[name="password"]').fill(password);
    await disable
      .locator('textarea[name="reason"]')
      .fill("Desativar oferta no browser governado");
    await disable
      .locator('input[name="confirmation"]')
      .fill("DESATIVAR OFERTA");
    await disable.getByRole("button", { name: "Desativar oferta" }).click();
    await page.getByText("desativado", { exact: true }).first().waitFor();

    await page.evaluate((id) => {
      location.hash = `#reservations:${id}`;
    }, reservationId);
    const cancel = page.locator("#reservation-cancel-form");
    await cancel.locator('input[name="password"]').fill(password);
    await cancel
      .locator('textarea[name="reason"]')
      .fill("Cancelar hold no browser governado");
    await cancel.locator('input[name="confirmation"]').fill("CANCELAR RESERVA");
    await cancel
      .getByRole("button", { name: "Cancelar hold governado" })
      .click();
    await page.getByText("cancelled", { exact: true }).first().waitFor();

    await page.locator('[data-view="settings"]').click();
    const settings = page.locator("#control-center-settings-form");
    await settings.locator('select[name="density"]').selectOption("compact");
    await settings.locator('select[name="motion"]').selectOption("reduced");
    await settings.getByRole("button", { name: "Salvar preferências" }).click();
    const applied = await page.evaluate(() => ({
      stored: localStorage.getItem("md_control_center_preferences_v1"),
      density: document.documentElement.dataset.controlDensity,
      motion: document.documentElement.dataset.controlMotion,
    }));
    if (
      !applied.stored ||
      applied.density !== "compact" ||
      applied.motion !== "reduced"
    ) {
      throw new Error(`SETTINGS_NOT_APPLIED:${JSON.stringify(applied)}`);
    }

    console.log("CONTROL_CENTER_COMMERCE_BROWSER_PASS");
    await context.close();
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(
    "CONTROL_CENTER_COMMERCE_BROWSER_FAILED",
    error instanceof Error ? error.name : "UnknownError",
  );
  process.exit(1);
});
