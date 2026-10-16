import { afterEach, expect, it, vi } from "vitest";
import {
  installDiscoverLayer,
  installDiscoverLocation,
} from "./discover-map-controls.js";
class Element {
  attrs = new Map<string, string>();
  dataset: Record<string, string> = {};
  disabled = false;
  hidden = false;
  textContent = "";
  className = "";
  listeners = new Map<string, () => void>();
  children: Element[] = [];
  parentElement: Element | null = null;
  classList = { toggle: vi.fn() };
  setAttribute(k: string, v: string) {
    this.attrs.set(k, v);
  }
  removeAttribute(k: string) {
    this.attrs.delete(k);
  }
  append(e: Element) {
    this.children.push(e);
    e.parentElement = this;
  }
  remove() {
    if (this.parentElement)
      this.parentElement.children = this.parentElement.children.filter(
        (x) => x !== this,
      );
  }
  addEventListener(k: string, fn: () => void) {
    this.listeners.set(k, fn);
  }
  removeEventListener(k: string) {
    this.listeners.delete(k);
  }
  click() {
    this.listeners.get("click")?.();
  }
}
afterEach(() => vi.unstubAllGlobals());
function fixture() {
  vi.stubGlobal("HTMLButtonElement", Element);
  vi.stubGlobal(
    "MutationObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  const parent = new Element(),
    button = new Element(),
    map = new Element();
  parent.append(button);
  const document = {
    documentElement: { lang: "pt" },
    getElementById: (id: string) => (id === "map" ? map : button),
    createElement: () => new Element(),
    defaultView: { navigator: { geolocation: undefined as unknown } },
  };
  return {
    document: document as unknown as Document,
    raw: document,
    button,
    map,
    parent,
  };
}
it("does not activate a thrown or unacknowledged style and removes provider listeners", () => {
  const f = fixture(),
    listeners = new Map<string, () => void>();
  const port = {
    setStyle: vi.fn<(style: string) => void>(() => {
      throw Error("controlled");
    }),
    on: (e: string, fn: () => void) => listeners.set(e, fn),
    off: (e: string) => listeners.delete(e),
  };
  const dispose = installDiscoverLayer({
    ...f,
    map: port,
    standardStyle: "standard",
    satelliteStyle: "satellite",
  });
  f.button.click();
  expect(f.map.attrs.get("data-map-layer")).toBe("unknown");
  expect(f.button.attrs.get("aria-pressed")).toBe("mixed");
  port.setStyle.mockImplementation(() => {});
  f.button.click();
  expect(f.map.attrs.get("data-map-layer")).toBe("unknown");
  listeners.get("style.load")?.();
  expect(f.map.attrs.get("data-map-layer")).toBe("satellite");
  dispose();
  expect(listeners.size).toBe(0);
});
it("discloses denied location and ignores a late callback after disposal", () => {
  const f = fixture();
  let success:
      | ((position: {
          coords: { longitude: number; latitude: number };
        }) => void)
      | undefined,
    error: ((e: { code: number }) => void) | undefined;
  f.raw.defaultView.navigator.geolocation = {
    getCurrentPosition(a: typeof success, b: typeof error) {
      success = a;
      error = b;
    },
  };
  const move = vi.fn();
  const dispose = installDiscoverLocation({
    document: f.document,
    currentLocation: () => undefined,
    onLocation: move,
  });
  f.button.click();
  error?.({ code: 1 });
  expect(f.parent.children.some((e) => e.textContent.includes("Permita"))).toBe(
    true,
  );
  f.button.click();
  dispose();
  success?.({ coords: { longitude: 1, latitude: 2 } });
  expect(move).not.toHaveBeenCalled();
});
it.each(["cached", "callback"])(
  "publishes granted after %s location and camera acknowledgement",
  (mode) => {
    const f = fixture();
    const center = [1, 2] as const;
    f.raw.defaultView.navigator.geolocation = {
      getCurrentPosition(
        success: (p: {
          coords: { longitude: number; latitude: number };
        }) => void,
      ) {
        success({ coords: { longitude: center[0], latitude: center[1] } });
      },
    };
    const move = vi.fn(() =>
      f.map.setAttribute("data-geolocation-state", "granted"),
    );
    const dispose = installDiscoverLocation({
      document: f.document,
      currentLocation: () => (mode === "cached" ? center : undefined),
      onLocation: move,
    });
    f.button.click();
    expect(move).toHaveBeenCalledExactlyOnceWith(center);
    expect(f.map.attrs.get("data-geolocation-state")).toBe("granted");
    expect(f.button.attrs.has("aria-busy")).toBe(false);
    dispose();
  },
);
it.each([1, 2, 3])(
  "retains denied/error without moving on geolocation failure %s",
  (code) => {
    const f = fixture();
    f.raw.defaultView.navigator.geolocation = {
      getCurrentPosition(
        _success: unknown,
        error: (e: { code: number }) => void,
      ) {
        error({ code });
      },
    };
    const move = vi.fn();
    const dispose = installDiscoverLocation({
      document: f.document,
      currentLocation: () => undefined,
      onLocation: move,
    });
    f.button.click();
    expect(f.map.attrs.get("data-geolocation-state")).toBe(
      code === 1 ? "denied" : "error",
    );
    expect(move).not.toHaveBeenCalled();
    expect(f.button.attrs.has("aria-busy")).toBe(false);
    dispose();
  },
);
it("reports unavailable and camera failure without claiming granted", () => {
  const f = fixture();
  const move = vi.fn(() => {
    throw Error("camera failed");
  });
  let cached: readonly [number, number] | undefined;
  const dispose = installDiscoverLocation({
    document: f.document,
    currentLocation: () => cached,
    onLocation: move,
  });
  f.button.click();
  expect(f.map.attrs.get("data-geolocation-state")).toBe("unavailable");
  expect(move).not.toHaveBeenCalled();
  cached = [1, 2];
  f.button.click();
  expect(f.map.attrs.get("data-geolocation-state")).toBe("error");
  dispose();
});
it("ignores superseded callbacks and reports asynchronous camera failure", () => {
  const f = fixture();
  const callbacks: Array<
    (p: { coords: { longitude: number; latitude: number } }) => void
  > = [];
  f.raw.defaultView.navigator.geolocation = {
    getCurrentPosition(success: (typeof callbacks)[number]) {
      callbacks.push(success);
    },
  };
  const move = vi.fn(() => {
    throw Error("camera failed");
  });
  const dispose = installDiscoverLocation({
    document: f.document,
    currentLocation: () => undefined,
    onLocation: move,
  });
  f.button.click();
  f.button.click();
  callbacks[0]!({ coords: { longitude: 1, latitude: 2 } });
  expect(move).not.toHaveBeenCalled();
  expect(f.map.attrs.has("data-geolocation-state")).toBe(false);
  callbacks[1]!({ coords: { longitude: 3, latitude: 4 } });
  expect(move).toHaveBeenCalledExactlyOnceWith([3, 4]);
  expect(f.map.attrs.get("data-geolocation-state")).toBe("error");
  dispose();
  callbacks[1]!({ coords: { longitude: 5, latitude: 6 } });
  expect(move).toHaveBeenCalledTimes(1);
  expect(f.map.attrs.get("data-geolocation-state")).toBe("error");
});
