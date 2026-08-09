import { describe, expect, it, vi } from "vitest";

import type { NavigationDomLifecycle } from "./navigation-dom-lifecycle.js";
import {
  createNavigationRequestPort,
  NAVIGATION_REQUEST_EVENT,
} from "./navigation-request-port.js";

function createLifecycle(): NavigationDomLifecycle {
  return {
    start: vi.fn(async () => ({ type: "FeatureCollection", features: [] })),
    stop: vi.fn(),
    destroy: vi.fn(),
    isActive: vi.fn(() => false),
  };
}

function createTestDocument(): Document {
  return new EventTarget() as unknown as Document;
}

describe("navigation request port", () => {
  it("forwards a valid navigation request to the lifecycle", async () => {
    const document = createTestDocument();
    const lifecycle = createLifecycle();
    const port = createNavigationRequestPort({ document, lifecycle });

    document.dispatchEvent(
      new CustomEvent(NAVIGATION_REQUEST_EVENT, {
        detail: {
          destination: { longitude: -38.9146, latitude: -13.3769 },
        },
      }),
    );
    await Promise.resolve();

    expect(lifecycle.start).toHaveBeenCalledWith({
      longitude: -38.9146,
      latitude: -13.3769,
    });
    port.destroy();
  });

  it("ignores malformed or out-of-range destinations", async () => {
    const document = createTestDocument();
    const lifecycle = createLifecycle();
    const port = createNavigationRequestPort({ document, lifecycle });

    for (const destination of [
      undefined,
      { longitude: "-38.9", latitude: -13.3 },
      { longitude: 181, latitude: -13.3 },
      { longitude: -38.9, latitude: -91 },
    ]) {
      document.dispatchEvent(
        new CustomEvent(NAVIGATION_REQUEST_EVENT, {
          detail: { destination },
        }),
      );
    }
    await Promise.resolve();

    expect(lifecycle.start).not.toHaveBeenCalled();
    port.destroy();
  });

  it("reports lifecycle start errors without creating an unhandled rejection", async () => {
    const document = createTestDocument();
    const error = new Error("ROUTING_FAILED");
    const lifecycle = createLifecycle();
    vi.mocked(lifecycle.start).mockRejectedValue(error);
    const onError = vi.fn();
    const port = createNavigationRequestPort({ document, lifecycle, onError });

    document.dispatchEvent(
      new CustomEvent(NAVIGATION_REQUEST_EVENT, {
        detail: {
          destination: { longitude: -38.9146, latitude: -13.3769 },
        },
      }),
    );
    await Promise.resolve();
    await Promise.resolve();

    expect(onError).toHaveBeenCalledWith(error);
    port.destroy();
  });

  it("removes the request listener exactly once on destroy", async () => {
    const document = createTestDocument();
    const lifecycle = createLifecycle();
    const port = createNavigationRequestPort({ document, lifecycle });

    port.destroy();
    port.destroy();
    document.dispatchEvent(
      new CustomEvent(NAVIGATION_REQUEST_EVENT, {
        detail: {
          destination: { longitude: -38.9146, latitude: -13.3769 },
        },
      }),
    );
    await Promise.resolve();

    expect(lifecycle.start).not.toHaveBeenCalled();
  });
});
