import { describe, expect, it, vi } from "vitest";

import type { RouteFeatureCollection } from "@touristic/navigation";

import type { NavigationDomEventBridge } from "./navigation-dom-events.js";
import type { NavigationSessionBootstrap } from "./navigation-session-bootstrap.js";
import { createNavigationDomLifecycle } from "./navigation-dom-lifecycle.js";

function routeData(): RouteFeatureCollection {
  return {
    type: "FeatureCollection",
    features: [
      {
        geometry: {
          type: "LineString",
          coordinates: [
            [-38.917, -13.376],
            [-38.916, -13.375],
          ],
        },
      },
    ],
  };
}

function setup(eventBridge?: NavigationDomEventBridge) {
  const classes = new Set<string>();
  const style: Record<string, string> = {};
  const listeners = new Map<string, (event: Event) => void>();
  const dispatched: string[] = [];
  const endButton = {
    style,
    addEventListener(
      type: string,
      listener: EventListenerOrEventListenerObject,
    ) {
      if (typeof listener === "function") listeners.set(type, listener);
    },
    removeEventListener(type: string) {
      listeners.delete(type);
    },
  } as unknown as HTMLElement;
  const document = {
    body: {
      classList: {
        add(value: string) {
          classes.add(value);
        },
        remove(value: string) {
          classes.delete(value);
        },
        contains(value: string) {
          return classes.has(value);
        },
      },
    },
    getElementById(id: string) {
      return id === "end-navigation-btn" ? endButton : null;
    },
    defaultView: {
      dispatchEvent(event: Event) {
        dispatched.push(event.type);
        return true;
      },
    },
  } as unknown as Document;

  const bootstrapStart = vi.fn(async () => routeData());
  const bootstrapStop = vi.fn<() => void>();
  const bootstrap: NavigationSessionBootstrap = {
    start: bootstrapStart,
    stop: bootstrapStop,
    isActive: () => false,
    getActiveSessionId: () => 7,
  };
  const lifecycle = createNavigationDomLifecycle({
    document,
    bootstrap,
    ...(eventBridge ? { eventBridge } : {}),
  });

  return {
    lifecycle,
    document,
    classes,
    style,
    dispatched,
    bootstrapStart,
    bootstrapStop,
    clickEnd() {
      listeners.get("click")?.(new Event("click", { cancelable: true }));
    },
    hasEndListener() {
      return listeners.has("click");
    },
  };
}

describe("navigation DOM lifecycle", () => {
  it("applies the V1 active state and emits navigationStarted", async () => {
    const context = setup();
    await context.lifecycle.start({ longitude: -38.916, latitude: -13.375 });

    expect(context.classes.has("navigation-active")).toBe(true);
    expect(context.style.display).toBe("block");
    expect(context.style.opacity).toBe("1");
    expect(context.style.pointerEvents).toBe("auto");
    expect(context.dispatched).toContain("navigationStarted");
    expect(context.lifecycle.isActive()).toBe(true);
  });

  it("ends navigation from the preserved end-navigation button", async () => {
    const context = setup();
    await context.lifecycle.start({ longitude: -38.916, latitude: -13.375 });
    context.bootstrapStop.mockClear();

    context.clickEnd();

    expect(context.bootstrapStop).toHaveBeenCalledTimes(1);
    expect(context.classes.has("navigation-active")).toBe(false);
    expect(context.style.display).toBe("none");
    expect(context.style.opacity).toBe("0");
    expect(context.style.pointerEvents).toBe("none");
    expect(context.dispatched).toContain("navigationEnded");
    expect(context.lifecycle.isActive()).toBe(false);
  });

  it("publishes canonical cancelled and arrived reasons through the bridge", async () => {
    const started = vi.fn<NavigationDomEventBridge["started"]>();
    const status = vi.fn<NavigationDomEventBridge["status"]>((input) => ({
      phase: input.phase ?? "idle",
      hasRoute: input.hasRoute === true,
      hasInstructions: input.hasInstructions === true,
      hasUserLocation: input.hasUserLocation === true,
      isActive: input.isActive === true,
      isPaused: input.isPaused === true,
      currentStepIndex: input.currentStepIndex ?? 0,
      totalSteps: input.totalSteps ?? 0,
      routeDistance: input.routeDistance ?? 0,
      routeDuration: input.routeDuration ?? 0,
      routeProgress: input.routeProgress ?? 0,
      navigationSessionId: input.navigationSessionId ?? null,
      recalculations: input.recalculations ?? 0,
      destination: input.destination ?? "",
      timestamp: input.timestamp ?? 0,
    }));
    const ended = vi.fn<NavigationDomEventBridge["ended"]>();
    const bridge: NavigationDomEventBridge = {
      started,
      status,
      location: vi.fn(),
      runtime: vi.fn(),
      ended,
      getLastStatus: () => null,
    };
    const context = setup(bridge);

    await context.lifecycle.start({ longitude: -38.916, latitude: -13.375 });
    context.clickEnd();
    expect(started).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 7 }),
    );
    expect(ended).toHaveBeenLastCalledWith(
      expect.objectContaining({ reason: "cancelled" }),
    );

    await context.lifecycle.start({ longitude: -38.916, latitude: -13.375 });
    context.lifecycle.stop("arrived");
    expect(ended).toHaveBeenLastCalledWith(
      expect.objectContaining({ reason: "arrived" }),
    );
    expect(status).toHaveBeenLastCalledWith(
      expect.objectContaining({ phase: "arrived", isActive: false }),
    );
  });

  it("keeps V1 navigation UI hidden when bootstrap fails", async () => {
    const context = setup();
    context.bootstrapStart.mockRejectedValueOnce(new Error("route failed"));

    await expect(
      context.lifecycle.start({ longitude: -38.916, latitude: -13.375 }),
    ).rejects.toThrow("route failed");

    expect(context.classes.has("navigation-active")).toBe(false);
    expect(context.style.display).toBe("none");
    expect(context.dispatched).not.toContain("navigationStarted");
  });

  it("prevents a stale bootstrap from activating UI after stop", async () => {
    const context = setup();
    let resolveStart: (route: RouteFeatureCollection) => void = () => {
      throw new Error("Navigation start resolver was not initialized.");
    };
    context.bootstrapStart.mockImplementationOnce(
      () =>
        new Promise<RouteFeatureCollection>((resolve) => {
          resolveStart = resolve;
        }),
    );

    const pending = context.lifecycle.start({
      longitude: -38.916,
      latitude: -13.375,
    });
    context.lifecycle.stop();
    resolveStart(routeData());

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(context.classes.has("navigation-active")).toBe(false);
    expect(context.dispatched).not.toContain("navigationStarted");
  });

  it("removes the end button listener and tears down on destroy", async () => {
    const context = setup();
    expect(context.hasEndListener()).toBe(true);
    await context.lifecycle.start({ longitude: -38.916, latitude: -13.375 });

    context.lifecycle.destroy();

    expect(context.hasEndListener()).toBe(false);
    expect(context.bootstrapStop).toHaveBeenCalled();
    expect(context.lifecycle.isActive()).toBe(false);
  });
});
