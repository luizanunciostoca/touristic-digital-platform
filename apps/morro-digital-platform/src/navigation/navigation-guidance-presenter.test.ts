import { describe, expect, it, vi } from "vitest";

import type { NavigationRuntimeSnapshot } from "@touristic/navigation";

import { createNavigationGuidancePresenter } from "./navigation-guidance-presenter.js";

class FakeClassList {
  private readonly values = new Set<string>();

  constructor(initial: readonly string[] = []) {
    for (const value of initial) this.values.add(value);
  }

  add(...values: string[]): void {
    for (const value of values) this.values.add(value);
  }

  remove(...values: string[]): void {
    for (const value of values) this.values.delete(value);
  }

  contains(value: string): boolean {
    return this.values.has(value);
  }

  toggle(value: string, force?: boolean): boolean {
    const next = force ?? !this.values.has(value);
    if (next) this.values.add(value);
    else this.values.delete(value);
    return next;
  }
}

interface FakeElement {
  textContent: string;
  style: Record<string, string>;
  classList: FakeClassList;
  attributes: Map<string, string>;
  setAttribute(name: string, value: string): void;
  addEventListener(type: string, listener: (event: Event) => void): void;
  removeEventListener(type: string): void;
  click(): void;
  querySelector<T extends HTMLElement>(selector: string): T | null;
}

function createElement(initialClasses: readonly string[] = []): FakeElement {
  const listeners = new Map<string, (event: Event) => void>();
  const element: FakeElement = {
    textContent: "",
    style: {},
    classList: new FakeClassList(initialClasses),
    attributes: new Map(),
    setAttribute(name, value) {
      element.attributes.set(name, value);
    },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
    click() {
      listeners.get("click")?.(new Event("click", { cancelable: true }));
    },
    querySelector() {
      return null;
    },
  };
  return element;
}

function runtimeSnapshot(): NavigationRuntimeSnapshot {
  return {
    routeIdentity: "route-a",
    projectedCoordinate: [-38.917, -13.376],
    segmentIndex: 0,
    offRouteDistance: 2,
    totalDistance: 1000,
    totalDuration: 600,
    completedDistance: 250,
    remainingDistance: 750,
    remainingDuration: 450,
    progress: 0.25,
    progressPercent: 25,
    rawBearing: 90,
    bearing: 90,
    distanceToNextManeuver: 80,
    visualLocation: { latitude: -13.376, longitude: -38.917 },
    visualDeadZoneMeters: 2,
    visualHeldByDeadZone: false,
    visualHeldByBackwardGuard: false,
    visualRouteSnapped: true,
    visualIgnoredStaleUpdate: false,
    guidance: {
      instruction: "Vire à direita",
      original: "Vire à direita",
      formattedDistance: "80 m",
      remainingDistance: "750 m",
      estimatedTime: "8 min",
      progress: 25,
      stepIndex: 1,
      totalSteps: 4,
    },
  };
}

function setup() {
  const banner = createElement(["instruction-banner", "hidden"]);
  const secondary = createElement(["instruction-secondary"]);
  banner.querySelector = <T extends HTMLElement>(selector: string): T | null =>
    selector === ".instruction-secondary"
      ? (secondary as unknown as T)
      : null;

  const ids = [
    "instruction-arrow",
    "instruction-main",
    "instruction-details",
    "instruction-distance",
    "instruction-time",
    "route-progress",
    "progress-text",
    "minimize-navigation-btn",
  ] as const;
  const elements = new Map<string, FakeElement>([
    ["instruction-banner", banner],
    ...ids.map((id) => [id, createElement()] as const),
  ]);
  const bodyClassList = new FakeClassList();
  const windowListeners = new Map<string, () => void>();
  const defaultView = {
    addEventListener(type: string, listener: () => void) {
      windowListeners.set(type, listener);
    },
    removeEventListener(type: string) {
      windowListeners.delete(type);
    },
  } as unknown as Window;
  const document = {
    body: { classList: bodyClassList },
    defaultView,
    getElementById(id: string) {
      return (elements.get(id) ?? null) as unknown as HTMLElement | null;
    },
  } as unknown as Document;
  const presenter = createNavigationGuidancePresenter({ document });

  return {
    presenter,
    banner,
    secondary,
    bodyClassList,
    elements,
    dispatch(type: "navigationStarted" | "navigationEnded") {
      windowListeners.get(type)?.();
    },
  };
}

describe("navigation guidance presenter", () => {
  it("updates the preserved V1 banner fields from the runtime snapshot", () => {
    const context = setup();
    context.presenter.update(runtimeSnapshot());

    expect(context.elements.get("instruction-arrow")?.textContent).toBe("→");
    expect(context.elements.get("instruction-main")?.textContent).toBe(
      "Vire à direita",
    );
    expect(context.elements.get("instruction-details")?.textContent).toBe(
      "Vire à direita por 80 m",
    );
    expect(context.elements.get("instruction-distance")?.textContent).toBe(
      "750 m",
    );
    expect(context.elements.get("instruction-time")?.textContent).toBe(
      "8 min",
    );
    expect(context.elements.get("route-progress")?.style.width).toBe("25%");
    expect(context.elements.get("progress-text")?.textContent).toBe("25%");
  });

  it("shows on navigationStarted and hides on navigationEnded", () => {
    const context = setup();
    expect(context.presenter.isVisible()).toBe(false);

    context.dispatch("navigationStarted");
    expect(context.presenter.isVisible()).toBe(true);
    expect(context.banner.classList.contains("prepared")).toBe(true);
    expect(context.bodyClassList.contains("navigation-active")).toBe(true);

    context.dispatch("navigationEnded");
    expect(context.presenter.isVisible()).toBe(false);
    expect(context.bodyClassList.contains("navigation-active")).toBe(false);
  });

  it("preserves minimize/maximize state and accessibility attributes", () => {
    const context = setup();
    context.dispatch("navigationStarted");
    const button = context.elements.get("minimize-navigation-btn");

    button?.click();
    expect(context.presenter.isMinimized()).toBe(true);
    expect(context.secondary.style.display).toBe("none");
    expect(button?.attributes.get("aria-expanded")).toBe("false");
    expect(button?.attributes.get("aria-label")).toBe(
      "Expandir instruções de navegação",
    );

    button?.click();
    expect(context.presenter.isMinimized()).toBe(false);
    expect(context.secondary.style.display).toBe("block");
    expect(button?.attributes.get("aria-expanded")).toBe("true");
  });

  it("removes listeners and hides banner on destroy", () => {
    const context = setup();
    context.dispatch("navigationStarted");
    context.presenter.destroy();

    expect(context.presenter.isVisible()).toBe(false);
    context.dispatch("navigationStarted");
    expect(context.presenter.isVisible()).toBe(false);
  });

  it("clamps unsafe guidance progress before touching the DOM", () => {
    const context = setup();
    context.presenter.update({
      ...runtimeSnapshot(),
      guidance: { ...runtimeSnapshot().guidance, progress: 140 },
    });

    expect(context.elements.get("route-progress")?.style.width).toBe("100%");
    expect(context.elements.get("progress-text")?.textContent).toBe("100%");
  });
});
