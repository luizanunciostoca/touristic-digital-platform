// Pure harness tests: simulated page/camera events are NOT Mapbox acceptance.
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  inspectPanPath,
  provePointerPan,
  pollPage,
} from "./wave-a-pan-gesture.mjs";

vi.mock("node:timers/promises", () => ({ setTimeout: async () => {} }));
const directories = [];
const changedGlobals = new Map();
function install(name, value) {
  if (!changedGlobals.has(name))
    changedGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, {
    value,
    writable: true,
    configurable: true,
  });
}
afterEach(() => {
  vi.restoreAllMocks();
  for (const [key, descriptor] of changedGlobals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
  changedGlobals.clear();
  for (const name of ["__wavePanEvents", "__wavePanWindow", "__wavePanCleanup"])
    delete globalThis[name];
  for (const dir of directories.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
function fixture(options = {}) {
  let clock = 0;
  vi.spyOn(Date, "now").mockImplementation(() => (clock += 1000));
  const evidence = mkdtempSync(join(tmpdir(), "wave-pan-unit-"));
  directories.push(evidence);
  const width = 390,
    height = 844;
  class Canvas {
    getBoundingClientRect() {
      return options.border
        ? { left: 380, top: 834, width: 10, height: 10 }
        : { left: 0, top: 0, width, height };
    }
  }
  const canvas = new Canvas();
  canvas.tagName = "CANVAS";
  canvas.id = "";
  canvas.className = "mapboxgl-canvas";
  const overlay = { tagName: "DIV", id: "overlay", className: "overlay" };
  install("HTMLCanvasElement", Canvas);
  install("innerWidth", width);
  install("innerHeight", height);
  install("devicePixelRatio", 1);
  install("requestAnimationFrame", (callback) => {
    if (!options.stalledFrames) callback();
  });
  install("document", {
    querySelector: () => canvas,
    getElementById: () => ({ dataset: { mapMode: options.mode ?? "real" } }),
    elementFromPoint: (x, y) =>
      options.blocked || x >= width || y >= height ? overlay : canvas,
  });
  const listeners = new Map();
  let pressed = false,
    moved = false;
  const center = { lng: -38.9167, lat: -13.3833 };
  const map = {
    getCenter: () => ({ ...center }),
    getZoom: () => 14.8,
    isStyleLoaded: () => !options.notReady,
    isMoving: () => !!options.moving,
    dragPan: { isEnabled: () => !options.dragDisabled },
    on: (name, callback) => listeners.set(name, callback),
    off: (name) => listeners.delete(name),
  };
  if (options.missing) delete map[options.missing];
  install("mapboxPrimaryInstance", map);
  const page = {
    evaluate: async (fn, arg) => fn(arg),
    waitForFunction: async () => {
      throw new Error("CSP_UNSAFE_EVAL_FORBIDDEN");
    },
    screenshot: async () => {
      page.screenshots++;
    },
    screenshots: 0,
    mouse: {
      move: async () => {
        if (pressed) {
          moved = true;
          if (!options.noEvents) listeners.get("dragstart")?.();
          if (options.staleStart)
            globalThis.__wavePanEvents[0].at =
              globalThis.__wavePanWindow.started - 1;
          if (!options.noMovement) center.lng += 0.001;
        }
      },
      down: async () => {
        pressed = true;
      },
      up: async () => {
        pressed = false;
        if (moved && !options.noEvents && !options.noEnd)
          listeners.get("dragend")?.();
      },
    },
  };
  return { page, evidence, listeners };
}

describe("pointer-pan harness algorithm (simulated page; never provider proof)", () => {
  it("rejects obstruction and viewport-border trajectories", () => {
    fixture({ blocked: true });
    expect(inspectPanPath().path).toBeNull();
    fixture({ border: true });
    expect(inspectPanPath().path).toBeNull();
  });
  it.each(["on", "off", "isMoving", "isStyleLoaded", "getCenter", "getZoom"])(
    "rejects absent %s capability before gesture",
    async (missing) => {
      const f = fixture({ missing });
      await expect(provePointerPan(f.page, f.evidence, "unit")).rejects.toThrow(
        "REAL_MAPBOX_PAN_CAPABILITY_REQUIRED",
      );
      expect(f.page.screenshots).toBe(1);
    },
  );
  it.each([
    { notReady: true },
    { moving: true },
    { dragDisabled: true },
    { mode: "development" },
  ])("rejects unavailable readiness %j", async (options) => {
    const f = fixture(options);
    await expect(provePointerPan(f.page, f.evidence, "unit")).rejects.toThrow();
  });
  it.each([{ noEvents: true }, { noEnd: true }, { staleStart: true }])(
    "rejects camera movement without both drag events %j",
    async (options) => {
      const f = fixture(options);
      await expect(provePointerPan(f.page, f.evidence, "unit")).rejects.toThrow(
        "POINTER_PAN_DRAG_EVENTS_MISSING_OR_OUTSIDE_GESTURE",
      );
      expect(f.listeners.size).toBe(0);
      const saved = JSON.parse(
        readFileSync(join(f.evidence, "pan-unit-failure.json"), "utf8"),
      );
      expect(saved.after.viewport.width).toBe(390);
      expect(f.page.screenshots).toBe(1);
    },
  );
  it("bounds animation-frame readiness and captures failure before any gesture", async () => {
    const f = fixture({ stalledFrames: true });
    await expect(provePointerPan(f.page, f.evidence, "unit")).rejects.toThrow(
      "PAN_CONDITION_TIMEOUT",
    );
    expect(f.listeners.size).toBe(0);
    expect(f.page.screenshots).toBe(1);
    expect(globalThis.__wavePanWindow).toBeUndefined();
    expect(globalThis.__wavePanFramesReady).toBeUndefined();
  });

  it("rejects drag events without camera movement", async () => {
    const f = fixture({ noMovement: true });
    await expect(provePointerPan(f.page, f.evidence, "unit")).rejects.toThrow();
    expect(f.listeners.size).toBe(0);
  });
  it("records ordered gesture events and removes listeners on synthetic success", async () => {
    const f = fixture();
    const result = await provePointerPan(f.page, f.evidence, "unit");
    expect(result.events.map((e) => e.event)).toEqual(["dragstart", "dragend"]);
    expect(result.events[0].at).toBeGreaterThanOrEqual(
      result.gestureWindow.started,
    );
    expect(result.events[1].at).toBeLessThanOrEqual(
      result.gestureWindow.released + 1000,
    );
    expect(result.after.center.lng - result.before.center.lng).toBeGreaterThan(
      0.00001,
    );
    expect(f.listeners.size).toBe(0);
  });
});

describe("CSP-safe Node polling", () => {
  it("polls with evaluate, forwards arguments and never compiles in-page", async () => {
    let calls = 0;
    const page = {
      evaluate: async (fn, value) => {
        calls++;
        return fn(value) && calls === 3;
      },
      waitForFunction: () => {
        throw new Error("CSP_UNSAFE_EVAL_FORBIDDEN");
      },
    };
    await pollPage(page, (value) => value === "expected", "expected", {
      timeout: 1000,
    });
    expect(calls).toBe(3);
  });
  it("propagates page errors instead of treating provider failure as readiness", async () => {
    await expect(
      pollPage(
        {
          evaluate: async () => {
            throw new Error("PAGE_CLOSED");
          },
        },
        () => true,
        null,
        { timeout: 1000 },
      ),
    ).rejects.toThrow("PAGE_CLOSED");
  });
});
