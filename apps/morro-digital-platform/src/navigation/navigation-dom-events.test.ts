import { describe, expect, it, vi } from "vitest";

import { createNavigationDomEventBridge } from "./navigation-dom-events.js";

class FakeCustomEvent<T> {
  readonly type: string;
  readonly detail: T;

  constructor(type: string, init: { detail: T }) {
    this.type = type;
    this.detail = init.detail;
  }
}

function setup() {
  const dispatchEvent = vi.fn(() => true);
  const defaultView = {
    CustomEvent: FakeCustomEvent,
    dispatchEvent,
  } as unknown as Window;
  const document = { defaultView } as unknown as Document;
  return { bridge: createNavigationDomEventBridge(document), dispatchEvent };
}

describe("navigation DOM event bridge", () => {
  it("publishes canonical started and ended events with detail", () => {
    const context = setup();

    context.bridge.started({
      destination: "Farol",
      sessionId: 3,
      timestamp: 100,
    });
    context.bridge.ended({
      reason: "arrived",
      destination: "Farol",
      timestamp: 200,
    });

    expect(context.dispatchEvent).toHaveBeenCalledTimes(2);
    expect(context.dispatchEvent.mock.calls[0]?.[0]).toMatchObject({
      type: "navigationStarted",
      detail: { destination: "Farol", sessionId: 3, timestamp: 100 },
    });
    expect(context.dispatchEvent.mock.calls[1]?.[0]).toMatchObject({
      type: "navigationEnded",
      detail: { reason: "arrived", destination: "Farol", timestamp: 200 },
    });
  });

  it("publishes and retains the latest health snapshot", () => {
    const context = setup();
    const snapshot = context.bridge.status({
      phase: "active",
      hasRoute: true,
      hasInstructions: true,
      hasUserLocation: true,
      isActive: true,
      routeDistance: 800,
      routeDuration: 600,
      routeProgress: 0.25,
      navigationSessionId: 4,
      destination: "Fortaleza",
      timestamp: 300,
    });

    expect(context.bridge.getLastStatus()).toBe(snapshot);
    expect(context.dispatchEvent.mock.calls[0]?.[0]).toMatchObject({
      type: "navigationStatusChanged",
      detail: snapshot,
    });
  });
});
