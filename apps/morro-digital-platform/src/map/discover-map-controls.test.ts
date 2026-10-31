import { afterEach, expect, it, vi } from "vitest";
import {
  installDiscoverLayer,
  installDiscoverLocation,
  installDiscoverLayersGroup,
} from "./discover-map-controls.js";
class Element {
  id = "";
  style = { display: "" };
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
  getAttribute(k: string) {
    return this.attrs.get(k) ?? null;
  }
  querySelector(selector: string) {
    return selector === ".control-tooltip"
      ? (this.children.find((child) => child.className === "control-tooltip") ??
          null)
      : null;
  }
  removeAttribute(k: string) {
    this.attrs.delete(k);
  }
  append(e: Element) {
    e.remove();
    this.children.push(e);
    e.parentElement = this;
  }
  remove() {
    if (this.parentElement)
      this.parentElement.children = this.parentElement.children.filter(
        (x) => x !== this,
      );
    this.parentElement = null;
  }
  before(element: Element) {
    this.parentElement?.insertBefore(element, this);
  }
  insertBefore(element: Element, reference: Element) {
    element.remove();
    const index = this.children.indexOf(reference);
    this.children.splice(index < 0 ? this.children.length : index, 0, element);
    element.parentElement = this;
  }
  replaceWith(element: Element) {
    this.parentElement?.insertBefore(element, this);
    this.remove();
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
  const observers = new Set<() => void>();
  class Observer {
    constructor(private readonly callback: () => void) {}
    observe() {
      observers.add(this.callback);
    }
    disconnect() {
      observers.delete(this.callback);
    }
  }
  vi.stubGlobal("MutationObserver", Observer);
  const parent = new Element(),
    button = new Element(),
    map = new Element();
  parent.append(button);
  const tooltip = new Element();
  tooltip.className = "control-tooltip";
  button.append(tooltip);
  const document = {
    documentElement: { lang: "pt" },
    getElementById: (id: string): Element | null =>
      id === "map" ? map : button,
    createElement: () => new Element(),
    createComment: () => new Element(),
    defaultView: { navigator: { geolocation: undefined as unknown } },
  };
  return {
    document: document as unknown as Document,
    raw: document,
    button,
    map,
    parent,
    setLanguage(language: string) {
      document.documentElement.lang = language;
      for (const callback of observers) callback();
    },
    observerCount: () => observers.size,
  };
}

it.each([
  ["en-US", "Toggle 3D perspective", "Switch map layer", "Show my location"],
  [
    "es",
    "Alternar perspectiva 3D",
    "Cambiar capa del mapa",
    "Mostrar mi ubicación",
  ],
  ["he-IL", "שינוי זווית תלת־ממד", "החלפת שכבת מפה", "הצג את המיקום שלי"],
] as const)(
  "localizes shell controls in %s without depending on a map provider",
  (locale, perspective, layer, location) => {
    const f = fixture();
    f.button.remove();
    const ids = [
      "toggle-3d-mode",
      "toggle-map-layer",
      "toggle-globe-view",
      "recenter-map-control",
    ];
    const buttons = new Map(
      ids.map((id) => {
        const button = new Element();
        button.id = id;
        button.setAttribute("aria-label", "Rótulo em português");
        button.setAttribute("title", "Título em português");
        button.setAttribute("aria-pressed", "false");
        const tooltip = new Element();
        tooltip.className = "control-tooltip";
        tooltip.textContent = "Texto em português";
        button.append(tooltip);
        f.parent.append(button);
        return [id, button] as const;
      }),
    );
    f.raw.getElementById = (id) => buttons.get(id) ?? null;
    const dispose = installDiscoverLayersGroup(f.document);
    f.setLanguage(locale);

    for (const [id, expected] of [
      [ids[0]!, perspective],
      [ids[1]!, layer],
      [ids[3]!, location],
    ]) {
      const button = buttons.get(id!)!;
      expect(button.getAttribute("aria-label")).toBe(expected);
      expect(button.getAttribute("title")).toBe(expected);
      expect(button.querySelector(".control-tooltip")?.textContent).not.toBe(
        "Texto em português",
      );
      expect(button.getAttribute("aria-pressed")).toBe("false");
    }
    dispose();
    expect(f.parent.children.map((button) => button.id)).toEqual(ids);
    expect(f.observerCount()).toBe(0);
    f.setLanguage("pt-BR");
    expect(buttons.get(ids[0]!)?.getAttribute("aria-label")).toBe(perspective);
  },
);

it("updates layer labels during a pending provider operation without changing its state", () => {
  const f = fixture();
  const setStyle = vi.fn();
  const dispose = installDiscoverLayer({
    document: f.document,
    map: { setStyle, on: vi.fn(), off: vi.fn() },
    standardStyle: "standard",
    satelliteStyle: "satellite",
  });
  f.button.click();
  f.setLanguage("en");
  expect(f.button.getAttribute("title")).toBe("Switch map layer");
  expect(f.button.getAttribute("aria-label")).toBe("Switch map layer");
  expect(f.button.getAttribute("aria-busy")).toBe("true");
  expect(f.button.getAttribute("aria-pressed")).toBe("false");
  expect(setStyle).toHaveBeenCalledExactlyOnceWith("satellite");
  dispose();
});

it("localizes the location control without requesting location", () => {
  const f = fixture();
  const getCurrentPosition = vi.fn();
  f.raw.defaultView.navigator.geolocation = { getCurrentPosition };
  const dispose = installDiscoverLocation({
    document: f.document,
    currentLocation: () => undefined,
    onLocation: vi.fn(),
  });
  f.setLanguage("es");
  expect(f.button.getAttribute("aria-label")).toBe("Mostrar mi ubicación");
  expect(f.button.getAttribute("title")).toBe("Mostrar mi ubicación");
  expect(getCurrentPosition).not.toHaveBeenCalled();
  dispose();
  expect(f.observerCount()).toBe(0);
});
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
  const state: { cached?: readonly [number, number] } = {};
  const dispose = installDiscoverLocation({
    document: f.document,
    currentLocation: () => state.cached,
    onLocation: move,
  });
  f.button.click();
  expect(f.map.attrs.get("data-geolocation-state")).toBe("unavailable");
  expect(move).not.toHaveBeenCalled();
  state.cached = [1, 2];
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
