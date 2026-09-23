import { mkdirSync, writeFileSync } from "node:fs";
import playwright from "/tmp/pw/node_modules/playwright/index.js";

const { chromium } = playwright;
const BASE_URL = process.env.MORRO_BROWSER_URL || "http://127.0.0.1:4173/";
const OUTPUT_DIR =
  process.env.HOME_MANUAL_EVIDENCE_DIR || "/tmp/home-discover-manual";

mkdirSync(OUTPUT_DIR, { recursive: true });

const viewports = [
  { name: "320x568", width: 320, height: 568 },
  { name: "360x800", width: 360, height: 800 },
  { name: "375x812", width: 375, height: 812 },
  { name: "390x844", width: 390, height: 844 },
  { name: "393x852", width: 393, height: 852 },
  { name: "412x915", width: 412, height: 915 },
  { name: "430x932", width: 430, height: 932 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "1440x900", width: 1440, height: 900 },
  { name: "landscape-844x390", width: 844, height: 390 },
];

const weather = {
  temperatureCelsius: 28,
  temperatureMaxCelsius: 31,
  temperatureMinCelsius: 24,
  humidityPercent: 78,
  windSpeedKph: 18,
  rainChancePercent: 42,
  weatherCode: 1,
  isDay: true,
  forecast: [],
};

function assert(condition, message, details) {
  if (condition) return;
  const suffix = details === undefined ? "" : `: ${JSON.stringify(details)}`;
  throw new Error(`${message}${suffix}`);
}

function overlaps(a, b) {
  return Boolean(
    a &&
    b &&
    a.left < b.right &&
    a.right > b.left &&
    a.top < b.bottom &&
    a.bottom > b.top,
  );
}

function inside(rect, viewport, tolerance = 1) {
  return Boolean(
    rect &&
    rect.left >= -tolerance &&
    rect.top >= -tolerance &&
    rect.right <= viewport.width + tolerance &&
    rect.bottom <= viewport.height + tolerance,
  );
}

async function waitForReady(page) {
  await page
    .locator(
      '#map[data-map-state="ready"][data-home-state="ready"][data-map-mode="real"]',
    )
    .waitFor({ state: "attached", timeout: 30000 });
  await page
    .locator('#weather-widget[data-weather-state="ready"]')
    .waitFor({ state: "visible", timeout: 10000 });
  await page
    .locator("#unified-assistant-dock")
    .waitFor({ state: "visible", timeout: 10000 });
  await page
    .locator("#home-bottom-navigation")
    .waitFor({ state: "visible", timeout: 10000 });
  await page
    .locator("#toggle-globe-view")
    .waitFor({ state: "visible", timeout: 10000 });
  await page
    .locator("#toggle-3d-mode")
    .waitFor({ state: "visible", timeout: 10000 });
  await page
    .locator("#loading-overlay.fade-out")
    .waitFor({ state: "attached", timeout: 5000 });
  await page
    .locator(".md-current-location-marker")
    .waitFor({ state: "visible", timeout: 5000 });
}

