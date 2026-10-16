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
