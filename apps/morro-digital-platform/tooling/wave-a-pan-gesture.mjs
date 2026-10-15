import { setTimeout as delay } from "node:timers/promises";

// Poll in Node: Playwright waitForFunction compiles predicates in-page and can
// violate strict script-src CSP. evaluate uses the existing protocol boundary.
export async function pollPage(page, predicate, argument, { timeout }) {
  const deadline = Date.now() + timeout;
  while (true) {
    if (await page.evaluate(predicate, argument)) return;
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error("PAN_CONDITION_TIMEOUT");
    await delay(Math.min(50, remaining));
  }
}

// Evaluate in the page. No camera mutation, provider substitution,
// retry of a failed assertion, or relaxation of movement thresholds.
export function inspectPanPath() {
  const canvas = document.querySelector("#map .mapboxgl-canvas");
  const map = globalThis.mapboxPrimaryInstance;
  const center = map?.getCenter?.();
  const state = {
    viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
    mode: document.getElementById("map")?.dataset.mapMode,
    center: center ? { lng: center.lng, lat: center.lat } : null,
    zoom: map?.getZoom?.(),
    moving: map?.isMoving?.(),
    styleLoaded: map?.isStyleLoaded?.(),
    dragEnabled: map?.dragPan?.isEnabled?.(),
  };
  if (!(canvas instanceof HTMLCanvasElement))
    return { ...state, path: null, reason: "NO_CANVAS" };
  const rect = canvas.getBoundingClientRect();
  const describe = (element) =>
    element
      ? {
          tag: element.tagName,
          id: element.id,
          className: String(element.className).slice(0, 240),
        }
      : null;
  const attempts = [];
  // Fixed displacement and six pointer steps preserve the original contract.
  // Check every pixel along its linear trajectory, not only its start.
  for (let row = 2; row <= 8; row++)
    for (let col = 2; col <= 8; col++) {
      const x = rect.left + (rect.width * col) / 10;
      const y = rect.top + (rect.height * row) / 10;
      const samples = [];
      for (let step = 0; step <= 60; step++) {
        const px = x + (52 * step) / 60,
          py = y + (28 * step) / 60;
        const target = document.elementFromPoint(px, py);
        samples.push({
          x: px,
          y: py,
          canvas: target === canvas,
          target: describe(target),
        });
      }
      const clear = samples.every(
        (p) =>
          p.canvas &&
          p.x >= 0 &&
          p.y >= 0 &&
          p.x < innerWidth &&
          p.y < innerHeight,
      );
      attempts.push({
        x,
        y,
        clear,
        firstBlocked: samples.find((p) => !p.canvas) ?? null,
      });
      if (clear)
        return { ...state, path: { x, y, dx: 52, dy: 28, samples }, attempts };
    }
  return {
    ...state,
    path: null,
    attempts,
    reason: "NO_CLEAR_CANVAS_TRAJECTORY",
  };
}