async function inspectDiscover(page) {
  return page.evaluate(() => {
    const rect = (selector) => {
      const node = document.querySelector(selector);
      if (!(node instanceof HTMLElement)) return null;
      const style = getComputedStyle(node);
      const box = node.getBoundingClientRect();
      return {
        left: box.left,
        top: box.top,
        right: box.right,
        bottom: box.bottom,
        width: box.width,
        height: box.height,
        display: style.display,
        visibility: style.visibility,
      };
    };
    const navTargets = Array.from(
      document.querySelectorAll(
        "#home-bottom-navigation [data-home-nav-action]",
      ),
    ).map((node) => {
      const box = node.getBoundingClientRect();
      return {
        action: node.getAttribute("data-home-nav-action"),
        width: box.width,
        height: box.height,
        text: node.textContent?.trim() ?? "",
      };
    });
    return {
      mode: document.body.dataset.mdMode ?? null,
      identity: document
        .querySelector(".md-home-header h1")
        ?.textContent?.trim(),
      eyebrow: document.querySelector(".md-home-eyebrow")?.textContent?.trim(),
      headerUsesAssistantWelcome:
        document.querySelector(
          ".md-home-header [data-i18n='welcome_message']",
        ) !== null,
      header: rect(".md-home-header-inner"),
      weather: rect("#weather-widget"),
      map: rect("#map"),
      dock: rect("#unified-assistant-dock"),
      messageRegion: rect("#assistant-messages:not(.hidden)"),
      legacyCategoryMenuVisible: (() => {
        const node = document.querySelector(
          '#assistant-messages .assistant-options[data-assistant-command-source="legacy-category-routing"]',
        );
        if (!(node instanceof HTMLElement)) return false;
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          rect.width > 0 &&
          rect.height > 0
        );
      })(),
      categoryRail: rect("#assistant-category-rail"),
      nav: rect("#home-bottom-navigation"),
      composer: rect("#assistant-input-area"),
      globe: rect("#toggle-globe-view"),
      threeD: rect("#toggle-3d-mode"),
      profilePanel: rect("#home-profile-panel"),
      privacyCollapsed: rect(".analytics-consent-preferences.is-collapsed"),
      navTargets,
      navCount: navTargets.length,
      ticketsHref:
        document
          .querySelector('[data-home-nav-action="tickets"]')
          ?.getAttribute("href") ?? null,
      composerState:
        document
          .getElementById("assistant-input-area")
          ?.getAttribute("data-home-assistant-entry") ?? null,
      sendVisible: (() => {
        const node = document.getElementById("sendButton");
        if (!(node instanceof HTMLElement)) return false;
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return (
          rect.width >= 44 &&
          rect.height >= 44 &&
          style.opacity !== "0" &&
          style.visibility !== "hidden"
        );
      })(),
      voiceVisible:
        document.getElementById("voiceButton")?.getBoundingClientRect()
          .width !== 0,
      voiceLabel:
        document.getElementById("voiceButton")?.textContent?.trim() ?? null,
      voiceRect: rect("#voiceButton"),
      configInsideComposer: Boolean(
        document
          .getElementById("assistant-input-area")
          ?.querySelector("#configButton"),
      ),
      unifiedComposition:
        document.getElementById("assistant-input-area")?.parentElement?.id ===
          "unified-assistant-dock" &&
        document.getElementById("assistant-category-rail")?.parentElement
          ?.id === "unified-assistant-dock" &&
        document.getElementById("home-bottom-navigation")?.parentElement?.id ===
          "unified-assistant-dock" &&
        document.getElementById("assistant-messages")?.parentElement?.id ===
          "unified-assistant-dock",
      categoryRailContract: (() => {
        const rail = document.querySelector(
          "#assistant-category-rail .md-assistant-category-scroll",
        );
        const chips = Array.from(
          document.querySelectorAll(
            "#assistant-category-rail [data-assistant-category]",
          ),
        );
        if (!(rail instanceof HTMLElement)) return null;
        const style = getComputedStyle(rail);
        return {
          count: chips.length,
          overflowX: style.overflowX,
          scrollSnapType: style.scrollSnapType,
          scrollWidth: rail.scrollWidth,
          clientWidth: rail.clientWidth,
          targets: chips.map((chip) => {
            const box = chip.getBoundingClientRect();
            return {
              value: chip.getAttribute("data-assistant-category"),
              width: box.width,
              height: box.height,
            };
          }),
        };
      })(),
      messageMaxHeight: (() => {
        const node = document.getElementById("assistant-messages");
        if (!(node instanceof HTMLElement)) return null;
        return Number.parseFloat(getComputedStyle(node).maxHeight);
      })(),
      unifiedDockVariables: (() => {
        const style = getComputedStyle(document.documentElement);
        return {
          height: Number.parseFloat(
            style.getPropertyValue("--md-unified-dock-height"),
          ),
          mapInset: Number.parseFloat(
            style.getPropertyValue("--md-unified-dock-map-inset"),
          ),
        };
      })(),
      currentLocationMarker: rect(".md-current-location-marker"),
      currentLocationState:
        document.getElementById("map")?.getAttribute("data-current-location") ??
        null,
      retiredLauncherCount: document.querySelectorAll(
        ".quick-actions, .mood-button, [data-assistant-floating-trigger]",
      ).length,
      rootWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
    };
  });
}

