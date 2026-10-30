const assert = require("node:assert/strict");
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE || "/tmp/pw/node_modules/playwright",
);

const origin = process.env.CONTROL_CENTER_ORIGIN || "http://127.0.0.1:4199";
const portal =
  "/apps/morro-digital-platform/public/affiliate-portal.html?campaign=summer#links";
const session = {
  authenticated: true,
  csrfToken: "browser-fixture",
  user: {
    email: "affiliate@example.test",
    id: "fixture",
    role: "owner",
    businessIds: [],
  },
};
const projection = {
  affiliate: {
    affiliateId: "fixture",
    status: "active",
    identityVerified: true,
    contactVerified: true,
  },
  memberships: [],
  summaryByCurrency: [],
  attribution: { count: 0 },
  conversions: [],
  materializations: [],
  payoutAuthority: { note: "Fixture" },
};

async function run() {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH,
    args: ["--disable-gpu"],
    headless: true,
  });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    let status = 401;
    let disabled = false;
    let authenticatedReads = 0;
    await page.route("**/api/dashboard/auth/session", (r) =>
      r.fulfill({
        status,
        json: status === 200 ? session : { error: "SESSION_UNAVAILABLE" },
      }),
    );
    await page.route("**/api/dashboard/auth/login", async (r) => {
      assert.equal(r.request().method(), "POST");
      status = 200;
      await r.fulfill({ json: session });
    });
    await page.route("**/api/affiliates/v1/me", (r) => {
      authenticatedReads++;
      return r.fulfill(
        disabled
          ? { status: 503, json: { error: "AFFILIATES_RUNTIME_DISABLED" } }
          : { json: projection },
      );
    });
    await page.goto(origin + portal);
    const login = page.getByRole("link", { name: "Entrar", exact: true });
    await login.waitFor();
    assert.equal(authenticatedReads, 0);
    await login.click();
    assert.equal(new URL(page.url()).searchParams.get("return"), portal);
    await page.locator("#email").fill(session.user.email);
    await page.locator("#password").fill("browser-fixture");
    await page.locator("#submit").click();
    await page.locator("#affiliate-content").waitFor();
    assert.equal(page.url(), origin + portal);
    assert.equal(
      await page.locator("#affiliate-user").textContent(),
      session.user.email,
    );
    disabled = true;
    await page.reload();
    await page
      .getByText(
        "O portal de afiliados ainda não foi habilitado neste ambiente.",
      )
      .waitFor();
    assert.equal(await page.locator("#affiliate-content").isVisible(), false);
    assert.equal(await page.locator("#affiliate-loading").isVisible(), false);
    disabled = false;
    status = 503;
    await page.reload();
    const retry = page.getByRole("button", { name: "Tentar novamente" });
    await retry.waitFor();
    assert.equal(await login.count(), 0);
    status = 200;
    await retry.click();
    await page.locator("#affiliate-content").waitFor();
    for (const [surface, failure] of [
      ["trials", 429],
      ["referrals", 500],
    ]) {
      const dest =
        "/apps/admin-crm/public/" + surface + ".html?campaign=summer";
      await page.route("**/api/crm/" + surface, (r) =>
        r.fulfill({ json: { data: [] } }),
      );
      status = failure;
      await page.goto(origin + dest);
      await retry.waitFor();
      assert.equal(page.url(), origin + dest);
      const draftInput = page.locator(
        surface === "trials" ? '[name="leadId"]' : '[name="referrerLeadId"]',
      );
      await draftInput.fill("42");
      status = 200;
      await retry.click();
      await page
        .getByText("Sessão autenticada. Lifecycle operacional.")
        .waitFor();
      assert.equal(page.url(), origin + dest);
      assert.equal(await draftInput.inputValue(), "42");
      status = 401;
      await page.reload();
      await page.waitForURL((u) => u.pathname === "/dashboard/login.html");
      assert.equal(new URL(page.url()).searchParams.get("return"), dest);
    }
    assert.deepEqual(errors, []);
    console.log(
      "PASS: affiliate login and return, unavailable affiliation runtime, transient recovery and CRM session expiry",
    );
  } finally {
    await browser.close();
  }
}
run().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