export async function provePointerPan(page, evidenceDir, viewportName) {
  const { writeFileSync } = await import("node:fs");
  let before, after;
  try {
    const capabilities = await page.evaluate(() => {
      const map = globalThis.mapboxPrimaryInstance;
      return {
        real: document.getElementById("map")?.dataset.mapMode === "real",
        methods: Object.fromEntries(
          [
            "isStyleLoaded",
            "isMoving",
            "on",
            "off",
            "getCenter",
            "getZoom",
          ].map((key) => [key, typeof map?.[key] === "function"]),
        ),
        dragPanIsEnabled: typeof map?.dragPan?.isEnabled === "function",
      };
    });
    if (
      !capabilities.real ||
      !capabilities.dragPanIsEnabled ||
      !Object.values(capabilities.methods).every(Boolean)
    )
      throw new Error(
        "REAL_MAPBOX_PAN_CAPABILITY_REQUIRED:" + JSON.stringify(capabilities),
      );
    // Require actual provider, enabled interaction and a settled camera; never
    // enable dragPan or call setCenter to manufacture a passing observation.
    await pollPage(
      page,
      () => {
        const map = globalThis.mapboxPrimaryInstance;
        return (
          document.getElementById("map")?.dataset.mapMode === "real" &&
          map?.isStyleLoaded?.() === true &&
          map?.isMoving?.() === false &&
          map?.dragPan?.isEnabled?.() === true
        );
      },
      null,
      { timeout: 10000 },
    );
    before = await page.evaluate(inspectPanPath);
    if (!before.path) throw new Error("NO_CLEAR_CANVAS_TRAJECTORY");
    // Two animation frames prove the chosen path and camera stayed stable.
    await page.evaluate(() => {
      globalThis.__wavePanFramesReady = false;
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          globalThis.__wavePanFramesReady = true;
        }),
      );
    });
    await pollPage(page, () => globalThis.__wavePanFramesReady === true, null, {
      timeout: 3000,
    });
    const stable = await page.evaluate(inspectPanPath);
    if (
      !stable.path ||
      stable.path.x !== before.path.x ||
      stable.path.y !== before.path.y ||
      stable.center?.lng !== before.center?.lng ||
      stable.center?.lat !== before.center?.lat ||
      stable.moving
    )
      throw new Error("PAN_PREFLIGHT_CHANGED");
    await page.evaluate(() => {
      const map = globalThis.mapboxPrimaryInstance;
      globalThis.__wavePanEvents = [];
      const start = () =>
        globalThis.__wavePanEvents.push({
          event: "dragstart",
          at: performance.now(),
        });
      const end = () =>
        globalThis.__wavePanEvents.push({
          event: "dragend",
          at: performance.now(),
        });
      map.on("dragstart", start);
      map.on("dragend", end);
      globalThis.__wavePanCleanup = () => {
        map.off("dragstart", start);
        map.off("dragend", end);
      };
    });
    await page.mouse.move(before.path.x, before.path.y);
    await page.evaluate(() => {
      globalThis.__wavePanWindow = { started: performance.now() };
    });
    await page.mouse.down();
    try {
      await page.mouse.move(before.path.x + 52, before.path.y + 28, {
        steps: 6,
      });
    } finally {
      await page.mouse.up();
    }
    await page.evaluate(() => {
      globalThis.__wavePanWindow.released = performance.now();
    });
    try {
      await pollPage(
        page,
        () => {
          const { started, released } = globalThis.__wavePanWindow;
          const events = globalThis.__wavePanEvents;
          const start = events.find(
            (e) =>
              e.event === "dragstart" && e.at >= started && e.at <= released,
          );
          return (
            start &&
            events.some(
              (e) =>
                e.event === "dragend" &&
                e.at >= start.at &&
                e.at <= released + 1000,
            )
          );
        },
        null,
        { timeout: 1500 },
      );
    } catch {
      throw new Error("POINTER_PAN_DRAG_EVENTS_MISSING_OR_OUTSIDE_GESTURE");
    }
    // Same original threshold; condition wait replaces arbitrary 350ms delay.
    await pollPage(
      page,
      ({ lng, lat }) => {
        const map = globalThis.mapboxPrimaryInstance,
          c = map?.getCenter?.();
        return (
          c &&
          map.isMoving?.() === false &&
          (Math.abs(c.lng - lng) > 0.00001 || Math.abs(c.lat - lat) > 0.00001)
        );
      },
      before.center,
      { timeout: 10000 },
    );
    after = await page.evaluate(inspectPanPath);
    if (
      !after.center ||
      !(
        Math.abs(after.center.lng - before.center.lng) > 0.00001 ||
        Math.abs(after.center.lat - before.center.lat) > 0.00001
      )
    )
      throw new Error("Pointer pan did not move the map camera");
    return {
      before,
      after,
      gestureWindow: await page.evaluate(() => globalThis.__wavePanWindow),
      events: await page.evaluate(() => globalThis.__wavePanEvents),
    };
  } catch (error) {
    after = await page
      .evaluate(inspectPanPath)
      .catch((e) => ({ captureError: String(e) }));
    writeFileSync(
      `${evidenceDir}/pan-${viewportName}-failure.json`,
      JSON.stringify(
        {
          error: String(error),
          before,
          after,
          gestureWindow: await page
            .evaluate(() => globalThis.__wavePanWindow ?? null)
            .catch(() => null),
          events: await page
            .evaluate(() => globalThis.__wavePanEvents ?? [])
            .catch(() => []),
        },
        null,
        2,
      ),
    );
    await page
      .screenshot({ path: `${evidenceDir}/pan-${viewportName}-failure.png` })
      .catch(() => {});
    throw error;
  } finally {
    await page
      .evaluate(() => {
        globalThis.__wavePanCleanup?.();
        delete globalThis.__wavePanCleanup;
        delete globalThis.__wavePanFramesReady;
      })
      .catch(() => {});
  }
}