async function assertPureDiscover(page, viewport) {
  const state = await inspectDiscover(page);
  assert(state.mode === "discover", "Home mode is not Discover", state);
  assert(
    state.identity === "Morro de São Paulo" &&
      state.eyebrow === "Morro Digital" &&
      !state.headerUsesAssistantWelcome,
    "Destination identity still reuses Assistant welcome copy",
    state,
  );
  assert(
    state.navCount === 5 && state.ticketsHref === "/tickets.html",
    "Bottom navigation is not the canonical five-action composition",
    state,
  );
  assert(
    state.composerState === "persistent" &&
      !state.sendVisible &&
      state.voiceVisible &&
      state.voiceLabel === "Fale comigo" &&
      state.voiceRect &&
      state.voiceRect.width >= 180 &&
      state.voiceRect.height >= 44 &&
      !state.configInsideComposer &&
      state.unifiedComposition,
    "Assistant composer/navigation are not unified and persistently actionable",
    state,
  );
  assert(
    state.messageRegion &&
      state.messageRegion.height > 0 &&
      !state.legacyCategoryMenuVisible,
    "Unified dock welcome message is not visible or legacy category grid leaked",
    {
      messageRegion: state.messageRegion,
      legacyCategoryMenuVisible: state.legacyCategoryMenuVisible,
    },
  );

  assert(
    state.categoryRailContract &&
      state.categoryRailContract.count === 10 &&
      ["auto", "scroll"].includes(state.categoryRailContract.overflowX) &&
      state.categoryRailContract.scrollSnapType !== "none" &&
      state.categoryRailContract.scrollWidth >
        state.categoryRailContract.clientWidth &&
      state.categoryRailContract.targets.every(
        (target) => target.width >= 44 && target.height >= 44,
      ),
    "Unified Assistant category rail lost horizontal-scroll/touch-target contract",
    state.categoryRailContract,
  );

  assert(
    state.dock &&
      Number.isFinite(state.unifiedDockVariables?.height) &&
      Number.isFinite(state.unifiedDockVariables?.mapInset) &&
      Math.abs(state.unifiedDockVariables.height - state.dock.height) <= 2 &&
      state.unifiedDockVariables.mapInset >= state.dock.height,
    "Unified dock ResizeObserver variables are not synchronized",
    {
      dock: state.dock,
      variables: state.unifiedDockVariables,
    },
  );

  assert(
    state.currentLocationState === "visible" &&
      state.currentLocationMarker &&
      (viewport.width > viewport.height ||
        inside(state.currentLocationMarker, viewport, 2)),
    "Granted current-location marker is missing",
    state,
  );
  assert(
    state.retiredLauncherCount === 0,
    "Retired Quick Actions/floating Assistant launcher returned",
    state,
  );
  for (const [label, rect] of Object.entries({
    header: state.header,
    weather: state.weather,
    map: state.map,
    dock: state.dock,
    categoryRail: state.categoryRail,
    nav: state.nav,
    composer: state.composer,
    globe: state.globe,
    threeD: state.threeD,
  })) {
    assert(inside(rect, viewport, 2), `${label} escaped viewport`, {
      viewport,
      rect,
    });
  }
  assert(
    state.map &&
      Math.abs(state.map.left) <= 2 &&
      Math.abs(state.map.top) <= 2 &&
      Math.abs(state.map.right - viewport.width) <= 2 &&
      Math.abs(state.map.bottom - viewport.height) <= 2,
    "Map is not the dominant full-viewport canvas",
    state.map,
  );
  assert(
    !overlaps(state.header, state.weather) &&
      !overlaps(state.dock, state.globe) &&
      !overlaps(state.dock, state.threeD),
    "Discover chrome collision detected",
    state,
  );
  for (const target of state.navTargets) {
    assert(
      target.width >= 44 && target.height >= 44,
      "Bottom navigation target below 44px",
      target,
    );
  }
  assert(
    !state.privacyCollapsed ||
      state.privacyCollapsed.display === "none" ||
      state.privacyCollapsed.visibility === "hidden" ||
      state.privacyCollapsed.width === 0,
    "Privacy competes with the map as a floating CTA",
    state.privacyCollapsed,
  );
  assert(
    state.rootWidth <= viewport.width + 1 &&
      state.bodyWidth <= viewport.width + 1,
    "Horizontal overflow detected",
    state,
  );
  return state;
}

