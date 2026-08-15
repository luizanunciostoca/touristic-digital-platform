import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE || "/tmp/pw/node_modules/playwright",
);

const origin =
  process.env.BUSINESS_ONBOARDING_ORIGIN || "http://127.0.0.1:4181";
const url = `${origin}/apps/morro-digital-platform/public/business-onboarding.html`;
const sessionKey = "morro-digital-business-onboarding-session-v2";
const initializationMarker =
  "business-onboarding-lifecycle-contract-initialized";
const evidencePath =
  process.env.BUSINESS_ONBOARDING_EVIDENCE ||
  "/tmp/business-onboarding-lifecycle-browser-evidence.json";
const eventNames = [
  "businessTutorialActivityChanged",
  "businessConversationAbandoned",
  "businessConversationPaused",
  "businessConversationRestarted",
  "businessConversationResumed",
  "businessConversationCompleted",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function storedSession(page) {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  }, sessionKey);
}

async function currentEvents(page) {
  return page.evaluate(() => window.__businessLifecycleEvents || []);
}

async function waitForSurface(page) {
  await page
    .locator("#businessOnboardingSurface")
    .waitFor({ state: "visible" });
  await page.waitForFunction(
    () => document.activeElement?.id === "businessOnboardingTitle",
  );
}

const browser = await chromium.launch({ headless: true });
const evidence = { errors: [], events: [], checkpoints: {} };

