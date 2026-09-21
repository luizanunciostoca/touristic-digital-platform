import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("/tmp/pw/node_modules/playwright");
const axePath = require.resolve("/tmp/pw/node_modules/axe-core/axe.min.js");

const origin = "http://127.0.0.1:4194";
const password = "control center browser fixture";
const evidencePath = "/tmp/control-center-accessibility-evidence.json";
const authStatePath = "/tmp/control-center-a11y-auth-state.json";

const viewports = [
  { width: 1440, height: 900, label: "1440x900" },
  { width: 1280, height: 800, label: "1280x800" },
  { width: 1024, height: 768, label: "1024x768" },
  { width: 768, height: 1024, label: "768x1024" },
  { width: 430, height: 932, label: "430x932" },
  { width: 390, height: 844, label: "390x844" },
];

function persistEvidence(evidence) {
  writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
}

async function navigate(page, view, detail = "") {
  const hash = detail ? `#${view}:${encodeURIComponent(detail)}` : `#${view}`;
  await page.evaluate((nextHash) => {
    location.hash = nextHash;
  }, hash);
  await page.waitForURL((url) => url.hash === hash, { timeout: 30_000 });
  await page
    .locator(`#content[data-rendered-view="${view}"][aria-busy="false"]`)
    .waitFor({ state: "attached", timeout: 30_000 });
  if (view === "overview") {
    await page.locator(".kpi-grid .metric-card").first().waitFor({
      state: "visible",
      timeout: 15_000,
    });
  }
  if (detail && ["users", "businesses", "affiliates"].includes(view)) {
    await page.locator(".entity-header[data-ux-v1]").waitFor({
      state: "visible",
      timeout: 15_000,
    });
  }
}

