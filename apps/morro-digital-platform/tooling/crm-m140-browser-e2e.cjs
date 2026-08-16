const { readFileSync, writeFileSync } = require("node:fs");
const { chromium } = require("/tmp/pw/node_modules/playwright");

const origin = "http://127.0.0.1:4192";
const leadId = readFileSync("/tmp/m140-lead-id.txt", "utf8").trim();
const evidence = {
  errors: [],
  failedRequests: [],
  leadId,
  checkpoints: [],
  responses: {},
};

function persist() {
  writeFileSync(
    "/tmp/crm-m140-browser-evidence.json",
    JSON.stringify(evidence, null, 2),
  );
}

function checkpoint(name) {
  evidence.checkpoints.push(name);
  console.log(`[crm-m140-browser] ${name}`);
  persist();
}

async function main() {
  persist();
  const browser = await chromium.launch({ headless: true });
  let context;
  try {
    context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    page.setDefaultNavigationTimeout(15_000);
    page.on("pageerror", (error) => {
      evidence.errors.push(error.message);
      persist();
    });
    page.on("requestfailed", (request) => {
      evidence.failedRequests.push({
        method: request.method(),
        url: request.url(),
        failure: request.failure()?.errorText || "unknown",
      });
      persist();
    });

    checkpoint("navigate-unauthenticated-detail");
    await page.goto(
      `${origin}/apps/admin-crm/public/lead-detail.html?id=${leadId}`,
      {
        waitUntil: "domcontentloaded",
      },
    );
    await page.waitForURL((url) => url.pathname === "/dashboard/login.html");

    checkpoint("platform-auth-login");
    await page.locator("#email").fill("owner@example.com");
    await page.locator("#password").fill("correct horse battery staple");
    await page.locator("#submit").click();
    await page.waitForURL(
      (url) => url.pathname === "/apps/admin-crm/public/lead-detail.html",
    );
    await page
      .locator("#lead-detail-shell:not([hidden])")
      .waitFor({ state: "visible" });
    await page
      .getByRole("heading", { name: "Toca do Morcego" })
      .waitFor({ state: "visible" });
    await page
      .getByText("Lead sincronizado com o CRM.")
      .waitFor({ state: "visible" });

    checkpoint("frozen-v1-stage-selector");
    const stageOptions = await page
      .locator("#lead-stage option")
      .allTextContents();
    const expectedStages = [
      "Novo Lead",
      "Primeiro Contato",
      "Reunião Agendada",
      "Proposta Enviada",
      "Trial",
      "Contrato Enviado",
      "Contrato Assinado",
      "Pagamento Pendente",
      "Pagamento Recebido",
      "Onboarding",
      "Visita Agendada",
      "Visita Realizada",
      "Publicado",
      "Divulgado",
      "Feedback",
      "Cliente Ativo",
    ];
    if (JSON.stringify(stageOptions) !== JSON.stringify(expectedStages)) {
      throw new Error(
        `Lead stage selector diverged: ${JSON.stringify(stageOptions)}`,
      );
    }

    checkpoint("checklist-toggle");
    const firstChecklist = page.getByRole("checkbox", {
      name: "Primeiro Contato",
    });
    if (!(await firstChecklist.isChecked())) {
      throw new Error("API-prepared checklist state missing");
    }
    await firstChecklist.uncheck();
    await page
      .getByText(/0 de 16 etapas concluídas/)
      .waitFor({ state: "visible" });
    await firstChecklist.check();
    await page
      .getByText(/1 de 16 etapas concluídas/)
      .waitFor({ state: "visible" });

    checkpoint("manual-interaction");
    await page.locator("#lead-interaction-type").selectOption("note");
    await page
      .locator('#lead-interaction-form textarea[name="content"]')
      .fill("Nota criada pelo Chromium M140");
    await page.locator("#lead-interaction-submit").click();
    await page
      .getByText("Nota criada pelo Chromium M140")
      .waitFor({ state: "visible" });

    checkpoint("stage-mutation");
    await page.locator("#lead-stage").selectOption("first_contact");
    const stageResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        url.pathname === `/api/crm/leads/${leadId}/stage` &&
        response.request().method() === "POST"
      );
    });
    await page.locator("#lead-stage-submit").click();
    const stageResponse = await stageResponsePromise;
    evidence.responses.stage = {
      status: stageResponse.status(),
      body: await stageResponse.text(),
    };
    persist();
    if (!stageResponse.ok()) {
      throw new Error(`Stage HTTP ${stageResponse.status()}`);
    }
    await page.waitForFunction(
      () =>
        document.querySelector("#lead-stage-status")?.textContent?.trim() ===
        "Etapa atualizada.",
    );

    checkpoint("lead-edit");
    await page
      .locator('#lead-edit-form input[name="contactName"]')
      .fill("Luiz M140");
    const editResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        url.pathname === `/api/crm/leads/${leadId}` &&
        response.request().method() === "PATCH"
      );
    });
    await page.locator("#lead-edit-submit").click();
    const editResponse = await editResponsePromise;
    evidence.responses.edit = {
      status: editResponse.status(),
      body: await editResponse.text(),
    };
    persist();
    if (!editResponse.ok()) {
      throw new Error(`Edit HTTP ${editResponse.status()}`);
    }
    await page.waitForFunction(
      () =>
        document.querySelector("#lead-edit-status")?.textContent?.trim() ===
        "Lead atualizado.",
    );
    await page.getByText("Luiz M140").first().waitFor({ state: "visible" });

    checkpoint("list-to-detail-navigation");
    await page.goto(`${origin}/apps/admin-crm/#leads`, {
      waitUntil: "domcontentloaded",
    });
    await page.locator("#leads-body tr").first().waitFor({ state: "visible" });
    const detailLink = page
      .locator(
        `a.lead-detail-link[href="/apps/admin-crm/public/lead-detail.html?id=${leadId}"]`,
      )
      .first();
    await detailLink.waitFor({ state: "visible" });
    await detailLink.click();
    await page.waitForURL(
      (url) =>
        url.pathname === "/apps/admin-crm/public/lead-detail.html" &&
        url.searchParams.get("id") === leadId,
    );

    if (evidence.errors.length > 0) {
      throw new Error(`Browser errors: ${JSON.stringify(evidence.errors)}`);
    }
    Object.assign(evidence, {
      authRedirect: true,
      stageVocabulary: 18,
      selectableStages: 16,
      checklistToggle: true,
      manualInteraction: true,
      stageMutation: true,
      leadEdit: true,
      listNavigation: true,
      success: true,
    });
    checkpoint("complete");
  } catch (error) {
    evidence.failure =
      error instanceof Error ? error.stack || error.message : String(error);
    persist();
    throw error;
  } finally {
    if (context) await context.close().catch(() => undefined);
    await browser.close();
  }
}

const overallTimeout = new Promise((_, reject) => {
  const timer = setTimeout(
    () => reject(new Error("CRM M140 browser lifecycle exceeded 90 seconds")),
    90_000,
  );
  timer.unref?.();
});

Promise.race([main(), overallTimeout]).catch((error) => {
  evidence.failure =
    error instanceof Error ? error.stack || error.message : String(error);
  persist();
  console.error(error);
  process.exit(1);
});
