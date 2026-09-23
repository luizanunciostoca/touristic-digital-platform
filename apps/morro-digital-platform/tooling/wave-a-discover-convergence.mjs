import { mkdirSync, writeFileSync } from "node:fs";
import playwright from "/tmp/pw/node_modules/playwright/index.js";

const { chromium } = playwright;
const BASE_URL = process.env.MORRO_BROWSER_URL || "http://127.0.0.1:4173/";
const OUTPUT_DIR =
  process.env.WAVE_A_EVIDENCE_DIR || "/tmp/wave-a-discover-convergence";

mkdirSync(OUTPUT_DIR, { recursive: true });

const viewports = [
  { name: "390x844", width: 390, height: 844 },
  { name: "430x932", width: 430, height: 932 },
  { name: "tablet-768x1024", width: 768, height: 1024 },
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
  throw new Error(
    `${message}${details === undefined ? "" : `: ${JSON.stringify(details)}`}`,
  );
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

async function seed(context) {
  await context.addInitScript(() => {
    localStorage.setItem("morro-digital-onboarded", "1");
    localStorage.setItem("voice-enabled", "false");
    localStorage.setItem("morro-analytics-consent-v1", "denied");
  });
}

async function waitReady(page) {
  await page
    .locator(
      '#map[data-map-state="ready"][data-home-state="ready"][data-map-mode="real"]',
    )
    .waitFor({ state: "attached", timeout: 30000 });
  await page
    .locator('#weather-widget[data-weather-state="ready"]')
    .waitFor({ state: "visible", timeout: 10000 });
  await page
    .locator('.morro-explore-marker[data-morro-explore-marker="true"]')
    .first()
    .waitFor({ state: "visible", timeout: 10000 });
  await page
    .locator("#assistant-category-rail")
    .waitFor({ state: "visible", timeout: 10000 });
  await page
    .locator("#recenter-map-control")
    .waitFor({ state: "visible", timeout: 10000 });
}

async function inspect(page) {
  return page.evaluate(() => {
    const rect = (selector) => {
      const node = document.querySelector(selector);
      if (!(node instanceof HTMLElement)) return null;
      const box = node.getBoundingClientRect();
      const style = getComputedStyle(node);
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
    const touchTargets = Array.from(
      document.querySelectorAll(
        "#assistant-category-rail button, #globe-map-control button",
      ),
    ).map((node) => {
      const box = node.getBoundingClientRect();
      return {
        id: node.id || node.getAttribute("data-assistant-category"),
        width: box.width,
        height: box.height,
      };
    });
    const map = globalThis.mapboxPrimaryInstance;
    const center = map?.getCenter?.();
    return {
      mode: document.body.dataset.mdMode,
      map: rect("#map"),
      header: rect(".md-home-header-inner"),
      weather: rect("#weather-widget"),
      weatherEmoji: rect("#weather-widget .weather-emoji"),
      weatherTemp: rect("#weather-widget .weather-temp"),
      weatherTempLines: (() => {
        const node = document.querySelector("#weather-widget .weather-temp");
        if (!(node instanceof HTMLElement)) return null;
        const box = node.getBoundingClientRect();
        const lineHeight = Number.parseFloat(getComputedStyle(node).lineHeight);
        return Number.isFinite(lineHeight) && lineHeight > 0
          ? Math.round(box.height / lineHeight)
          : null;
      })(),
      weatherDirection: (() => {
        const node = document.querySelector(
          "#weather-widget .weather-compact-main",
        );
        return node instanceof HTMLElement
          ? getComputedStyle(node).flexDirection
          : null;
      })(),
      weatherError: (() => {
        const node = document.querySelector("#weather-widget .weather-error");
        if (!(node instanceof HTMLElement)) return null;
        return {
          text: node.textContent ?? "",
          clientHeight: node.clientHeight,
          scrollHeight: node.scrollHeight,
          clientWidth: node.clientWidth,
          scrollWidth: node.scrollWidth,
        };
      })(),
      rail: rect("#assistant-category-rail"),
      controls: rect("#globe-map-control"),
      composer: rect("#assistant-input-area"),
      nav: rect("#home-bottom-navigation"),
      markerCount: document.querySelectorAll(
        '.morro-explore-marker[data-morro-explore-marker="true"]',
      ).length,
      dataMarkerCount: Number(
        document.getElementById("map")?.getAttribute("data-map-marker-count") ??
          "0",
      ),
      discoverPoiCount: Number(
        document
          .getElementById("map")
          ?.getAttribute("data-discover-poi-count") ?? "0",
      ),
      camera: center
        ? { lng: center.lng, lat: center.lat, zoom: map?.getZoom?.() }
        : null,
      rootWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      touchTargets,
      onboardingTargets: {
        map: Boolean(document.querySelector("#map-container, #map")),
        weather: Boolean(document.querySelector("#weather-widget")),
        controls: Boolean(
          document.querySelector("#globe-map-control #toggle-globe-view"),
        ),
      },
    };
  });
}

function inside(rect, width, height, tolerance = 2) {
  return Boolean(
    rect &&
    rect.left >= -tolerance &&
    rect.top >= -tolerance &&
    rect.right <= width + tolerance &&
    rect.bottom <= height + tolerance,
  );
}

const browser = await chromium.launch({ headless: true });
const evidence = {
  authority: "IMG_2421.PNG smartphone 1 + UX Design V2",
  viewports: [],
  negatives: {},
};

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      geolocation: { latitude: -13.3776181, longitude: -38.9142193 },
      permissions: ["geolocation"],
    });
    await seed(context);
    const page = await context.newPage();
    const pageErrors = [];
    const consoleErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      const text = message.text();
      if (text.includes("events.mapbox.com/events/v2")) return;
      consoleErrors.push(text);
    });
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
    await waitReady(page);

    const initial = await inspect(page);
    assert(
      initial.mode === "discover",
      "Discover is not initial mode",
      initial,
    );
    assert(
      initial.map &&
        Math.abs(initial.map.left) <= 2 &&
        Math.abs(initial.map.top) <= 2 &&
        Math.abs(initial.map.right - viewport.width) <= 2 &&
        Math.abs(initial.map.bottom - viewport.height) <= 2,
      "Map is not the dominant full viewport canvas",
      initial.map,
    );
    assert(
      initial.markerCount >= 5,
      "Initial app-owned POIs are not evident",
      initial,
    );
    assert(
      initial.dataMarkerCount === 0 &&
        initial.discoverPoiCount === initial.markerCount,
      "Initial Discover POIs leaked into the V1 marker lifecycle",
      initial,
    );
    assert(
      initial.camera &&
        Math.abs(initial.camera.lng - -38.9167) < 0.02 &&
        Math.abs(initial.camera.lat - -13.3833) < 0.02 &&
        Math.abs(initial.camera.zoom - 14.8) < 0.25,
      "Initial camera is not deterministic",
      initial.camera,
    );
    assert(
      !overlaps(initial.header, initial.weather),
      "Destination and Weather collide",
      initial,
    );
    assert(
      initial.weatherDirection === "row" &&
        inside(initial.weatherEmoji, viewport.width, viewport.height) &&
        inside(initial.weatherTemp, viewport.width, viewport.height) &&
        initial.weatherEmoji.top >= initial.weather.top - 1 &&
        initial.weatherEmoji.bottom <= initial.weather.bottom + 1 &&
        initial.weatherTemp.top >= initial.weather.top - 1 &&
        initial.weatherTemp.bottom <= initial.weather.bottom + 1 &&
        initial.weatherTempLines === 1,
      "Compact Weather content is clipped, stacked, or wrapped",
      initial,
    );
    assert(
      !overlaps(initial.rail, initial.controls) &&
        !overlaps(initial.rail, initial.composer) &&
        !overlaps(initial.controls, initial.composer) &&
        !overlaps(initial.nav, initial.composer),
      "Discover overlays collide",
      initial,
    );
    for (const [name, rect] of Object.entries({
      header: initial.header,
      weather: initial.weather,
      rail: initial.rail,
      controls: initial.controls,
      composer: initial.composer,
      nav: initial.nav,
    })) {
      assert(
        inside(rect, viewport.width, viewport.height),
        `${name} escapes safe viewport`,
        rect,
      );
    }
    assert(
      initial.touchTargets.every(
        (target) => target.width >= 44 && target.height >= 44,
      ),
      "Discover touch target below 44px",
      initial.touchTargets,
    );
    assert(
      Object.values(initial.onboardingTargets).every(Boolean),
      "Wave H semantic target contract changed",
      initial.onboardingTargets,
    );
    assert(
      initial.rootWidth <= viewport.width + 1 &&
        initial.bodyWidth <= viewport.width + 1,
      "Horizontal overflow detected",
      initial,
    );

    const cameraBeforeGestures = await page.evaluate(() => {
      const map = globalThis.mapboxPrimaryInstance;
      const center = map?.getCenter?.();
      return {
        center: center ? { lng: center.lng, lat: center.lat } : null,
        zoom: map?.getZoom?.(),
      };
    });
    const canvas = page.locator("#map .mapboxgl-canvas");
    const canvasBox = await canvas.boundingBox();
    assert(canvasBox, "Mapbox canvas unavailable for gesture validation");
    const gesturePoint = await page.evaluate(
      ({ canvasLeft, canvasTop, canvasWidth, canvasHeight }) => {
        const dock = document
          .getElementById("unified-assistant-dock")
          ?.getBoundingClientRect();
        const header = document
          .querySelector(".md-home-header-inner")
          ?.getBoundingClientRect();
        const visibleTop = Math.max(canvasTop, (header?.bottom ?? canvasTop) + 24);
        const visibleBottom = Math.min(
          canvasTop + canvasHeight,
          (dock?.top ?? canvasTop + canvasHeight) - 24,
        );
        const y =
          visibleBottom > visibleTop + 48
            ? visibleTop + (visibleBottom - visibleTop) * 0.55
            : canvasTop + canvasHeight * 0.3;
        return {
          x: canvasLeft + canvasWidth * 0.5,
          y,
          visibleTop,
          visibleBottom,
        };
      },
      {
        canvasLeft: canvasBox.x,
        canvasTop: canvasBox.y,
        canvasWidth: canvasBox.width,
        canvasHeight: canvasBox.height,
      },
    );
    const gestureX = gesturePoint.x;
    const gestureY = gesturePoint.y;
    const pointerOwner = await page.evaluate(
      ({ x, y }) => {
        const target = document.elementFromPoint(x, y);
        return {
          tag: target?.tagName ?? null,
          id: target?.id ?? null,
          className:
            target instanceof HTMLElement ? target.className : null,
          insideDock: Boolean(target?.closest("#unified-assistant-dock")),
        };
      },
      { x: gestureX, y: gestureY },
    );
    assert(
      !pointerOwner.insideDock,
      "Wave A gesture probe is covered by the unified dock",
      { gesturePoint, pointerOwner },
    );
    await page.mouse.move(gestureX, gestureY);
    await page.mouse.down();
    await page.mouse.move(gestureX + 52, gestureY + 28, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(350);
    const afterPan = await page.evaluate(() => {
      const map = globalThis.mapboxPrimaryInstance;
      const center = map?.getCenter?.();
      return center ? { lng: center.lng, lat: center.lat } : null;
    });
    assert(
      cameraBeforeGestures.center &&
        afterPan &&
        (Math.abs(afterPan.lng - cameraBeforeGestures.center.lng) > 0.00001 ||
          Math.abs(afterPan.lat - cameraBeforeGestures.center.lat) > 0.00001),
      "Pointer pan did not move the map camera",
      { cameraBeforeGestures, afterPan },
    );
    await page.mouse.move(gestureX, gestureY);
    await page.mouse.wheel(0, -640);
    await page.waitForTimeout(550);
    const afterZoom = await page.evaluate(
      () => globalThis.mapboxPrimaryInstance?.getZoom?.() ?? null,
    );
    assert(
      typeof cameraBeforeGestures.zoom === "number" &&
        typeof afterZoom === "number" &&
        Math.abs(afterZoom - cameraBeforeGestures.zoom) > 0.05,
      "Wheel zoom did not change the map zoom",
      { before: cameraBeforeGestures.zoom, after: afterZoom },
    );

    await page.evaluate(() => {
      const map = globalThis.mapboxPrimaryInstance;
      map?.setCenter?.([-38.88, -13.35]);
      map?.setZoom?.(12);
    });
    await page.locator("#recenter-map-control").click();
    await page.waitForTimeout(900);
    const recentered = await page.evaluate(() => {
      const map = globalThis.mapboxPrimaryInstance;
      const center = map?.getCenter?.();
      return {
        center: center ? { lng: center.lng, lat: center.lat } : null,
        zoom: map?.getZoom?.(),
        geolocationState: document
          .getElementById("map")
          ?.getAttribute("data-geolocation-state"),
      };
    });
    assert(
      recentered.center &&
        Math.abs(recentered.center.lng - -38.9142193) < 0.02 &&
        Math.abs(recentered.center.lat - -13.3776181) < 0.02 &&
        recentered.zoom >= 15.4 &&
        recentered.geolocationState === "granted",
      "Recenter/geolocation did not restore a deterministic local camera",
      recentered,
    );

    await page.locator('[data-assistant-category="beaches"]').click();
    await page
      .locator(
        '#map[data-explore-state="ready"][data-explore-category="beaches"]',
      )
      .waitFor({ state: "attached", timeout: 10000 });
    const beachMarkers = page.locator(
      '.morro-explore-marker[data-explore-category="beaches"]',
    );
    const beachMarkerCount = await beachMarkers.count();
    let clickableBeachIndex = -1;
    for (let index = 0; index < beachMarkerCount; index += 1) {
      const marker = beachMarkers.nth(index);
      const box = await marker.boundingBox();
      if (!box) continue;
      const isTopmost = await marker.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const topmost = document
          .elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
          ?.closest(".morro-explore-marker");
        return topmost === element;
      });
      if (isTopmost) {
        clickableBeachIndex = index;
        break;
      }
    }
    assert(
      clickableBeachIndex >= 0,
      "No beach POI is pointer-selectable at its visible center",
    );
    await beachMarkers.nth(clickableBeachIndex).click();
    await page
      .locator(
        '#map[data-explore-stage="detail"] .morro-explore-marker[data-selected="true"][aria-current="location"]',
      )
      .waitFor({ state: "visible", timeout: 10000 });

    await page.evaluate(() => {
      const heading = document.querySelector(".md-home-header h1");
      if (heading) {
        heading.textContent =
          "Morro de São Paulo — destino com nome excepcionalmente longo para validação";
      }
    });
    const longDestination = await inspect(page);
    assert(
      longDestination.rootWidth <= viewport.width + 1 &&
        longDestination.bodyWidth <= viewport.width + 1 &&
        inside(longDestination.header, viewport.width, viewport.height),
      "Long destination breaks layout",
      longDestination,
    );

    await page.screenshot({
      path: `${OUTPUT_DIR}/after-${viewport.name}.png`,
      animations: "disabled",
    });
    assert(pageErrors.length === 0, "Browser page errors", pageErrors);
    assert(consoleErrors.length === 0, "Browser console errors", consoleErrors);
    evidence.viewports.push({
      viewport,
      initial,
      recentered,
      longDestination,
      pageErrors,
      consoleErrors,
    });
    await context.close();
  }

  {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    await seed(context);
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "permissions", {
        configurable: true,
        value: { query: async () => ({ state: "denied" }) },
      });
      Object.defineProperty(navigator, "geolocation", {
        configurable: true,
        value: {
          getCurrentPosition(_success, error) {
            error({ code: 1, message: "permission denied" });
          },
        },
      });
    });
    const page = await context.newPage();
    await page.route("**/api/weather", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: "{}",
      }),
    );
    await page.goto(BASE_URL, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page
      .locator('#map[data-map-state="ready"][data-map-mode="real"]')
      .waitFor({ state: "attached", timeout: 30000 });
    await page
      .locator('#weather-widget[data-weather-state="error"]')
      .waitFor({ state: "visible", timeout: 10000 });
    await page.locator("#recenter-map-control").click();
    await page.waitForTimeout(100);
    const negative = await inspect(page);
    const geoState = await page
      .locator("#map")
      .getAttribute("data-geolocation-state");
    const deniedCamera = await page.evaluate(() => {
      const map = globalThis.mapboxPrimaryInstance;
      const center = map?.getCenter?.();
      return {
        center: center ? { lng: center.lng, lat: center.lat } : null,
        zoom: map?.getZoom?.(),
      };
    });
    assert(
      geoState === "denied",
      "Denied geolocation state was not exposed",
      geoState,
    );
    assert(
      deniedCamera.center &&
        Math.abs(deniedCamera.center.lng - -38.9167) < 0.02 &&
        Math.abs(deniedCamera.center.lat - -13.3833) < 0.02 &&
        Math.abs(deniedCamera.zoom - 14.8) < 0.25,
      "Denied geolocation did not fall back to the deterministic Morro camera",
      deniedCamera,
    );
    assert(
      negative.rootWidth <= 391 && negative.bodyWidth <= 391,
      "Negative states cause horizontal overflow",
      negative,
    );
    assert(
      negative.weatherError &&
        negative.weatherError.text.trim().length > 0 &&
        negative.weatherError.scrollHeight <=
          negative.weatherError.clientHeight + 1 &&
        negative.weatherError.scrollWidth <=
          negative.weatherError.clientWidth + 1,
      "Weather unavailable message is clipped",
      negative.weatherError,
    );
    await page.screenshot({
      path: `${OUTPUT_DIR}/after-390x844-negative-states.png`,
      animations: "disabled",
    });
    evidence.negatives = {
      weather: "error",
      geolocation: geoState,
      layout: negative,
    };
    await context.close();
  }

  writeFileSync(
    `${OUTPUT_DIR}/wave-a-convergence.json`,
    JSON.stringify(evidence, null, 2),
  );
  writeFileSync(
    `${OUTPUT_DIR}/WAVE_A_DISCOVER_CONVERGENCE.txt`,
    "WAVE_A_DISCOVER_CONVERGENCE = PASS\n",
  );
  console.log("WAVE_A_DISCOVER_CONVERGENCE = PASS");
} catch (error) {
  writeFileSync(
    `${OUTPUT_DIR}/WAVE_A_DISCOVER_CONVERGENCE.txt`,
    "WAVE_A_DISCOVER_CONVERGENCE = FAIL\n",
  );
  writeFileSync(`${OUTPUT_DIR}/failure.txt`, String(error?.stack || error));
  throw error;
} finally {
  await browser.close();
}
