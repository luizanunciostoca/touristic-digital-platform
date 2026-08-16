const { mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { chromium } = require("/tmp/pw/node_modules/playwright");

const origin = "http://127.0.0.1:4192";
const leadId = readFileSync("/tmp/m141-lead-id.txt", "utf8").trim();
const followUpId = readFileSync("/tmp/m141-follow-up-id.txt", "utf8").trim();
const evidenceDir = "/tmp/crm-m141-evidence";
mkdirSync(evidenceDir, { recursive: true });

const evidence = {
  contractVersion: 1,
  leadId,
  followUpId,
  viewports: [],
  responses: {},
  pageErrors: [],
  failedRequests: [],
  optionalFieldClearing: false,
  followUpLifecycle: false,
  keyboardFocus: false,
  semantics: false,
  success: false,
};

function persist() {
  writeFileSync(
    `${evidenceDir}/evidence.json`,
    JSON.stringify(evidence, null, 2),
  );
}

function recordResponse(response) {
  const url = new URL(response.url());
  const method = response.request().method();
  if (url.pathname === `/api/crm/leads/${leadId}` && method === "PATCH") {
    evidence.responses.leadClear = { status: response.status(), method };
  }
  if (
    url.pathname === `/api/crm/follow-ups/${followUpId}/sent` &&
    method === "POST"
  ) {
    evidence.responses.followUpSent = { status: response.status(), method };
  }
  if (
    url.pathname === `/api/crm/follow-ups/${followUpId}/responded` &&
    method === "POST"
  ) {
    evidence.responses.followUpResponded = {
      status: response.status(),
      method,
    };
  }
  persist();
}

async function authenticate(page, targetPath) {
  const targetUrl = new URL(`${origin}${targetPath}`);
  await page.goto(targetUrl.href, { waitUntil: "domcontentloaded" });
  await page.waitForURL((url) => url.pathname === "/dashboard/login.html");
  await page.locator("#email").fill("owner@example.com");
  await page.locator("#password").fill("correct horse battery staple");
  await page.locator("#submit").click();
  await page.waitForURL(
    (url) =>
      url.pathname === targetUrl.pathname &&
      url.searchParams.get("id") === targetUrl.searchParams.get("id"),
  );
}

async function proveKeyboardFocus(page, viewportName) {
  await page.keyboard.press("Tab");
  const focused = page.locator(":focus");
  await focused.waitFor({ state: "visible" });
  const tag = await focused.evaluate((element) =>
    element.tagName.toLowerCase(),
  );
  if (!["a", "button", "input", "select", "textarea"].includes(tag)) {
    throw new Error(`${viewportName}: unexpected keyboard focus target ${tag}`);
  }
  const box = await focused.boundingBox();
  if (!box || box.width <= 0 || box.height <= 0) {
    throw new Error(`${viewportName}: focused control has no visible box`);
  }
  await page.screenshot({
    path: `${evidenceDir}/${viewportName}-keyboard-focus.png`,
    fullPage: true,
  });
  evidence.keyboardFocus = true;
}

async function proveLeadSemantics(page, viewportName, width) {
  await page
    .locator("#lead-detail-shell:not([hidden])")
    .waitFor({ state: "visible" });
  await page
    .getByRole("heading", { name: "Toca do Morcego" })
    .waitFor({ state: "visible" });
  await page
    .getByRole("heading", { name: "Informações do lead" })
    .waitFor({ state: "visible" });
  await page.getByRole("status").first().waitFor({ state: "visible" });
  await page
    .getByRole("textbox", { name: "Empresa", exact: true })
    .waitFor({ state: "visible" });
  await page
    .getByRole("textbox", { name: "Contato", exact: true })
    .waitFor({ state: "visible" });
  await page
    .getByRole("textbox", { name: "Observações", exact: true })
    .waitFor({ state: "visible" });
  const shellBox = await page.locator("#lead-detail-shell").boundingBox();
  if (!shellBox || shellBox.x < -1 || shellBox.width > width + 1) {
    throw new Error(`${viewportName}: lead detail root overflows viewport`);
  }
  evidence.semantics = true;
}

async function proveClearing(page, context) {
  const optionalInputs = [
    "segment",
    "contactName",
    "whatsapp",
    "phone",
    "email",
    "monthlyValue",
    "address",
    "website",
    "source",
  ];
  for (const name of optionalInputs) {
    const control = page.locator(`#lead-edit-form [name="${name}"]`);
    if (!(await control.inputValue())) {
      throw new Error(`precondition missing populated value for ${name}`);
    }
    await control.fill("");
  }
  const notes = page.locator('#lead-edit-form textarea[name="notes"]');
  if (!(await notes.inputValue()))
    throw new Error("precondition missing populated notes");
  await notes.fill("");
  await page.locator("#lead-edit-submit").click();
  await page
    .locator("#lead-edit-status")
    .getByText("Lead atualizado.", { exact: true })
    .waitFor({ state: "visible" });
  if (evidence.responses.leadClear?.status !== 200) {
    throw new Error(
      `lead clearing response missing: ${JSON.stringify(evidence.responses.leadClear)}`,
    );
  }

  const readback = await context.request.get(
    `${origin}/api/crm/leads/${leadId}/detail`,
  );
  if (!readback.ok())
    throw new Error(`lead readback failed with ${readback.status()}`);
  const payload = await readback.json();
  const lead = payload?.data?.lead;
  for (const name of [...optionalInputs, "notes"]) {
    if (lead?.[name] !== null && lead?.[name] !== "") {
      throw new Error(
        `${name} was not cleared: ${JSON.stringify(lead?.[name])}`,
      );
    }
  }
  if (lead?.companyName !== "Toca do Morcego") {
    throw new Error(
      "required company name changed during optional-field clearing",
    );
  }
  evidence.optionalFieldClearing = true;
}

async function proveFollowUpLifecycle(page, context, viewportName, width) {
  await page.goto(`${origin}/apps/admin-crm/public/follow-ups.html`, {
    waitUntil: "domcontentloaded",
  });
  await page
    .getByRole("heading", { name: "Follow-ups", exact: true })
    .waitFor({ state: "visible" });
  await page
    .getByRole("heading", { name: "Acompanhamento" })
    .waitFor({ state: "visible" });
  const mainBox = await page.locator("main").boundingBox();
  if (!mainBox || mainBox.x < -1 || mainBox.width > width + 1) {
    throw new Error(`${viewportName}: follow-up root overflows viewport`);
  }

  const sentButton = page.getByRole("button", { name: "Marcar como enviado" });
  await sentButton.waitFor({ state: "visible" });
  await sentButton.click();
  const respondedButton = page.getByRole("button", { name: "Lead respondeu" });
  await respondedButton.waitFor({ state: "visible" });
  if (evidence.responses.followUpSent?.status !== 200) {
    throw new Error(
      `sent transition response missing: ${JSON.stringify(evidence.responses.followUpSent)}`,
    );
  }

  const respondedResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === `/api/crm/follow-ups/${followUpId}/responded` &&
      response.request().method() === "POST"
    );
  });
  await respondedButton.click();
  const respondedResponse = await respondedResponsePromise;
  evidence.responses.followUpResponded = {
    status: respondedResponse.status(),
    method: respondedResponse.request().method(),
  };
  persist();
  await respondedButton.waitFor({ state: "detached" });

  const readback = await context.request.get(`${origin}/api/crm/follow-ups`);
  if (!readback.ok())
    throw new Error(`follow-up readback failed with ${readback.status()}`);
  const payload = await readback.json();
  const followUp = payload?.data?.find(
    (item) => String(item.id) === followUpId,
  );
  if (followUp?.status !== "responded") {
    throw new Error(
      `follow-up did not reach responded: ${JSON.stringify(followUp)}`,
    );
  }
  if (evidence.responses.followUpResponded?.status !== 200) {
    throw new Error(
      `responded transition response missing: ${JSON.stringify(evidence.responses.followUpResponded)}`,
    );
  }
  evidence.followUpLifecycle = true;
}