async function verifyAssistantEntry(page) {
  const voice = page.locator("#voiceButton");
  await voice.waitFor({ state: "visible", timeout: 3000 });
  const target = await voice.boundingBox();
  assert(
    target && target.width >= 180 && target.height >= 44,
    "Voice-first Assistant CTA is below the approved target size",
    { target },
  );
  assert(
    (await voice.textContent())?.trim() === "Fale comigo",
    "Voice-first Assistant CTA copy drifted",
  );

  const compatibility = await page.evaluate(() => {
    const input = document.getElementById("assistantInput");
    const send = document.getElementById("sendButton");
    return {
      inputOpacity:
        input instanceof HTMLElement ? getComputedStyle(input).opacity : null,
      sendOpacity:
        send instanceof HTMLElement ? getComputedStyle(send).opacity : null,
    };
  });
  assert(
    compatibility.inputOpacity === "0" && compatibility.sendOpacity === "0",
    "Text composer leaked into the visible voice-first UI",
    compatibility,
  );

  await voice.focus();
  await page
    .locator("#assistant-input-area.is-focused")
    .waitFor({ state: "visible", timeout: 3000 });

  const configInComposer = await page
    .locator("#assistant-input-area #configButton")
    .count();
  assert(configInComposer === 0, "Settings returned to primary composer");
  await page.keyboard.press("Escape");
  await page.locator('[data-home-nav-action="explore"]').click();
  await page.waitForFunction(
    () =>
      document
        .getElementById("assistant-input-area")
        ?.getAttribute("data-home-assistant-entry") === "persistent",
  );
}

