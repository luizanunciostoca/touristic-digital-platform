import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("/tmp/pw/node_modules/playwright");

const origin = "http://127.0.0.1:4194";
const password = "control center browser fixture";

async function login(context, email) {
  const response = await context.request.post(
    `${origin}/api/dashboard/auth/login`,
    {
      headers: { Origin: origin, "Content-Type": "application/json" },
      data: { email, password },
    },
  );
  if (response.status() !== 200) {
    throw new Error(
      `LOGIN_FAILED:${email}:${response.status()}:${await response.text()}`,
    );
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    });
    await login(context, "platform-owner-users@example.com");
    const page = await context.newPage();

    await page.goto(`${origin}/apps/control-center/public/index.html#users`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await page.locator("#app:not([hidden])").waitFor({ timeout: 15_000 });
    await page
      .getByRole("link", { name: "business-owner@example.com" })
      .click();

    const user360 = page.locator('[data-entity-tabs="user360"]');
    await user360.waitFor();
    const openActions = async () => {
      await page
        .locator('[data-entity-tabs="user360"]')
        .getByRole("tab", { name: "Settings / Actions" })
        .click();
    };
    await openActions();

    const roleForm = page.locator("#user-role-form");
    await roleForm
      .locator('select[name="role"]')
      .selectOption("BUSINESS_MANAGER");
    await roleForm.locator('input[name="password"]').fill(password);
    await roleForm
      .locator('textarea[name="reason"]')
      .fill("Ajustar perfil no contrato browser administrativo");
    await roleForm.locator('input[name="confirmation"]').fill("ALTERAR PERFIL");
    await roleForm.getByRole("button", { name: "Alterar perfil" }).click();
    await page
      .locator('[data-entity-panel="overview"]')
      .getByText("BUSINESS_MANAGER", { exact: true })
      .waitFor({ timeout: 15_000 });

    await openActions();
    const statusForm = page.locator("#user-status-form");
    await statusForm.locator('input[name="password"]').fill(password);
    await statusForm
      .locator('textarea[name="reason"]')
      .fill("Bloqueio browser para validar política durável");
    await statusForm.locator('input[name="confirmation"]').fill("BLOQUEAR");
    await statusForm.getByRole("button", { name: "Bloquear conta" }).click();
    await page
      .locator('[data-entity-panel="overview"]')
      .getByText("blocked", { exact: true })
      .waitFor({ timeout: 15_000 });

    const blocked = await browser.newContext();
    const blockedLogin = await blocked.request.post(
      `${origin}/api/dashboard/auth/login`,
      {
        headers: { Origin: origin, "Content-Type": "application/json" },
        data: { email: "business-owner@example.com", password },
      },
    );
    const blockedBody = await blockedLogin.json();
    if (
      blockedLogin.status() !== 403 ||
      blockedBody.error !== "ACCOUNT_BLOCKED"
    ) {
      throw new Error(
        `BLOCK_POLICY_FAILED:${blockedLogin.status()}:${JSON.stringify(blockedBody)}`,
      );
    }
    await blocked.close();

    await openActions();
    await statusForm.locator('input[name="password"]').fill(password);
    await statusForm
      .locator('textarea[name="reason"]')
      .fill("Reativar conta após validação browser da política");
    await statusForm.locator('input[name="confirmation"]').fill("REATIVAR");
    await statusForm.getByRole("button", { name: "Reativar conta" }).click();
    await page
      .locator('[data-entity-panel="overview"]')
      .getByText("active", { exact: true })
      .waitFor({ timeout: 15_000 });

    await openActions();
    await roleForm
      .locator('select[name="role"]')
      .selectOption("BUSINESS_OWNER");
    await roleForm.locator('input[name="password"]').fill(password);
    await roleForm
      .locator('textarea[name="reason"]')
      .fill("Restaurar perfil da fixture após validação browser");
    await roleForm.locator('input[name="confirmation"]').fill("ALTERAR PERFIL");
    await roleForm.getByRole("button", { name: "Alterar perfil" }).click();
    await page
      .locator('[data-entity-panel="overview"]')
      .getByText("BUSINESS_OWNER", { exact: true })
      .waitFor({ timeout: 15_000 });

    console.log("CONTROL_CENTER_USERS_BROWSER_PASS");
    await context.close();
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(
    "CONTROL_CENTER_USERS_BROWSER_FAILED",
    error instanceof Error ? error.name : "UnknownError",
  );
  process.exit(1);
});