async function main() {
  persist();
  const browser = await chromium.launch({ headless: true });
  const viewports = [
    { name: "mobile", width: 390, height: 844 },
    { name: "tablet", width: 768, height: 1024 },
    { name: "desktop", width: 1280, height: 900 },
  ];

  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      page.setDefaultTimeout(12_000);
      page.setDefaultNavigationTimeout(15_000);
      page.on("pageerror", (error) => {
        evidence.pageErrors.push({
          viewport: viewport.name,
          message: error.message,
        });
        persist();
      });
      page.on("requestfailed", (request) => {
        const failure = request.failure()?.errorText || "unknown";
        if (failure !== "net::ERR_ABORTED") {
          evidence.failedRequests.push({
            viewport: viewport.name,
            method: request.method(),
            url: request.url(),
            failure,
          });
          persist();
        }
      });
      page.on("response", recordResponse);

      await authenticate(
        page,
        `/apps/admin-crm/public/lead-detail.html?id=${leadId}`,
      );
      await proveLeadSemantics(page, viewport.name, viewport.width);
      await proveKeyboardFocus(page, viewport.name);
      await page.screenshot({
        path: `${evidenceDir}/${viewport.name}-lead-detail.png`,
        fullPage: true,
      });

      if (viewport.name === "desktop") {
        await proveClearing(page, context);
        await proveFollowUpLifecycle(
          page,
          context,
          viewport.name,
          viewport.width,
        );
      } else {
        await page.goto(`${origin}/apps/admin-crm/public/follow-ups.html`, {
          waitUntil: "domcontentloaded",
        });
        await page
          .getByRole("heading", { name: "Follow-ups", exact: true })
          .waitFor({ state: "visible" });
        const mainBox = await page.locator("main").boundingBox();
        if (!mainBox || mainBox.x < -1 || mainBox.width > viewport.width + 1) {
          throw new Error(
            `${viewport.name}: follow-up root overflows viewport`,
          );
        }
      }
      await page.screenshot({
        path: `${evidenceDir}/${viewport.name}-follow-ups.png`,
        fullPage: true,
      });
      evidence.viewports.push({ ...viewport, passed: true });
      persist();
      await context.close();
    }

    if (evidence.pageErrors.length > 0 || evidence.failedRequests.length > 0) {
      throw new Error(
        `browser errors: ${JSON.stringify({ pageErrors: evidence.pageErrors, failedRequests: evidence.failedRequests })}`,
      );
    }
    if (
      !evidence.optionalFieldClearing ||
      !evidence.followUpLifecycle ||
      !evidence.keyboardFocus ||
      !evidence.semantics ||
      evidence.viewports.length !== 3
    ) {
      throw new Error(`incomplete evidence: ${JSON.stringify(evidence)}`);
    }
    evidence.success = true;
    persist();
  } catch (error) {
    evidence.failure =
      error instanceof Error ? error.stack || error.message : String(error);
    persist();
    throw error;
  } finally {
    await browser.close();
  }
}

const timer = setTimeout(() => {
  evidence.failure = "CRM M141 browser lifecycle exceeded 120 seconds";
  persist();
  process.exit(1);
}, 120_000);
timer.unref?.();

main()
  .then(() => clearTimeout(timer))
  .catch((error) => {
    clearTimeout(timer);
    console.error(error);
    process.exit(1);
  });