async function verifyBoundedAssistantMessage(page) {
  await page.evaluate(() => {
    const dialog = document.getElementById("assistant-messages");
    const area = dialog?.querySelector(".messages-area");
    if (!(dialog instanceof HTMLElement) || !(area instanceof HTMLElement)) {
      throw new Error("Assistant message region missing");
    }
    dialog.classList.remove("hidden", "has-rich-content");
    dialog.setAttribute("aria-hidden", "false");
    const probe = document.createElement("div");
    probe.className = "message assistant";
    probe.dataset.messageType = "bounded-regression-probe";
    probe.textContent = "Mensagem longa de validação. ".repeat(180);
    area.appendChild(probe);
  });
  await page.waitForTimeout(80);

  const result = await page.evaluate(() => {
    const dialog = document.getElementById("assistant-messages");
    const area = dialog?.querySelector(".messages-area");
    const categories = document.getElementById("assistant-category-rail");
    const composer = document.getElementById("assistant-input-area");
    const nav = document.getElementById("home-bottom-navigation");
    if (
      !(dialog instanceof HTMLElement) ||
      !(area instanceof HTMLElement) ||
      !(categories instanceof HTMLElement) ||
      !(composer instanceof HTMLElement) ||
      !(nav instanceof HTMLElement)
    ) {
      return null;
    }
    const messageRect = dialog.getBoundingClientRect();
    const dock = document.getElementById("unified-assistant-dock");
    const rootStyle = getComputedStyle(document.documentElement);
    const dockRect =
      dock instanceof HTMLElement ? dock.getBoundingClientRect() : null;
    return {
      messageHeight: messageRect.height,
      messageScrolls: area.scrollHeight > area.clientHeight,
      categoriesVisible: categories.getBoundingClientRect().height > 0,
      composerVisible: composer.getBoundingClientRect().height > 0,
      navVisible: nav.getBoundingClientRect().height > 0,
      dockHeight: dockRect?.height ?? 0,
      cssDockHeight: Number.parseFloat(
        rootStyle.getPropertyValue("--md-unified-dock-height"),
      ),
      mapInset: Number.parseFloat(
        rootStyle.getPropertyValue("--md-unified-dock-map-inset"),
      ),
    };
  });
  assert(result, "Bounded Assistant probe could not inspect layout");
  assert(
    result.messageHeight <= 114 &&
      result.messageScrolls &&
      result.categoriesVisible &&
      result.composerVisible &&
      result.navVisible &&
      Math.abs(result.cssDockHeight - result.dockHeight) <= 2 &&
      result.mapInset >= result.dockHeight,
    "Long Assistant response escaped bounded message region",
    result,
  );

  await page.evaluate(() => {
    document
      .querySelector('[data-message-type="bounded-regression-probe"]')
      ?.remove();
  });
}

async function verifyProfileAndPrivacy(page) {
  await page.locator("#home-profile-button").click();
  await page
    .locator("#home-profile-panel:not(.hidden)")
    .waitFor({ state: "visible", timeout: 3000 });
  await page
    .locator("#configButton")
    .waitFor({ state: "visible", timeout: 3000 });
  await page
    .locator("#home-privacy-button")
    .waitFor({ state: "visible", timeout: 3000 });
  await page.locator("#home-privacy-button").click();
  await page
    .locator(".analytics-consent-preferences:not(.is-collapsed)")
    .waitFor({ state: "visible", timeout: 3000 });
  const role = await page
    .locator(".analytics-consent-preferences")
    .getAttribute("role");
  assert(role === "dialog", "Privacy surface lost dialog semantics", role);
  await page.locator(".analytics-consent-later").click();
}

async function verifyLocales(page) {
  const expected = {
    "pt-BR": ["Explorar", "Tours", "Salvos", "Ingressos", "Perfil"],
    "en-US": ["Explore", "Tours", "Saved", "Tickets", "Profile"],
    "es-ES": ["Explorar", "Tours", "Guardados", "Entradas", "Perfil"],
    "he-IL": ["לגלות", "סיורים", "שמורים", "כרטיסים", "פרופיל"],
  };
  for (const [locale, labels] of Object.entries(expected)) {
    await page.evaluate((value) => {
      document.documentElement.lang = value;
    }, locale);
    await page.waitForTimeout(40);
    const actual = await page
      .locator("#home-bottom-navigation [data-home-nav-action] span")
      .allTextContents();
    assert(
      JSON.stringify(actual.map((value) => value.trim())) ===
        JSON.stringify(labels),
      `Home navigation i18n diverged for ${locale}`,
      actual,
    );
  }
  await page.evaluate(() => {
    document.documentElement.lang = "pt-BR";
  });
}