async function audit(page, target, viewport) {
  await page.setViewportSize(viewport);
  await navigate(page, target.view, target.detail);

  return page.evaluate(
    async ({ targetLabel, viewportLabel }) => {
      const result = await globalThis.axe.run(document, {
        runOnly: {
          type: "tag",
          values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"],
        },
      });

      const visible = (element) => {
        if (!(element instanceof HTMLElement) || element.hidden) return false;
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          rect.width > 0 &&
          rect.height > 0
        );
      };

      const scrollableRegions = [...document.querySelectorAll("body *")]
        .filter((element) => {
          if (!(element instanceof HTMLElement) || !visible(element))
            return false;
          const style = getComputedStyle(element);
          const canScroll =
            /(auto|scroll)/u.test(style.overflowX) ||
            /(auto|scroll)/u.test(style.overflowY);
          return (
            canScroll &&
            (element.scrollWidth > element.clientWidth + 1 ||
              element.scrollHeight > element.clientHeight + 1)
          );
        })
        .map((element) => ({
          tag: element.tagName,
          id: element.id,
          className: element.className,
          tabIndex: element.tabIndex,
          hasFocusableDescendant: Boolean(
            element.querySelector(
              'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
            ),
          ),
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
          clientHeight: element.clientHeight,
          scrollHeight: element.scrollHeight,
        }));

      const inaccessibleScrollable = scrollableRegions.filter(
        (region) => region.tabIndex < 0 && !region.hasFocusableDescendant,
      );

      const liveContent = document
        .querySelector("#content")
        ?.hasAttribute("aria-live");
      const h1Count = [...document.querySelectorAll("h1")].filter(
        visible,
      ).length;

      return {
        target: targetLabel,
        viewport: viewportLabel,
        violations: result.violations.map((violation) => ({
          id: violation.id,
          impact: violation.impact,
          help: violation.help,
          nodes: violation.nodes.slice(0, 8).map((node) => ({
            target: node.target,
            html: node.html,
            failureSummary: node.failureSummary,
          })),
        })),
        scrollableRegions,
        inaccessibleScrollable,
        liveContent,
        h1Count,
        documentOverflow:
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth + 2,
      };
    },
    {
      targetLabel: target.detail
        ? `${target.view}:${target.detail}`
        : target.view,
      viewportLabel: viewport.label,
    },
  );
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const evidence = [];
  let currentTarget = "__bootstrap__";
  let stage = "bootstrap";
  let page = null;

  try {
    stage = "browser-context";
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    stage = "axe-register";
    await context.addInitScript({ path: axePath });
    stage = "login";
    const login = await context.request.post(
      `${origin}/api/dashboard/auth/login`,
      {
        headers: { Origin: origin, "Content-Type": "application/json" },
        data: { email: "platform-owner-a11y@example.com", password },
      },
    );
    if (login.status() !== 200) throw new Error("OWNER_LOGIN_FAILED");
    await context.storageState({ path: authStatePath });

    stage = "page-create";
    page = await context.newPage();
    stage = "page-goto";
    await page.goto(
      `${origin}/apps/control-center/public/index.html#overview`,
      { waitUntil: "domcontentloaded", timeout: 30_000 },
    );
    stage = "app-ready";
    await page.locator("#app:not([hidden])").waitFor({ timeout: 15_000 });
    stage = "axe-ready";
    await page.waitForFunction(() => Boolean(globalThis.axe), null, {
      timeout: 10_000,
    });

    stage = "nav-discovery";
    const views = await page
      .locator("#main-nav [data-view]")
      .evaluateAll((nodes) => [
        ...new Set(nodes.map((node) => node.dataset.view).filter(Boolean)),
      ]);

    const desktop = viewports.find((viewport) => viewport.label === "1280x800");
    for (const view of views) {
      currentTarget = view;
      stage = "axe-desktop-route";
      const result = await audit(page, { view }, desktop);
      evidence.push(result);
      persistEvidence(evidence);
    }

    const criticalTargets = [
      { view: "overview" },
      { view: "users", detail: "business-owner-1" },
      { view: "businesses", detail: "toca-do-morcego" },
      { view: "financial" },
      { view: "support" },
    ];

    for (const viewport of viewports.filter(
      (candidate) => candidate.label !== "1280x800",
    )) {
      for (const target of criticalTargets) {
        currentTarget = target.detail
          ? `${target.view}:${target.detail}`
          : target.view;
        stage = "axe-responsive-critical";
        const result = await audit(page, target, viewport);
        evidence.push(result);
        persistEvidence(evidence);
      }
    }

    const failures = evidence.filter(
      (entry) =>
        entry.violations.length > 0 ||
        entry.inaccessibleScrollable.length > 0 ||
        entry.liveContent ||
        entry.h1Count !== 1 ||
        entry.documentOverflow,
    );
    if (failures.length) {
      throw new Error(
        `ACCESSIBILITY_VIOLATIONS:${JSON.stringify(
          failures.map((entry) => ({
            target: entry.target,
            viewport: entry.viewport,
            violations: entry.violations.map((violation) => violation.id),
            inaccessibleScrollable: entry.inaccessibleScrollable,
            liveContent: entry.liveContent,
            h1Count: entry.h1Count,
            documentOverflow: entry.documentOverflow,
          })),
        )}`,
      );
    }

    persistEvidence(evidence);
    console.log(
      `CONTROL_CENTER_ACCESSIBILITY_PASS:${evidence.length}_SCANS:VIEWPORTS=6/6`,
    );
    await context.close();
  } catch (error) {
    let runtimeState = null;
    if (page) {
      runtimeState = await page
        .evaluate(() => ({
          hash: location.hash,
          renderedView:
            document.querySelector("#content")?.dataset.renderedView ?? null,
          ariaBusy:
            document.querySelector("#content")?.getAttribute("aria-busy") ??
            null,
          contentText:
            document
              .querySelector("#content")
              ?.textContent?.trim()
              .slice(0, 500) ?? null,
        }))
        .catch(() => null);
    }
    evidence.push({
      target: currentTarget,
      stage,
      runtimeFailure: error instanceof Error ? error.name : "UnknownError",
      runtimeMessage: error instanceof Error ? error.message : String(error),
      runtimeState,
    });
    persistEvidence(evidence);
    throw error;
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(
    "CONTROL_CENTER_ACCESSIBILITY_FAILED",
    error instanceof Error ? error.name : "UnknownError",
  );
  process.exit(1);
});
