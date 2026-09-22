import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.WAVE_G_PLAYWRIGHT_PATH ?? "/tmp/pw/node_modules/playwright",
);

const baseUrl = process.env.WAVE_G_BASE_URL ?? "http://127.0.0.1:4173/";
const evidenceDir =
  process.env.WAVE_G_EVIDENCE_DIR ?? "/tmp/wave-g-visual-regression";

const matrix = [
  { label: "w320", width: 320, height: 568 },
  { label: "w360", width: 360, height: 800 },
  { label: "w375", width: 375, height: 812 },
  { label: "w390", width: 390, height: 844 },
  { label: "w393", width: 393, height: 852 },
  { label: "w412", width: 412, height: 915 },
  { label: "w430", width: 430, height: 932 },
  { label: "w768", width: 768, height: 1024 },
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

await mkdir(evidenceDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const report = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  matrix: [],
  keyboard: null,
  rtl: null,
};

try {
  for (const viewport of matrix) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      reducedMotion: "reduce",
      locale: "pt-BR",
    });
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(String(error)));

    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForTimeout(1_500);

    const result = await page.evaluate(() => {
      const visible = (element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          rect.width > 0 &&
          rect.height > 0
        );
      };

      const accessibleName = (element) =>
        (
          element.getAttribute("aria-label") ||
          element.getAttribute("title") ||
          element.textContent ||
          ""
        ).trim();

      const scopedControls = [
        ...document.querySelectorAll(
          [
            "#home-bottom-navigation button",
            "#assistant-input-area button",
            ".map-control-button",
            ".control-button",
            ".mapboxgl-ctrl button",
          ].join(","),
        ),
      ].filter(visible);

      const targetFailures = scopedControls
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            tag: element.tagName,
            id: element.id,
            className: element.className,
            width: rect.width,
            height: rect.height,
          };
        })
        .filter((item) => item.width < 43.5 || item.height < 43.5);

      const nameFailures = scopedControls
        .filter((element) => !accessibleName(element))
        .map((element) => ({
          tag: element.tagName,
          id: element.id,
          className: element.className,
        }));

      const bottomNav = document.querySelector("#home-bottom-navigation");
      const activeNav = bottomNav?.querySelector(
        '.md-home-nav-item.is-active, [aria-current="page"]',
      );
      const bottomRect =
        bottomNav && visible(bottomNav)
          ? bottomNav.getBoundingClientRect()
          : null;
      const activeRect =
        activeNav && visible(activeNav)
          ? activeNav.getBoundingClientRect()
          : null;

      const inputSizes = [
        ...document.querySelectorAll("input, textarea, select"),
      ]
        .filter(visible)
        .map((element) => Number.parseFloat(getComputedStyle(element).fontSize));

      const shell = document.querySelector(".app-shell");
      const shellRect = shell?.getBoundingClientRect() ?? null;

      return {
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
        overflow:
          document.documentElement.scrollWidth > window.innerWidth + 1,
        bodyFont: getComputedStyle(document.body).fontFamily,
        targetFailures,
        nameFailures,
        bottomNav: bottomRect
          ? { width: bottomRect.width, height: bottomRect.height }
          : null,
        activeNav: activeRect
          ? { width: activeRect.width, height: activeRect.height }
          : null,
        inputSizes,
        shell: shellRect
          ? { width: shellRect.width, height: shellRect.height }
          : null,
      };
    });

    assert(
      !result.overflow,
      `${viewport.label}: horizontal overflow ${result.scrollWidth} > ${result.innerWidth}`,
    );
    assert(
      result.targetFailures.length === 0,
      `${viewport.label}: sub-44px targets: ${JSON.stringify(result.targetFailures)}`,
    );
    assert(
      result.nameFailures.length === 0,
      `${viewport.label}: unnamed controls: ${JSON.stringify(result.nameFailures)}`,
    );
    assert(
      result.bodyFont.toLowerCase().includes("poppins"),
      `${viewport.label}: canonical font missing: ${result.bodyFont}`,
    );
    assert(
      result.inputSizes.every((size) => size >= 15.9),
      `${viewport.label}: mobile input font below 16px: ${JSON.stringify(result.inputSizes)}`,
    );
    if (result.bottomNav) {
      assert(
        result.bottomNav.height >= 67,
        `${viewport.label}: bottom nav below shared minimum: ${result.bottomNav.height}`,
      );
    }
    if (result.activeNav) {
      assert(
        result.activeNav.height >= 47,
        `${viewport.label}: active nav target below 48px: ${result.activeNav.height}`,
      );
    }
    if (result.shell) {
      assert(
        result.shell.width <= result.innerWidth + 1,
        `${viewport.label}: shell wider than viewport`,
      );
    }
    assert(
      pageErrors.length === 0,
      `${viewport.label}: page errors: ${JSON.stringify(pageErrors)}`,
    );

    await page.screenshot({
      path: `${evidenceDir}/${viewport.label}.png`,
      fullPage: false,
    });

    report.matrix.push({ viewport, ...result, pageErrors });
    await context.close();
  }

  {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      locale: "pt-BR",
    });
    const page = await context.newPage();
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForTimeout(1_000);
    const selector =
      "#assistant-input-area textarea, #assistant-input-area input, textarea, input:not([type='hidden'])";
    const input = page.locator(selector).first();
    if ((await input.count()) > 0 && (await input.isVisible())) {
      await input.focus();
      await page.setViewportSize({ width: 390, height: 600 });
      await page.waitForTimeout(250);
      const keyboard = await input.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return {
          top: rect.top,
          bottom: rect.bottom,
          viewportHeight: window.innerHeight,
          visible: rect.top >= 0 && rect.bottom <= window.innerHeight,
        };
      });
      assert(
        keyboard.visible,
        `keyboard resize covers focused input: ${JSON.stringify(keyboard)}`,
      );
      report.keyboard = keyboard;
      await page.screenshot({
        path: `${evidenceDir}/keyboard-390x600.png`,
        fullPage: false,
      });
    } else {
      report.keyboard = { skipped: true, reason: "no visible text input" };
    }
    await context.close();
  }

  {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      locale: "ar",
    });
    const page = await context.newPage();
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.evaluate(() => {
      document.documentElement.dir = "rtl";
    });
    await page.waitForTimeout(250);
    const rtl = await page.evaluate(() => ({
      overflow:
        document.documentElement.scrollWidth > window.innerWidth + 1,
      direction: getComputedStyle(document.documentElement).direction,
    }));
    assert(!rtl.overflow, "RTL produces horizontal overflow");
    assert(rtl.direction === "rtl", "RTL direction was not applied");
    report.rtl = rtl;
    await page.screenshot({
      path: `${evidenceDir}/rtl-390.png`,
      fullPage: false,
    });
    await context.close();
  }

  await writeFile(
    `${evidenceDir}/evidence.json`,
    JSON.stringify(report, null, 2),
    "utf8",
  );
  process.stdout.write("WAVE_G_RESPONSIVE_A11Y = PASS\n");
} finally {
  await browser.close();
}
