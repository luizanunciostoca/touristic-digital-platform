import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import {
  FIXED_ISO,
  MANUAL_HASHES,
  SURFACES,
  VIEWPORTS,
  fixtureResponse,
} from "./control-center-visual-fixtures.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("/tmp/cc-visual/node_modules/playwright");
const pixelmatch = require("/tmp/cc-visual/node_modules/pixelmatch");
const { PNG } = require("/tmp/cc-visual/node_modules/pngjs");

const ROOT = process.cwd();
const BASELINE_ROOT = resolve(
  ROOT,
  "tests/visual-regression/control-center/baselines",
);
const MANIFEST_PATH = join(BASELINE_ROOT, "manifest.json");
const OUTPUT_ROOT =
  process.env.CONTROL_CENTER_VISUAL_OUTPUT ||
  "/tmp/control-center-visual-regression";
const ACTUAL_ROOT = join(OUTPUT_ROOT, "actual");
const EXPECTED_ROOT = join(OUTPUT_ROOT, "expected");
const DIFF_ROOT = join(OUTPUT_ROOT, "diff");
const REPORT_PATH = join(OUTPUT_ROOT, "report.json");
const UPDATE = process.argv.includes("--update");
const ORIGIN = process.env.CONTROL_CENTER_ORIGIN || "http://127.0.0.1:4194";
const PASSWORD =
  process.env.CONTROL_CENTER_VISUAL_PASSWORD ||
  "control center visual regression fixture";
const PIXELMATCH_THRESHOLD = 0.08;
const MAX_DIFF_RATIO = 0.0002;

