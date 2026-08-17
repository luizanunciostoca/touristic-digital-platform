import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const fixturePath =
  process.env.PAYMENTS_E2E_FIXTURE ||
  "apps/morro-digital-platform/tooling/payments-provider-browser-e2e.fixture.json";
const evidencePath =
  process.env.PAYMENTS_E2E_EVIDENCE ||
  "/tmp/payments-provider-browser-e2e-evidence.json";
const playwrightModule = process.env.PAYMENTS_E2E_PLAYWRIGHT_MODULE || "playwright";

function fail(code, detail = "") {
  throw new Error(detail ? `${code}: ${detail}` : code);
}

function resolveEnv(value) {
  if (typeof value !== "string") return value;
  return value.replace(/\$\{ENV:([A-Z0-9_]+)\}/gu, (_, name) => {
    const resolved = String(process.env[name] ?? "").trim();
    if (!resolved) fail("PAYMENTS_E2E_ENV_REQUIRED", name);
    return resolved;
  });
}

function resolveFixtureValue(value) {
  if (Array.isArray(value)) return value.map(resolveFixtureValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        resolveFixtureValue(nested),
      ]),
    );
  }
  return resolveEnv(value);
}

function canonicalOrigin(value) {
  try {
    const url = new URL(value);
    if (!/^https?:$/u.test(url.protocol) || url.username || url.password) {
      return "";
    }
    return url.origin;
  } catch {
    return "";
  }
}

function safePath(value) {
  const path = String(value ?? "").trim();
  return path.startsWith("/") && !path.startsWith("//") ? path : "";
}

async function importPlaywright() {
  try {
    const specifier = playwrightModule.startsWith("/")
      ? pathToFileURL(playwrightModule).href
      : playwrightModule;
    return await import(specifier);
  } catch (error) {
    fail(
      "PAYMENTS_E2E_PLAYWRIGHT_UNAVAILABLE",
      error instanceof Error ? error.message : String(error),
    );
  }
}

async function executeStep(page, step) {
  const action = String(step?.action ?? "").trim();
  const selector = String(step?.selector ?? "").trim();
  const timeout = Number(step?.timeoutMs ?? 30_000);
  if (!Number.isSafeInteger(timeout) || timeout < 100 || timeout > 180_000) {
    fail("PAYMENTS_E2E_STEP_TIMEOUT_INVALID", action);
  }

  if (action === "fill") {
    if (!selector || typeof step.value !== "string") {
      fail("PAYMENTS_E2E_STEP_INVALID", action);
    }
    await page.locator(selector).fill(step.value, { timeout });
    return;
  }
  if (action === "select") {
    if (!selector || typeof step.value !== "string") {
      fail("PAYMENTS_E2E_STEP_INVALID", action);
    }
    await page.locator(selector).selectOption(step.value, { timeout });
    return;
  }
  if (action === "check") {
    if (!selector) fail("PAYMENTS_E2E_STEP_INVALID", action);
    await page.locator(selector).check({ timeout });
    return;
  }
  if (action === "click") {
    if (!selector) fail("PAYMENTS_E2E_STEP_INVALID", action);
    await page.locator(selector).click({ timeout });
    return;
  }
  if (action === "waitForSelector") {
    if (!selector) fail("PAYMENTS_E2E_STEP_INVALID", action);
    await page.locator(selector).waitFor({ state: "visible", timeout });
    return;
  }
  if (action === "waitForURL") {
    if (typeof step.value !== "string" || !step.value) {
      fail("PAYMENTS_E2E_STEP_INVALID", action);
    }
    await page.waitForURL(step.value, { timeout });
    return;
  }
  fail("PAYMENTS_E2E_STEP_UNSUPPORTED", action);
}

