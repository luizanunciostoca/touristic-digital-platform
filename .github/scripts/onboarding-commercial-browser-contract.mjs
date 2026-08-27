import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const playwrightModulePath =
  process.env.PLAYWRIGHT_MODULE_PATH ?? "/tmp/pw/node_modules/playwright";
const { chromium } = require(playwrightModulePath);
const repeat = Number(process.env.M62_REPEAT ?? "1");
const evidencePath =
  process.env.M62_EVIDENCE_PATH ?? "/tmp/m62-commercial-evidence.json";

const browser = await chromium.launch({ headless: true });
const evidence = { events: [], errors: [], repeat };

try {
  const page = await browser.newPage();
  page.on("pageerror", (error) => evidence.errors.push(error.message));
  await page.exposeFunction("recordM62Event", (event) =>
    evidence.events.push(event),
  );
  await page.goto("http://127.0.0.1:4185/runtime-config.js");
  await page.evaluate(() => {
    document.open();
    document.write(
      `<!doctype html><html><head><meta charset="utf-8"><script type="importmap">${JSON.stringify(
        {
          imports: {
            "@touristic/business/onboarding":
              "/packages/business/dist/onboarding.js",
            "@touristic/business/onboarding-host":
              "/packages/business/dist/onboarding-host.js",
            "@touristic/business/onboarding-presentation":
              "/packages/business/dist/onboarding-presentation.js",
            "@touristic/business/onboarding-recommendation":
              "/packages/business/dist/onboarding-recommendation.js",
            "@touristic/business/onboarding-steps":
              "/packages/business/dist/onboarding-steps.js",
            "@touristic/business/onboarding-workspace":
              "/packages/business/dist/onboarding-workspace.js",
            "@touristic/business/onboarding-commercial-conversion":
              "/packages/business/dist/onboarding-commercial-conversion.js",
          },
        },
      )}<\/script></head><body><main id="root"></main></body></html>`,
    );
    document.close();
  });

  const result = await page.evaluate(async () => {
    for (const name of [
      "businessCheckoutRequested",
      "businessCommercialCheckoutPrepared",
      "businessCommercialActivationReady",
    ]) {
      window.addEventListener(name, (event) =>
        window.recordM62Event({ name, detail: event.detail }),
      );
    }
    const onboarding = await import("/packages/business/dist/onboarding.js");
    const hostModule =
      await import("/packages/business/dist/onboarding-host.js");
    const runtimeModule =
      await import("/apps/morro-digital-platform/dist/business-onboarding-runtime.js");
    const surfaceModule =
      await import("/apps/morro-digital-platform/dist/business-onboarding-surface.js");
    const base = onboarding.createBusinessOnboardingSession(
      {
        context: {
          businessName: "Toca do Morcego",
          category: "events",
          specialty: "Sunset",
          objective: "events",
        },
      },
      new Date("2026-08-11T12:00:00.000Z"),
    );
    const finish = onboarding.transitionBusinessOnboarding(base, "finish", {
      reason: "m62-commercial-browser-contract",
    });
    const host = new hostModule.BusinessOnboardingHostController({
      session: finish,
    });
    const adapters = {
      discovery: { searchBusiness: async () => [] },
      location: {
        findExistingLocation: async () => null,
        requestDeviceLocation: async () => null,
      },
      assistant: { ask: async () => ({}) },
      route: {
        showRoute: async () => ({
          success: false,
          code: "NOT_USED",
          distanceMeters: 0,
          durationSeconds: 0,
          route: null,
          tutorial: true,
          excludeFromBusinessMetrics: true,
        }),
      },
    };
    const runtime = new runtimeModule.BusinessOnboardingRuntime(
      host,
      adapters,
      window,
    );
    const surface = new surfaceModule.BusinessOnboardingSurface({
      document,
      host,
      onRuntimeAction: (action) => runtime.handleAction(action),
    });
    surface.mount(document.querySelector("#root"));

    const form = document.querySelector('[data-commercial-conversion="true"]');
    if (!form) throw new Error("Commercial form missing");
    form.querySelector('[name="name"]').value = "<Luiz> Silva";
    form.querySelector('[name="email"]').value = " LUIZ@example.com ";
    form.querySelector('[name="phone"]').value = "75999999999";
    form.querySelector('[name="document"]').value = "12345678900";
    form.querySelector('[name="terms"]').checked = true;
    form.querySelector('[name="privacy"]').checked = true;

    const prepared = new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        window.removeEventListener(
          "businessCommercialCheckoutPrepared",
          onPrepared,
        );
        reject(
          new Error("Timed out waiting for businessCommercialCheckoutPrepared"),
        );
      }, 5000);
      function onPrepared(event) {
        if (event.detail?.planId !== "performance") return;
        window.clearTimeout(timeout);
        window.removeEventListener(
          "businessCommercialCheckoutPrepared",
          onPrepared,
        );
        resolve(event.detail);
      }
      window.addEventListener("businessCommercialCheckoutPrepared", onPrepared);
    });
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
    await prepared;

    const handoff =
      host.snapshot().session.conversationDraft.context
        .businessCommercialCheckoutHandoff;
    const wrong = await runtime.verifyPayment({
      verified: true,
      sessionId: "wrong-session",
      reference: "pay-wrong",
    });
    const unverified = await runtime.verifyPayment({
      verified: false,
      sessionId: handoff?.sessionId,
      reference: "pay-unverified",
    });
    const valid = await runtime.verifyPayment({
      verified: true,
      sessionId: handoff?.sessionId,
      reference: "<pay-1>",
      definitiveBusinessId: "business-1",
    });
    const activation =
      host.snapshot().session.conversationDraft.context
        .businessCommercialActivation;
    return {
      formText: form.textContent || "",
      handoff,
      wrong,
      unverified,
      valid,
      activation,
    };
  });

  if (result.handoff?.planId !== "performance")
    throw new Error(
      `Recommendation mismatch: ${JSON.stringify(result.handoff)}`,
    );
  if (
    result.handoff?.contractor?.name !== "Luiz Silva" ||
    result.handoff?.contractor?.email !== "luiz@example.com"
  )
    throw new Error(
      `Contractor sanitization mismatch: ${JSON.stringify(result.handoff)}`,
    );
  if (
    result.handoff?.requiresPaymentsCapability !== true ||
    result.handoff?.tutorial !== false
  )
    throw new Error(
      `Payments boundary mismatch: ${JSON.stringify(result.handoff)}`,
    );
  if (
    "paymentStatus" in (result.handoff || {}) ||
    "checkoutUrl" in (result.handoff || {}) ||
    "publicToken" in (result.handoff || {})
  )
    throw new Error("Business handoff contains payment execution state");
  if (!result.formText.includes("Nenhum pagamento é executado nesta tela"))
    throw new Error("Payments ownership disclosure missing");
  if (
    result.wrong !== false ||
    result.unverified !== false ||
    result.valid !== true
  )
    throw new Error("Payment verification gate diverged");
  if (
    result.activation?.paymentStatus !== "CONFIRMED" ||
    result.activation?.paymentReference !== "pay-1" ||
    result.activation?.activationStatus !== "READY_TO_CONVERT"
  )
    throw new Error(
      `Activation mismatch: ${JSON.stringify(result.activation)}`,
    );
  const activations = evidence.events.filter(
    (event) => event.name === "businessCommercialActivationReady",
  );
  if (
    activations.length !== 1 ||
    activations[0].detail?.verifiedByPaymentsBoundary !== true
  )
    throw new Error(
      `Activation event mismatch: ${JSON.stringify(activations)}`,
    );
  if (evidence.errors.length)
    throw new Error(`Browser errors: ${JSON.stringify(evidence.errors)}`);
  Object.assign(evidence, { result, status: "PASS" });
  writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ contract: "M62", status: "PASS", repeat }));
} finally {
  await browser.close();
}
