import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { webkit } = require(
  process.env.WAVE_G_PLAYWRIGHT_PATH ?? "/tmp/pw/node_modules/playwright",
);

const baseUrl = process.env.WAVE_G_BASE_URL ?? "http://127.0.0.1:4173/";
const evidenceDir =
  process.env.WAVE_G_EVIDENCE_DIR ?? "/tmp/wave-g-visual-regression";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

await mkdir(evidenceDir, { recursive: true });
const browser = await webkit.launch({ headless: true });
const report = { engine: "webkit", cases: [] };

async function inspect(page, label) {
  const state = await page.evaluate(() => {
    const dock = document.getElementById("unified-assistant-dock");
    const rail = document.querySelector(
      "#assistant-category-rail .md-assistant-category-scroll",
    );
    const input = document.getElementById("assistantInput");
    const dockRect = dock?.getBoundingClientRect();
    const inputRect = input?.getBoundingClientRect();
    const chips = Array.from(
      document.querySelectorAll("#assistant-category-rail [data-assistant-category]"),
    );
    return {
      width: window.innerWidth,
      height: window.innerHeight,
      overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      dock:
        dockRect && dockRect.width > 0
          ? {
              left: dockRect.left,
              top: dockRect.top,
              right: dockRect.right,
              bottom: dockRect.bottom,
            }
          : null,
      input:
        inputRect && inputRect.width > 0
          ? { top: inputRect.top, bottom: inputRect.bottom }
          : null,
      rail:
        rail instanceof HTMLElement
          ? {
              overflowX: getComputedStyle(rail).overflowX,
              scrollWidth: rail.scrollWidth,
              clientWidth: rail.clientWidth,
              snap: getComputedStyle(rail).scrollSnapType,
            }
          : null,
      chipTargets: chips.map((chip) => {
        const rect = chip.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      }),
    };
  });

  assert(!state.overflow, `${label}: horizontal page overflow`);
  assert(
    state.dock &&
      state.dock.left >= -1 &&
      state.dock.right <= state.width + 1 &&
      state.dock.bottom <= state.height + 1,
    `${label}: unified dock escaped WebKit viewport: ${JSON.stringify(state.dock)}`,
  );
  assert(
    state.rail &&
      ["auto", "scroll"].includes(state.rail.overflowX) &&
      state.rail.scrollWidth > state.rail.clientWidth &&
      state.rail.snap !== "none",
    `${label}: category rail WebKit contract failed: ${JSON.stringify(state.rail)}`,
  );
  assert(
    state.chipTargets.length === 10 &&
      state.chipTargets.every((target) => target.width >= 44 && target.height >= 44),
    `${label}: category target below 44px in WebKit`,
  );
  assert(
    state.input && state.input.top >= 0 && state.input.bottom <= state.height + 1,
    `${label}: composer input not visible in WebKit`,
  );
  return state;
}

try {
  for (const viewport of [
    { label: "webkit-portrait-390x844", width: 390, height: 844 },
    { label: "webkit-landscape-844x390", width: 844, height: 390 },
  ]) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      locale: "pt-BR",
      isMobile: true,
      hasTouch: true,
    });
    await context.addInitScript(() => {
      localStorage.setItem("morro-digital-onboarded", "1");
      localStorage.setItem("voice-enabled", "false");
    });
    const page = await context.newPage();
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page
      .locator("#unified-assistant-dock")
      .waitFor({ state: "visible", timeout: 15_000 });
    const state = await inspect(page, viewport.label);
    await page.screenshot({
      path: `${evidenceDir}/${viewport.label}.png`,
      fullPage: false,
    });
    report.cases.push({ viewport, ...state });
    await context.close();
  }

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "pt-BR",
    isMobile: true,
    hasTouch: true,
  });
  await context.addInitScript(() => {
    localStorage.setItem("morro-digital-onboarded", "1");
    localStorage.setItem("voice-enabled", "false");
  });
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
  const input = page.locator("#assistantInput");
  await input.waitFor({ state: "visible", timeout: 15_000 });
  await input.focus();
  await page.setViewportSize({ width: 390, height: 600 });
  await page.waitForTimeout(200);
  const keyboardState = await inspect(page, "webkit-keyboard-390x600");
  report.cases.push({ viewport: { label: "webkit-keyboard-390x600" }, ...keyboardState });
  await page.screenshot({
    path: `${evidenceDir}/webkit-keyboard-390x600.png`,
    fullPage: false,
  });
  await context.close();

  await writeFile(
    `${evidenceDir}/webkit-safari-evidence.json`,
    JSON.stringify(report, null, 2),
    "utf8",
  );
  process.stdout.write("WAVE_G_WEBKIT_SAFARI_SMOKE = PASS\n");
} finally {
  await browser.close();
}