async function run() {
  const rawFixture = JSON.parse(await readFile(fixturePath, "utf8"));
  const fixture = resolveFixtureValue(rawFixture);
  const appBaseUrl = String(fixture.appBaseUrl ?? "").replace(/\/$/u, "");
  const appOrigin = canonicalOrigin(appBaseUrl);
  const entryPath = safePath(fixture.entryPath);
  const expectedProviderOrigins = new Set(
    (fixture.provider?.expectedOrigins ?? []).map(canonicalOrigin).filter(Boolean),
  );
  const providerSteps = fixture.provider?.steps ?? [];
  const timeoutMs = Number(fixture.timeoutMs ?? 120_000);

  if (!appOrigin || !entryPath) fail("PAYMENTS_E2E_APP_URL_INVALID");
  if (expectedProviderOrigins.size === 0) {
    fail("PAYMENTS_E2E_PROVIDER_ORIGIN_REQUIRED");
  }
  if (!Array.isArray(providerSteps)) {
    fail("PAYMENTS_E2E_PROVIDER_STEPS_INVALID");
  }
  if (
    providerSteps.length === 0 &&
    fixture.provider?.allowNoInteraction !== true
  ) {
    fail("PAYMENTS_E2E_PROVIDER_INTERACTION_NOT_CONFIGURED");
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 5_000 || timeoutMs > 600_000) {
    fail("PAYMENTS_E2E_TIMEOUT_INVALID");
  }

  const handoff = structuredClone(fixture.handoff ?? {});
  handoff.returnUrl = String(handoff.returnUrl ?? "").replace(
    "${APP_BASE_URL}",
    appBaseUrl,
  );

  const { chromium } = await importPlaywright();
  const browser = await chromium.launch({ headless: true });
  const evidence = {
    contract: "FEATURE-0009-PROVIDER-BROWSER-E2E",
    contractVersion: 1,
    startedAt: new Date().toISOString(),
    appOrigin,
    providerOrigin: null,
    checkoutId: null,
    paymentId: null,
    createStatus: null,
    correlationIds: [],
    verified: null,
    browserErrors: [],
    status: "FAIL",
  };

  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const correlations = new Set();

    page.on("pageerror", (error) => evidence.browserErrors.push(error.message));
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.origin !== appOrigin || !url.pathname.startsWith("/api/payments/v1/")) {
        return;
      }
      const value = request.headers()["x-correlation-id"];
      if (value) correlations.add(value);
    });
    page.on("response", async (response) => {
      try {
        const url = new URL(response.url());
        if (
          url.origin !== appOrigin ||
          url.pathname !== "/api/payments/v1/checkouts" ||
          response.request().method() !== "POST"
        ) {
          return;
        }
        const payload = await response.json();
        evidence.checkoutId = String(payload?.data?.checkoutId ?? "") || null;
        evidence.paymentId = String(payload?.data?.paymentId ?? "") || null;
        evidence.createStatus = response.status();
      } catch {
        // Diagnostics only; the browser contract remains the source of outcome truth.
      }
    });

    await page.goto(`${appBaseUrl}${entryPath}`, {
      waitUntil: "networkidle",
      timeout: timeoutMs,
    });
    await page.evaluate(() => {
      globalThis.__PAYMENTS_E2E_RESULT__ = { verified: null, failed: null };
      window.addEventListener("businessPaymentVerified", (event) => {
        globalThis.__PAYMENTS_E2E_RESULT__.verified = event.detail ?? null;
      });
      window.addEventListener("businessPaymentVerificationFailed", (event) => {
        globalThis.__PAYMENTS_E2E_RESULT__.failed = event.detail ?? null;
      });
    });

    const popupPromise = context.waitForEvent("page", { timeout: timeoutMs });
    await page.evaluate((detail) => {
      window.dispatchEvent(
        new CustomEvent("businessCheckoutRequested", { detail }),
      );
    }, handoff);
    const providerPage = await popupPromise;
    await providerPage.waitForLoadState("domcontentloaded", { timeout: timeoutMs });

    const providerOrigin = canonicalOrigin(providerPage.url());
    evidence.providerOrigin = providerOrigin || null;
    if (!providerOrigin || !expectedProviderOrigins.has(providerOrigin)) {
      fail("PAYMENTS_E2E_PROVIDER_ORIGIN_MISMATCH", providerPage.url());
    }

    for (const step of providerSteps) {
      await executeStep(providerPage, step);
    }

    await page.waitForFunction(
      () =>
        Boolean(
          globalThis.__PAYMENTS_E2E_RESULT__?.verified ||
            globalThis.__PAYMENTS_E2E_RESULT__?.failed,
        ),
      null,
      { timeout: timeoutMs },
    );
    const result = await page.evaluate(() => globalThis.__PAYMENTS_E2E_RESULT__);
    if (result?.failed) {
      fail("PAYMENTS_E2E_VERIFIED_FAILURE", JSON.stringify(result.failed));
    }
    if (!result?.verified?.verified || !result.verified.reference) {
      fail("PAYMENTS_E2E_VERIFIED_PAYMENT_MISSING");
    }
    if (!evidence.checkoutId || !evidence.paymentId || evidence.createStatus !== 201) {
      fail("PAYMENTS_E2E_CHECKOUT_EVIDENCE_INCOMPLETE");
    }
    if (evidence.browserErrors.length > 0) {
      fail("PAYMENTS_E2E_BROWSER_ERRORS", evidence.browserErrors.join(" | "));
    }

    evidence.correlationIds = [...correlations].sort();
    if (evidence.correlationIds.length === 0) {
      fail("PAYMENTS_E2E_CORRELATION_EVIDENCE_MISSING");
    }
    evidence.verified = {
      verified: true,
      reference: String(result.verified.reference),
      definitiveBusinessId: result.verified.definitiveBusinessId ?? null,
      activationStatus: result.verified.activationStatus ?? null,
    };
    evidence.status = "PASS";
    evidence.completedAt = new Date().toISOString();
  } finally {
    await browser.close();
    await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
