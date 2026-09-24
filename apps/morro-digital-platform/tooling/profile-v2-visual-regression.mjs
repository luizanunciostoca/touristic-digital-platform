import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.PROFILE_V2_PLAYWRIGHT_PATH ?? "/tmp/pw/node_modules/playwright",
);

const baseUrl = process.env.PROFILE_V2_BASE_URL ?? "http://127.0.0.1:4173/";
const evidenceDir =
  process.env.PROFILE_V2_EVIDENCE_DIR ?? "/tmp/profile-v2-visual-regression";

const matrix = [
  { label: "w320", width: 320, height: 568 },
  { label: "w390", width: 390, height: 844 },
  { label: "w430", width: 430, height: 932 },
  { label: "w768", width: 768, height: 1024 },
  { label: "landscape", width: 844, height: 390 },
];

function assert(condition, message, detail) {
  if (!condition) {
    throw new Error(
      detail === undefined ? message : `${message}: ${JSON.stringify(detail)}`,
    );
  }
}

await mkdir(evidenceDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const report = { generatedAt: new Date().toISOString(), baseUrl, matrix: [] };

try {
  for (const viewport of matrix) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      locale: "pt-BR",
      reducedMotion: "reduce",
    });
    await context.addInitScript(() => {
      localStorage.setItem("morro-digital-onboarded", "1");
      localStorage.setItem("voice-enabled", "false");
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));

    await page.goto(baseUrl, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await page
      .locator('body[data-public-onboarding-settled="true"]')
      .waitFor({ state: "attached", timeout: 20_000 });
    await page
      .locator('#map[data-map-state="ready"]')
      .waitFor({ state: "attached", timeout: 30_000 });

    await page.locator("#home-profile-button").click();
    await page
      .locator("#home-profile-panel:not(.hidden)")
      .waitFor({ state: "visible", timeout: 5_000 });

    const state = await page.evaluate(() => {
      const visible = (element) => {
        if (!(element instanceof HTMLElement)) return false;
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          rect.width > 0 &&
          rect.height > 0
        );
      };
      const rect = (selector) => {
        const element = document.querySelector(selector);
        if (!(element instanceof HTMLElement) || !visible(element)) return null;
        const value = element.getBoundingClientRect();
        return {
          left: value.left,
          top: value.top,
          right: value.right,
          bottom: value.bottom,
          width: value.width,
          height: value.height,
        };
      };

      const panel = document.getElementById("home-profile-panel");
      const button = document.getElementById("home-profile-button");
      const nav = document.getElementById("home-bottom-navigation");
      const map = document.getElementById("map");
      const controls = panel
        ? Array.from(panel.querySelectorAll("button")).map((control) => {
            const r = control.getBoundingClientRect();
            return {
              id: control.id,
              width: r.width,
              height: r.height,
              visible: visible(control),
              name:
                control.getAttribute("aria-label") ||
                control.textContent?.trim() ||
                "",
            };
          })
        : [];

      return {
        viewport: { width: innerWidth, height: innerHeight },
        scrollWidth: document.documentElement.scrollWidth,
        panel: rect("#home-profile-panel"),
        nav: rect("#home-bottom-navigation"),
        map: rect("#map"),
        profileButton: rect("#home-profile-button"),
        active:
          button?.classList.contains("is-active") === true &&
          button?.getAttribute("aria-current") === "page" &&
          button?.getAttribute("aria-expanded") === "true",
        panelAriaHidden: panel?.getAttribute("aria-hidden"),
        profileExpanded: panel?.dataset.profileExpanded,
        expandAria:
          document.getElementById("home-profile-expand")?.getAttribute(
            "aria-expanded",
          ),
        quickActions:
          panel?.querySelectorAll(".md-home-profile-shortcut").length ?? 0,
        focusedClose: document.activeElement?.id === "home-profile-close",
        controls,
        mapVisible: visible(map),
        navVisible: visible(nav),
        profileTitle:
          document.getElementById("home-profile-title")?.textContent?.trim() ??
          "",
        composer: (() => {
          const element = document.getElementById("assistant-input-area");
          if (!(element instanceof HTMLElement) || !visible(element)) {
            return null;
          }
          const r = element.getBoundingClientRect();
          return {
            left: r.left,
            top: r.top,
            right: r.right,
            bottom: r.bottom,
            width: r.width,
            height: r.height,
            zIndex:
              Number.parseInt(getComputedStyle(element).zIndex || "0", 10) || 0,
          };
        })(),
        panelZIndex:
          panel instanceof HTMLElement
            ? Number.parseInt(getComputedStyle(panel).zIndex || "0", 10) || 0
            : 0,
      };
    });

    assert(state.panel, `${viewport.label}: Profile panel missing`);
    assert(
      state.scrollWidth <= state.viewport.width + 1,
      `${viewport.label}: horizontal overflow`,
      state,
    );
    assert(
      state.panel.left >= -1 &&
        state.panel.right <= state.viewport.width + 1 &&
        state.panel.top >= -1 &&
        state.panel.bottom <= state.viewport.height + 1,
      `${viewport.label}: Profile panel outside viewport`,
      state.panel,
    );
    assert(
      state.panel.height <= state.viewport.height * 0.56 + 1,
      `${viewport.label}: Compact Profile panel obscures too much map context`,
      state.panel,
    );
    assert(
      state.profileExpanded === "false" && state.expandAria === "false",
      `${viewport.label}: Profile must open compact`,
      { profileExpanded: state.profileExpanded, expandAria: state.expandAria },
    );
    assert(
      state.quickActions === 3,
      `${viewport.label}: Profile quick actions drift`,
      state.quickActions,
    );
    assert(
      state.mapVisible && state.map,
      `${viewport.label}: map context lost`,
    );
    assert(state.navVisible && state.nav, `${viewport.label}: bottom nav lost`);
    assert(state.active, `${viewport.label}: Profile nav active state drift`);
    assert(
      state.panelAriaHidden === "false",
      `${viewport.label}: Profile aria-hidden drift`,
      state.panelAriaHidden,
    );
    assert(
      state.focusedClose,
      `${viewport.label}: Profile open does not move focus to close control`,
    );
    assert(
      state.controls
        .filter((control) => control.visible)
        .every(
          (control) =>
            control.width >= 43.5 &&
            control.height >= 43.5 &&
            control.name.length > 0,
        ),
      `${viewport.label}: Profile target/name regression`,
      state.controls,
    );
    if (state.composer) {
      const overlapsHorizontally =
        state.panel.left < state.composer.right &&
        state.panel.right > state.composer.left;
      const overlapsVertically =
        state.panel.top < state.composer.bottom &&
        state.panel.bottom > state.composer.top;
      const visualCompetition =
        overlapsHorizontally &&
        overlapsVertically &&
        state.panelZIndex <= state.composer.zIndex;
      assert(
        !visualCompetition,
        `${viewport.label}: composer competes visually with open Profile panel`,
        {
          panel: state.panel,
          panelZIndex: state.panelZIndex,
          composer: state.composer,
        },
      );
    }
    assert(
      state.profileTitle === "Perfil e preferências",
      `${viewport.label}: PT-BR Profile title drift`,
      state.profileTitle,
    );
    assert(errors.length === 0, `${viewport.label}: page errors`, errors);

    await page.screenshot({
      path: `${evidenceDir}/profile-${viewport.label}.png`,
      fullPage: false,
      animations: "disabled",
    });

    await page.locator("#home-profile-expand").click();
    await page
      .locator('#home-profile-panel[data-profile-expanded="true"]')
      .waitFor({ state: "visible", timeout: 5_000 });
    await page
      .locator(".md-home-profile-expanded-content")
      .waitFor({ state: "visible", timeout: 5_000 });
    const expanded = await page.evaluate(() => {
      const panel = document.getElementById("home-profile-panel");
      const handle = document.getElementById("home-profile-expand");
      const r =
        panel instanceof HTMLElement ? panel.getBoundingClientRect() : null;
      return {
        expanded: panel?.dataset.profileExpanded,
        ariaExpanded: handle?.getAttribute("aria-expanded"),
        height: r?.height ?? 0,
        viewportHeight: innerHeight,
      };
    });
    assert(
      expanded.expanded === "true" && expanded.ariaExpanded === "true",
      `${viewport.label}: Profile expansion state drift`,
      expanded,
    );
    assert(
      expanded.height <= expanded.viewportHeight * 0.72 + 1,
      `${viewport.label}: Expanded Profile obscures too much map context`,
      expanded,
    );
    await page.screenshot({
      path: `${evidenceDir}/profile-expanded-${viewport.label}.png`,
      fullPage: false,
      animations: "disabled",
    });

    await page.locator("#home-privacy-button").click();
    await page
      .locator(".analytics-consent-preferences:not(.is-collapsed)")
      .waitFor({ state: "visible", timeout: 5_000 });
    const privacy = await page.evaluate(() => {
      const dialog = document.querySelector(".analytics-consent-preferences");
      const r =
        dialog instanceof HTMLElement ? dialog.getBoundingClientRect() : null;
      return {
        role: dialog?.getAttribute("role"),
        rect: r
          ? {
              left: r.left,
              top: r.top,
              right: r.right,
              bottom: r.bottom,
              width: r.width,
              height: r.height,
            }
          : null,
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
      };
    });
    assert(
      privacy.role === "dialog",
      `${viewport.label}: privacy semantics drift`,
    );
    assert(!privacy.overflow, `${viewport.label}: privacy creates overflow`);
    assert(
      privacy.rect &&
        privacy.rect.left >= -1 &&
        privacy.rect.right <= viewport.width + 1 &&
        privacy.rect.top >= -1 &&
        privacy.rect.bottom <= viewport.height + 1,
      `${viewport.label}: privacy dialog outside viewport`,
      privacy.rect,
    );
    await page.screenshot({
      path: `${evidenceDir}/profile-privacy-${viewport.label}.png`,
      fullPage: false,
      animations: "disabled",
    });

    report.matrix.push({ viewport, state, privacy, errors });
    await context.close();
  }

  await writeFile(
    `${evidenceDir}/evidence.json`,
    JSON.stringify(report, null, 2),
    "utf8",
  );
  process.stdout.write("PROFILE_V2_VISUAL_REGRESSION = PASS\n");
} finally {
  await browser.close();
}