async function verifyVariants(page, viewport, evidence) {
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await page.waitForTimeout(100);
  const zoomed = await inspectDiscover(page);
  assert(
    zoomed.rootWidth <= viewport.width + 1 &&
      zoomed.bodyWidth <= viewport.width + 1 &&
      inside(zoomed.nav, viewport, 2) &&
      inside(zoomed.header, viewport, 2),
    "200% text conformance failed",
    zoomed,
  );
  await page.screenshot({
    path: `${OUTPUT_DIR}/after-${viewport.name}-200pct.png`,
    animations: "disabled",
  });
  evidence.variants["200pct"] = zoomed;
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "";
  });

  await page.evaluate(() => {
    document.documentElement.dataset.theme = "dark";
  });
  await page.waitForTimeout(60);
  await page.screenshot({
    path: `${OUTPUT_DIR}/after-${viewport.name}-dark.png`,
    animations: "disabled",
  });
  evidence.variants.dark = await inspectDiscover(page);
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "light";
  });

  await page.emulateMedia({ forcedColors: "active" });
  await page.waitForTimeout(60);
  await page.screenshot({
    path: `${OUTPUT_DIR}/after-${viewport.name}-forced-colors.png`,
    animations: "disabled",
  });
  evidence.variants.forcedColors = await inspectDiscover(page);
  await page.emulateMedia({ forcedColors: "none" });

  await page.emulateMedia({ reducedMotion: "reduce" });
  const reducedMotion = await page.evaluate(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  assert(reducedMotion, "Reduced-motion media query not active");
  await page.screenshot({
    path: `${OUTPUT_DIR}/after-${viewport.name}-reduced-motion.png`,
    animations: "disabled",
  });
  evidence.variants.reducedMotion = await inspectDiscover(page);
  await page.emulateMedia({ reducedMotion: "no-preference" });
}

const browser = await chromium.launch({ headless: true });
const evidence = {
  authority: "UX Design V2 Section 32 + Appendix A",
  beforeAuthority:
    "PR #250 ux-v2-manual-golden-authority artifact (implementation-before-convergence)",
  viewports: [],
  variants: {},
  knownDifferences: [
    "Quick Actions intentionally absent by approved exception.",
    "Floating Assistant launcher intentionally absent by approved exception.",
    "Map provider/style authority remains Mapbox runtime configuration with Leaflet fallback.",
  ],
};

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      geolocation: { latitude: -13.3776181, longitude: -38.9142193 },
      permissions: ["geolocation"],
    });
    await context.addInitScript(() => {
      localStorage.setItem("morro-digital-onboarded", "1");
      localStorage.setItem("voice-enabled", "false");
      localStorage.setItem("morro-analytics-consent-v1", "denied");
    });
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.route("**/api/weather", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(weather),
      }),
    );
    await page.goto(BASE_URL, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await waitForReady(page);
    const state = await assertPureDiscover(page, viewport);
    await page.screenshot({
      path: `${OUTPUT_DIR}/after-${viewport.name}.png`,
      fullPage: false,
      animations: "disabled",
    });

    if (viewport.name === "390x844") {
      await verifyLocales(page);
      await verifyProfileAndPrivacy(page);
      await verifyAssistantEntry(page);
      await verifyBoundedAssistantMessage(page);
      await verifyVariants(page, viewport, evidence);
    }

    assert(pageErrors.length === 0, "Browser page errors", pageErrors);
    evidence.viewports.push({ viewport, state, pageErrors });
    await context.close();
  }

  writeFileSync(
    `${OUTPUT_DIR}/manual-conformance.json`,
    JSON.stringify(evidence, null, 2),
  );
  writeFileSync(
    `${OUTPUT_DIR}/HOME_MANUAL_CONFORMANCE.txt`,
    "HOME_MANUAL_CONFORMANCE = PASS\n",
  );
  console.log("HOME_MANUAL_CONFORMANCE = PASS");
} catch (error) {
  writeFileSync(`${OUTPUT_DIR}/failure.txt`, String(error?.stack || error));
  writeFileSync(
    `${OUTPUT_DIR}/HOME_MANUAL_CONFORMANCE.txt`,
    "HOME_MANUAL_CONFORMANCE = FAIL\n",
  );
  throw error;
} finally {
  await browser.close();
}