try {
  const page = await browser.newPage();
  page.on("pageerror", (error) => evidence.errors.push(error.message));
  await page.exposeFunction("recordBusinessLifecycleEvent", (event) => {
    evidence.events.push(event);
  });
  await page.addInitScript(
    ({ eventNames: names, initializationMarker: marker, sessionKey: key }) => {
      try {
        if (!sessionStorage.getItem(marker)) {
          localStorage.removeItem(key);
          sessionStorage.setItem(marker, "1");
        }
      } catch {
        // The contract runs on a normal HTTP origin. Ignore pre-origin frames.
      }
      window.__businessLifecycleEvents = [];
      for (const name of names) {
        window.addEventListener(name, (event) => {
          const record = { name, detail: event.detail ?? null };
          window.__businessLifecycleEvents.push(record);
          void window.recordBusinessLifecycleEvent(record);
        });
      }
    },
    {
      eventNames,
      initializationMarker,
      sessionKey,
    },
  );

  await page.goto(url, { waitUntil: "domcontentloaded" });
  await waitForSurface(page);

  const initial = await page.evaluate(() => {
    const root = document.querySelector("#businessOnboardingSurface");
    const title = document.querySelector("#businessOnboardingTitle");
    const status = document.querySelector("#businessOnboardingStatus");
    return {
      role: root?.getAttribute("role"),
      modal: root?.getAttribute("aria-modal"),
      labelledBy: root?.getAttribute("aria-labelledby"),
      describedBy: root?.getAttribute("aria-describedby"),
      titleTabIndex: title?.getAttribute("tabindex"),
      activeElementId: document.activeElement?.id,
      statusLive: status?.getAttribute("aria-live"),
      statusAtomic: status?.getAttribute("aria-atomic"),
      pauseVisible: Boolean(
        document.querySelector('[data-browser-lifecycle-action="pause"]'),
      ),
      restartVisible: Boolean(
        document.querySelector('[data-browser-lifecycle-action="restart"]'),
      ),
    };
  });
  assert(
    initial.role === "dialog",
    `Expected dialog role: ${JSON.stringify(initial)}`,
  );
  assert(
    initial.modal === "true",
    `Expected modal semantics: ${JSON.stringify(initial)}`,
  );
  assert(
    initial.labelledBy === "businessOnboardingTitle" &&
      initial.describedBy === "businessOnboardingDescription",
    `Dialog accessible name/description diverged: ${JSON.stringify(initial)}`,
  );
  assert(
    initial.titleTabIndex === "-1" &&
      initial.activeElementId === "businessOnboardingTitle",
    `Initial focus was not placed on the step heading: ${JSON.stringify(initial)}`,
  );
  assert(
    initial.statusLive === "polite" && initial.statusAtomic === "true",
    `Status live-region semantics diverged: ${JSON.stringify(initial)}`,
  );
  assert(
    initial.pauseVisible && initial.restartVisible,
    "Lifecycle controls are missing",
  );

  await page.locator('[data-action="next"]').focus();
  await page.keyboard.press("Tab");
  const wrappedFocus = await page.evaluate(() => ({
    action: document.activeElement?.getAttribute("data-action"),
    label: document.activeElement?.getAttribute("aria-label"),
  }));
  assert(
    wrappedFocus.action === "skip" &&
      wrappedFocus.label === "Pular tutorial por agora",
    `Focus trap did not wrap inside the dialog: ${JSON.stringify(wrappedFocus)}`,
  );

  const next = page.locator('[data-action="next"]');
  await next.click();
  await page
    .getByRole("heading", { name: "Qual é a categoria principal?" })
    .waitFor();
  await page.locator('[data-input-value="events"]').click();
  await page.locator('[data-action="back"]').click();
  await page
    .getByRole("heading", {
      name: "Veja como turistas encontram e escolhem o seu negócio",
    })
    .waitFor();
  await next.click();
  await page
    .getByRole("heading", { name: "Qual é a categoria principal?" })
    .waitFor();
  assert(
    (await page
      .locator('[data-input-value="events"]')
      .getAttribute("aria-pressed")) === "true",
    "Back/forward navigation lost the selected category",
  );

  await page.getByRole("button", { name: "Pausar e sair" }).click();
  await page
    .locator("#businessOnboardingSurface")
    .waitFor({ state: "detached" });
  const paused = await storedSession(page);
  assert(
    paused?.status === "PAUSED",
    `Pause did not persist PAUSED: ${JSON.stringify(paused)}`,
  );
  assert(
    paused?.stepId === "category",
    `Pause lost current step: ${JSON.stringify(paused)}`,
  );
  assert(
    paused?.context?.category === "events",
    "Pause lost current step input",
  );
  assert(
    (await currentEvents(page)).some(
      (event) =>
        event.name === "businessConversationPaused" &&
        event.detail?.reason === "user_pause" &&
        event.detail?.status === "PAUSED",
    ),
    "Missing explicit pause lifecycle event",
  );

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForSurface(page);
  await page
    .getByRole("heading", { name: "Qual é a categoria principal?" })
    .waitFor();
  const resumed = await storedSession(page);
  assert(
    resumed?.status === "ACTIVE",
    `Paused session did not resume ACTIVE: ${JSON.stringify(resumed)}`,
  );
  assert(
    resumed?.stepId === "category",
    `Resume lost current step: ${JSON.stringify(resumed)}`,
  );
  assert(
    (await page
      .locator('[data-input-value="events"]')
      .getAttribute("aria-pressed")) === "true",
    "Resume lost selected category",
  );
  assert(
    (await currentEvents(page)).some(
      (event) =>
        event.name === "businessConversationResumed" &&
        event.detail?.stepId === "category" &&
        event.detail?.previousStatus === "PAUSED",
    ),
    "Missing resume lifecycle event",
  );

  await page.getByRole("button", { name: "Reiniciar" }).click();
  await page
    .getByRole("heading", {
      name: "Veja como turistas encontram e escolhem o seu negócio",
    })
    .waitFor();
  const restarted = await storedSession(page);
  assert(
    restarted?.status === "ACTIVE" && restarted?.stepId === "welcome",
    `Restart did not reset lifecycle state: ${JSON.stringify(restarted)}`,
  );
  assert(
    restarted?.context?.category === undefined,
    "Restart retained stale input context",
  );
  assert(
    (await currentEvents(page)).some(
      (event) =>
        event.name === "businessConversationRestarted" &&
        event.detail?.stepId === "welcome",
    ),
    "Missing restart lifecycle event",
  );

  await next.click();
  await page
    .getByRole("heading", { name: "Qual é a categoria principal?" })
    .waitFor();
  await page.locator('[data-input-value="events"]').click();
  await page.getByRole("button", { name: "Pular tutorial por agora" }).click();
  await page
    .locator("#businessOnboardingSurface")
    .waitFor({ state: "detached" });
  const skipped = await storedSession(page);
  assert(
    skipped?.status === "PAUSED" && skipped?.stepId === "category",
    `Skip must remain resumable: ${JSON.stringify(skipped)}`,
  );
  assert(
    (await currentEvents(page)).some(
      (event) =>
        event.name === "businessConversationAbandoned" &&
        event.detail?.reason === "user_skip" &&
        event.detail?.status === "PAUSED",
    ),
    "Missing skip/abandon lifecycle event",
  );

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForSurface(page);
  await page
    .getByRole("heading", { name: "Qual é a categoria principal?" })
    .waitFor();

  await page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    if (!raw)
      throw new Error("Missing resumable session before completion proof");
    const payload = JSON.parse(raw);
    payload.status = "ACTIVE";
    payload.stepId = "finish";
    payload.updatedAt = new Date().toISOString();
    localStorage.setItem(key, JSON.stringify(payload));
  }, sessionKey);
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForSurface(page);
  const finishState = await storedSession(page);
  assert(
    finishState?.stepId === "finish",
    `Failed to restore final step: ${JSON.stringify(finishState)}`,
  );
  await page.locator('[data-action="next"]').click();
  await page
    .locator("#businessOnboardingSurface")
    .waitFor({ state: "detached" });
  assert(
    (await storedSession(page)) === null,
    "Completed onboarding remained resumable",
  );
  assert(
    (await currentEvents(page)).some(
      (event) =>
        event.name === "businessConversationCompleted" &&
        event.detail?.status === "COMPLETED",
    ),
    "Missing completion lifecycle event",
  );

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForSurface(page);
  await page
    .getByRole("heading", {
      name: "Veja como turistas encontram e escolhem o seu negócio",
    })
    .waitFor();
  await page.keyboard.press("Escape");
  await page
    .locator("#businessOnboardingSurface")
    .waitFor({ state: "detached" });
  const escaped = await storedSession(page);
  assert(
    escaped?.status === "PAUSED" && escaped?.stepId === "welcome",
    `Escape did not pause the dialog safely: ${JSON.stringify(escaped)}`,
  );

  if (evidence.errors.length) {
    throw new Error(`Browser errors: ${JSON.stringify(evidence.errors)}`);
  }

  evidence.checkpoints = {
    initial,
    wrappedFocus,
    paused,
    resumed,
    restarted,
    skipped,
    finishState,
    escaped,
  };
  evidence.result = "PASS";
  writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
} finally {
  await browser.close();
}
