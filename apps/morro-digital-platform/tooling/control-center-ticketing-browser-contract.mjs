import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("/tmp/pw/node_modules/playwright");

const origin = "http://127.0.0.1:4194";
const password = "control center browser fixture";

async function main() {
  const browser = await chromium.launch({ headless: true });
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
    const calls = [];

    await page.route(
      `${origin}/api/admin/v1/ticketing/inventory`,
      async (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: [] }),
        }),
    );

    await page.route(
      `${origin}/api/admin/v1/ticketing/operator/check-in`,
      async (route) => {
        const body = route.request().postDataJSON();
        calls.push({ operation: "check-in", body });
        if (
          body.qrPayload !== "ticketing:qr:browser" ||
          body.confirmation !== "VALIDAR CHECK-IN"
        ) {
          throw new Error(`CHECKIN_PAYLOAD_DIVERGED:${JSON.stringify(body)}`);
        }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: { status: "checked_in" } }),
        });
      },
    );

    await page.route(
      `${origin}/api/admin/v1/ticketing/operator/offline-devices`,
      async (route) => {
        const body = route.request().postDataJSON();
        calls.push({ operation: "provision", body });
        if (
          body.deviceId !== "tdv_browser_device_01" ||
          body.destinationId !== "morro-de-sao-paulo" ||
          body.confirmation !== "PROVISIONAR DISPOSITIVO"
        ) {
          throw new Error(`DEVICE_PROVISION_DIVERGED:${JSON.stringify(body)}`);
        }
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            data: {
              token: "one-time-browser-device-token",
              claims: {
                deviceId: "tdv_browser_device_01",
                destinationId: "morro-de-sao-paulo",
              },
            },
          }),
        });
      },
    );

    await page.route(
      `${origin}/api/admin/v1/ticketing/operator/offline-devices/tdv_browser_device_01/revoke`,
      async (route) => {
        const body = route.request().postDataJSON();
        calls.push({ operation: "revoke", body });
        if (body.confirmation !== "REVOGAR DISPOSITIVO") {
          throw new Error(`DEVICE_REVOKE_DIVERGED:${JSON.stringify(body)}`);
        }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: {
              deviceId: "tdv_browser_device_01",
              revokedAt: "2026-09-21T12:00:00.000Z",
            },
          }),
        });
      },
    );

    await page.goto(
      `${origin}/apps/control-center/public/index.html#ticketing`,
      { waitUntil: "domcontentloaded", timeout: 30_000 },
    );
    await page.locator("#app:not([hidden])").waitFor({ timeout: 15_000 });

    const checkin = page.locator("#ticketing-checkin-form");
    await checkin.locator('textarea[name="qrPayload"]').fill("ticketing:qr:browser");
    await checkin.locator('input[name="password"]').fill(password);
    await checkin.locator('textarea[name="reason"]').fill("Validar ticket no contrato browser");
    await checkin.locator('input[name="confirmation"]').fill("VALIDAR CHECK-IN");
    await checkin.getByRole("button", { name: "Validar ticket" }).click();
    await page.getByText(/Check-in validado/).waitFor();

    const provision = page.locator("#ticketing-device-provision-form");
    await provision.locator('input[name="deviceId"]').fill("tdv_browser_device_01");
    await provision.locator('input[name="destinationId"]').fill("morro-de-sao-paulo");
    await provision.locator('input[name="ttlSeconds"]').fill("3600");
    await provision.locator('input[name="password"]').fill(password);
    await provision.locator('textarea[name="reason"]').fill("Provisionar dispositivo no contrato browser");
    await provision.locator('input[name="confirmation"]').fill("PROVISIONAR DISPOSITIVO");
    await provision.getByRole("button", { name: "Provisionar credencial" }).click();
    await page.locator("#ticketing-device-token").waitFor({ state: "visible" });
    if ((await page.locator("#ticketing-device-token").inputValue()) !== "one-time-browser-device-token") {
      throw new Error("DEVICE_TOKEN_NOT_RENDERED");
    }

    const revoke = page.locator("#ticketing-device-revoke-form");
    await revoke.locator('input[name="deviceId"]').fill("tdv_browser_device_01");
    await revoke.locator('input[name="password"]').fill(password);
    await revoke.locator('textarea[name="reason"]').fill("Revogar dispositivo no contrato browser");
    await revoke.locator('input[name="confirmation"]').fill("REVOGAR DISPOSITIVO");
    await revoke.getByRole("button", { name: "Revogar dispositivo" }).click();
    await page.getByText(/Dispositivo revogado em/).waitFor();

    if (calls.map((entry) => entry.operation).join(",") !== "check-in,provision,revoke") {
      throw new Error(`TICKETING_UI_CALLS_DIVERGED:${JSON.stringify(calls)}`);
    }

    console.log("CONTROL_CENTER_TICKETING_BROWSER_PASS");
    await context.close();
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(
    "CONTROL_CENTER_TICKETING_BROWSER_FAILED",
    error instanceof Error ? error.name : "UnknownError",
  );
  process.exit(1);
});