const TOKEN_EXPECTED = Object.freeze({
  bg: "#f4f8fc",
  surface: "#ffffff",
  text: "#0b2447",
  primary: "#0b63ce",
  border: "#dce6f1",
  success: "#10a760",
  warning: "#d97706",
  danger: "#d92d20",
  topbar: "64px",
});

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function resetOutput() {
  rmSync(OUTPUT_ROOT, { recursive: true, force: true });
  ensureDir(ACTUAL_ROOT);
  ensureDir(EXPECTED_ROOT);
  ensureDir(DIFF_ROOT);
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

async function installApiFixtures(page) {
  await page.route("**/api/admin/v1/**", async (route) => {
    const request = route.request();
    const response = fixtureResponse(new URL(request.url()), request.method());
    await route.fulfill({
      status: response.status,
      contentType: "application/json; charset=utf-8",
      headers: { "cache-control": "no-store" },
      body: JSON.stringify(response.body),
    });
  });
}

function fontCss() {
  const files = [
    [400, "inter-latin-400-normal.woff2"],
    [500, "inter-latin-500-normal.woff2"],
    [600, "inter-latin-600-normal.woff2"],
    [700, "inter-latin-700-normal.woff2"],
  ];
  const faces = files
    .map(([weight, file]) => {
      const path =
        "/tmp/cc-visual/node_modules/@fontsource/inter/files/" + file;
      const b64 = readFileSync(path).toString("base64");
      return (
        '@font-face{font-family:"CCVisualInter";src:url(data:font/woff2;base64,' +
        b64 +
        ') format("woff2");font-style:normal;font-weight:' +
        weight +
        ";font-display:block;}"
      );
    })
    .join("\n");

  return (
    faces +
    '\nhtml,body,button,input,select,textarea{font-family:"CCVisualInter",sans-serif!important}' +
    "\n*,*::before,*::after{animation:none!important;transition:none!important;" +
    "scroll-behavior:auto!important;caret-color:transparent!important}\n"
  );
}

async function login(context) {
  const response = await context.request.post(
    ORIGIN + "/api/dashboard/auth/login",
    {
      headers: { Origin: ORIGIN, "Content-Type": "application/json" },
      data: {
        email: "platform-owner@example.com",
        password: PASSWORD,
      },
    },
  );
  if (response.status() !== 200) {
    throw new Error(
      "VISUAL_LOGIN_FAILED:" +
        response.status() +
        ":" +
        (await response.text()),
    );
  }
}

async function navigate(page, surface) {
  await page.evaluate((hash) => {
    location.hash = hash;
  }, surface.route);
  await page.waitForURL((url) => url.hash === surface.route, {
    timeout: 30000,
  });
  await page
    .locator(
      '#content[data-rendered-view="' + surface.view + '"][aria-busy="false"]',
    )
    .waitFor({ state: "attached", timeout: 30000 });

  if (surface.view === "overview") {
    await page.locator(".kpi-grid .metric-card").first().waitFor({
      state: "visible",
      timeout: 30000,
    });
  }
  if (surface.entity360) {
    await page.locator(".entity-header[data-ux-v1]").waitFor({
      state: "visible",
      timeout: 30000,
    });
  }

  await page.evaluate(async () => {
    await document.fonts.ready;
    const app = document.querySelector("#app");
    if (app && app.classList.contains("menu-open")) {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    }
    const pageRegion = document.querySelector(".page");
    if (pageRegion) pageRegion.scrollTop = 0;
    document
      .querySelectorAll(".table-wrap,.entity-tabs,#main-nav")
      .forEach((element) => {
        element.scrollTop = 0;
        element.scrollLeft = 0;
      });
    const search = document.querySelector("#global-search");
    if (search) search.blur();
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
  });
}

async function manualContract(page, surface, viewport) {
  const result = await page.evaluate(
    ({ surfaceId, viewportLabel }) => {
      const root = getComputedStyle(document.documentElement);
      const token = (name) => root.getPropertyValue(name).trim().toLowerCase();
      const noQuickActions =
        document.querySelectorAll(
          ".quick-actions,[data-quick-actions],#quick-actions",
        ).length === 0;
      const noFloatingAssistant =
        document.querySelectorAll(
          ".assistant-fab,.assistant-floating,#assistant-floating,#assistant-trigger,[data-assistant-floating]",
        ).length === 0;
      const documentOverflow =
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth + 2;

      return {
        surface: surfaceId,
        viewport: viewportLabel,
        noQuickActions,
        noFloatingAssistant,
        documentOverflow,
        tokens: {
          bg: token("--md-bg"),
          surface: token("--md-surface"),
          text: token("--md-text"),
          primary: token("--md-primary"),
          border: token("--md-border"),
          success: token("--md-success"),
          warning: token("--md-warning"),
          danger: token("--md-danger"),
          sidebar: token("--md-sidebar-width"),
          topbar: token("--md-topbar-height"),
        },
      };
    },
    { surfaceId: surface.id, viewportLabel: viewport.label },
  );

  const findings = [];
  if (!result.noQuickActions) {
    findings.push({ severity: "P0", code: "QUICK_ACTIONS_REINTRODUCED" });
  }
  if (!result.noFloatingAssistant) {
    findings.push({ severity: "P0", code: "FLOATING_ASSISTANT_REINTRODUCED" });
  }
  if (result.documentOverflow) {
    findings.push({ severity: "P1", code: "DOCUMENT_HORIZONTAL_OVERFLOW" });
  }
  for (const [key, expected] of Object.entries(TOKEN_EXPECTED)) {
    if (result.tokens[key] !== expected) {
      findings.push({
        severity: "P1",
        code: "MANUAL_TOKEN_DIVERGENCE",
        token: key,
        expected,
        actual: result.tokens[key],
      });
    }
  }
  if (viewport.width >= 1440 && result.tokens.sidebar !== "224px") {
    findings.push({
      severity: "P1",
      code: "MANUAL_SIDEBAR_DIVERGENCE",
      expected: "224px",
      actual: result.tokens.sidebar,
    });
  }
  return { ...result, findings };
}

function diffPng(expectedPath, actualPath, diffPath) {
  const expected = PNG.sync.read(readFileSync(expectedPath));
  const actual = PNG.sync.read(readFileSync(actualPath));
  if (expected.width !== actual.width || expected.height !== actual.height) {
    return {
      passed: false,
      reason: "dimension-mismatch",
      expectedDimensions: {
        width: expected.width,
        height: expected.height,
      },
      actualDimensions: {
        width: actual.width,
        height: actual.height,
      },
      diffPixels: expected.width * expected.height,
      diffRatio: 1,
    };
  }

  const diff = new PNG({ width: actual.width, height: actual.height });
  const diffPixels = pixelmatch(
    expected.data,
    actual.data,
    diff.data,
    actual.width,
    actual.height,
    {
      threshold: PIXELMATCH_THRESHOLD,
      includeAA: false,
      alpha: 0.5,
      diffMask: false,
    },
  );
  ensureDir(dirname(diffPath));
  writeFileSync(diffPath, PNG.sync.write(diff));

  const pixelCount = actual.width * actual.height;
  const diffRatio = diffPixels / pixelCount;
  return {
    passed: diffRatio <= MAX_DIFF_RATIO,
    reason:
      diffRatio <= MAX_DIFF_RATIO ? "within-tolerance" : "visual-difference",
    width: actual.width,
    height: actual.height,
    pixelCount,
    diffPixels,
    diffRatio,
  };
}

async function main() {
  resetOutput();
  ensureDir(BASELINE_ROOT);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: VIEWPORTS[0],
    locale: "pt-BR",
    timezoneId: "America/Bahia",
    colorScheme: "light",
    reducedMotion: "reduce",
    deviceScaleFactor: 1,
  });

  const fixedMs = Date.parse(FIXED_ISO);
  await context.addInitScript(
    ({ fixed }) => {
      const RealDate = Date;
      class FixedDate extends RealDate {
        constructor(...args) {
          super(...(args.length ? args : [fixed]));
        }
        static now() {
          return fixed;
        }
      }
      Object.setPrototypeOf(FixedDate, RealDate);
      globalThis.Date = FixedDate;
      Math.random = () => 0.3141592653589793;
    },
    { fixed: fixedMs },
  );

  const page = await context.newPage();
  const runtimeErrors = [];
  const consoleErrors = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  try {
    await login(context);
    await installApiFixtures(page);
    await page.goto(
      ORIGIN + "/apps/control-center/public/index.html#overview",
      { waitUntil: "domcontentloaded", timeout: 30000 },
    );
    await page.locator("#app:not([hidden])").waitFor({
      state: "visible",
      timeout: 30000,
    });
    await page.addStyleTag({ content: fontCss() });
    await page.evaluate(async () => document.fonts.ready);

    const results = [];
    const manual = [];
    const fileHashes = {};
    let visualFailures = 0;
    let manualP0 = 0;
    let manualP1 = 0;

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);

      for (const surface of SURFACES) {
        await navigate(page, surface);
        const manualResult = await manualContract(page, surface, viewport);
        manual.push(manualResult);
        manualP0 += manualResult.findings.filter(
          (finding) => finding.severity === "P0",
        ).length;
        manualP1 += manualResult.findings.filter(
          (finding) => finding.severity === "P1",
        ).length;

        const relative = surface.id + "/" + viewport.label + ".png";
        const actualPath = join(ACTUAL_ROOT, relative);
        const expectedPath = join(BASELINE_ROOT, relative);
        const expectedArtifactPath = join(EXPECTED_ROOT, relative);
        const diffPath = join(DIFF_ROOT, relative);
        ensureDir(dirname(actualPath));
        ensureDir(dirname(expectedArtifactPath));

        await page.screenshot({
          path: actualPath,
          fullPage: false,
          animations: "disabled",
          caret: "hide",
        });

        if (UPDATE) {
          ensureDir(dirname(expectedPath));
          copyFileSync(actualPath, expectedPath);
          copyFileSync(actualPath, expectedArtifactPath);
          fileHashes[relative] = sha256(actualPath);
          results.push({
            surface: surface.id,
            viewport: viewport.label,
            status: "BASELINE_UPDATED",
            actual: relative,
            expected: relative,
            diffPixels: 0,
            diffRatio: 0,
          });
          continue;
        }

        if (!existsSync(expectedPath)) {
          visualFailures += 1;
          results.push({
            surface: surface.id,
            viewport: viewport.label,
            status: "FAIL",
            reason: "baseline-missing",
            actual: relative,
            expected: relative,
          });
          console.error("VISUAL_FAIL baseline-missing " + relative);
          continue;
        }

        copyFileSync(expectedPath, expectedArtifactPath);
        const diff = diffPng(expectedPath, actualPath, diffPath);
        if (!diff.passed) visualFailures += 1;
        results.push({
          surface: surface.id,
          viewport: viewport.label,
          status: diff.passed ? "PASS" : "FAIL",
          actual: relative,
          expected: relative,
          diff: relative,
          ...diff,
        });
        console.log(
          (diff.passed ? "VISUAL_PASS " : "VISUAL_FAIL ") +
            relative +
            " diffPixels=" +
            diff.diffPixels +
            " diffRatio=" +
            diff.diffRatio,
        );
      }
    }

    const report = {
      schemaVersion: 1,
      mode: UPDATE ? "update" : "compare",
      status:
        visualFailures === 0 &&
        manualP0 === 0 &&
        manualP1 === 0 &&
        runtimeErrors.length === 0 &&
        consoleErrors.length === 0
          ? "PASS"
          : "FAIL",
      sourceSha:\n        process.env.CONTROL_CENTER_VISUAL_SOURCE_SHA ||\n        process.env.GITHUB_SHA ||\n        "local",
      fixedTime: FIXED_ISO,
      timezone: "America/Bahia",
      locale: "pt-BR",
      browser: "playwright-chromium-1.54.2",
      font: "@fontsource/inter-5.2.5",
      manualHashes: MANUAL_HASHES,
      threshold: {
        pixelmatch: PIXELMATCH_THRESHOLD,
        maxDiffRatio: MAX_DIFF_RATIO,
        rationale:
          "0.08 filters subpixel anti-aliasing noise; 0.02% total pixels still fails material geometry, spacing, typography, hierarchy, color and component drift.",
      },
      viewports: VIEWPORTS,
      surfaces: SURFACES,
      screenshotCount: VIEWPORTS.length * SURFACES.length,
      visualFailures,
      manualP0,
      manualP1,
      results,
      manual,
      runtimeErrors,
      consoleErrors,
    };

    writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

    if (UPDATE) {
      const nextManifest = {
        schemaVersion: 1,
        bootstrapPending: false,
        baselineGeneratedFromSha:\n          process.env.CONTROL_CENTER_VISUAL_SOURCE_SHA ||\n          process.env.GITHUB_SHA ||\n          "local",
        sourceManualSha256: MANUAL_HASHES,
        browser: report.browser,
        font: report.font,
        fixedTime: FIXED_ISO,
        timezone: report.timezone,
        locale: report.locale,
        threshold: report.threshold,
        viewports: VIEWPORTS,
        surfaces: SURFACES,
        screenshotCount: report.screenshotCount,
        files: fileHashes,
      };
      writeFileSync(
        MANIFEST_PATH,
        JSON.stringify(nextManifest, null, 2) + "\n",
      );
    }

    if (report.status !== "PASS") {
      throw new Error(
        "CONTROL_CENTER_VISUAL_REGRESSION_FAILED:" +
          JSON.stringify({
            visualFailures,
            manualP0,
            manualP1,
            runtimeErrors: runtimeErrors.length,
            consoleErrors: consoleErrors.length,
            report: REPORT_PATH,
          }),
      );
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
