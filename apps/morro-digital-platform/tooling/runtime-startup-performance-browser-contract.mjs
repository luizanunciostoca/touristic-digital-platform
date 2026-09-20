import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "/tmp/pw/node_modules/playwright/index.mjs";

const budget = JSON.parse(
  await readFile(
    new URL(
      "../../../tooling/performance/morro-digital-budget.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

const limits = budget.runtime;
if (
  !limits ||
  !Number.isFinite(limits.assistantStartupMs) ||
  !Number.isFinite(limits.mapStartupMs)
) {
  throw new Error("RUNTIME_STARTUP_BUDGETS_MISSING");
}

const browser = await chromium.launch({ headless: true });
let report;

try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    geolocation: { latitude: -13.3776181, longitude: -38.9142193 },
    permissions: ["geolocation"],
  });
  await context.addInitScript(() => {
    localStorage.setItem("morro-digital-onboarded", "1");
    localStorage.setItem("voice-enabled", "false");
  });

  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("http://127.0.0.1:4173/", {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });

  await page
    .locator("html[data-assistant-startup-ms][data-map-startup-ms]")
    .waitFor({ state: "attached", timeout: 30_000 });
  await page
    .locator('#map[data-map-state="ready"][data-map-mode="real"]')
    .waitFor({ state: "attached", timeout: 30_000 });

  const metrics = await page.evaluate(() => ({
    assistantStartupMs: Number(
      document.documentElement.dataset.assistantStartupMs,
    ),
    mapStartupMs: Number(document.documentElement.dataset.mapStartupMs),
    assistantMarkCount: performance.getEntriesByName(
      "morro:assistant-ready",
      "mark",
    ).length,
    mapMarkCount: performance.getEntriesByName("morro:map-ready", "mark")
      .length,
  }));

  const failures = [];
  for (const key of ["assistantStartupMs", "mapStartupMs"]) {
    if (!Number.isFinite(metrics[key]) || metrics[key] < 0) {
      failures.push(`${key} is invalid: ${metrics[key]}`);
    }
  }
  if (metrics.assistantStartupMs > limits.assistantStartupMs) {
    failures.push(
      `assistantStartupMs exceeded: ${metrics.assistantStartupMs}ms > ${limits.assistantStartupMs}ms`,
    );
  }
  if (metrics.mapStartupMs > limits.mapStartupMs) {
    failures.push(
      `mapStartupMs exceeded: ${metrics.mapStartupMs}ms > ${limits.mapStartupMs}ms`,
    );
  }
  if (metrics.assistantStartupMs > metrics.mapStartupMs) {
    failures.push(
      "Assistant readiness arrived after map readiness; startup instrumentation order is invalid.",
    );
  }
  if (metrics.assistantMarkCount !== 1 || metrics.mapMarkCount !== 1) {
    failures.push(
      `startup marks must be emitted exactly once: ${JSON.stringify(metrics)}`,
    );
  }
  if (pageErrors.length > 0) {
    failures.push(`browser errors: ${JSON.stringify(pageErrors)}`);
  }

  report = {
    schemaVersion: budget.schemaVersion,
    status: failures.length === 0 ? "pass" : "fail",
    limits,
    actual: metrics,
    failures,
  };

  await context.close();

  if (failures.length > 0) {
    throw new Error(`RUNTIME_STARTUP_BUDGET_FAILED: ${failures.join("; ")}`);
  }
} finally {
  await browser.close();
  if (report) {
    await writeFile(
      "/tmp/morro-runtime-startup-performance.json",
      `${JSON.stringify(report, null, 2)}\n`,
      "utf8",
    );
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  }
}
