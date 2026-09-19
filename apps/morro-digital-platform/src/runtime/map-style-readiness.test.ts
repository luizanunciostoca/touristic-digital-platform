import { describe, expect, it, vi } from "vitest";

import {
  createMapStyleReadinessTracker,
  waitForMapStyleReady,
} from "./map-style-readiness.js";

describe("Mapbox style readiness", () => {
  it("returns immediately when the map does not expose style readiness", async () => {
    await expect(waitForMapStyleReady({})).resolves.toBeUndefined();
  });

  it("returns immediately when the style is already loaded", async () => {
    await expect(
      waitForMapStyleReady({ isStyleLoaded: () => true }),
    ).resolves.toBeUndefined();
  });

  it("polls readiness when the initial style has not loaded yet", async () => {
    let clock = 0;
    let polls = 0;
    const map = {
      isStyleLoaded() {
        polls += 1;
        return polls >= 4;
      },
    };

    await expect(
      waitForMapStyleReady(map, {
        timeoutMs: 1_000,
        pollIntervalMs: 50,
        now: () => clock,
        sleep: (milliseconds) => {
          clock += milliseconds;
          return Promise.resolve();
        },
      }),
    ).resolves.toBeUndefined();
    expect(polls).toBe(4);
  });

  it("fails closed instead of hanging when the initial style never becomes ready", async () => {
    let clock = 0;
    await expect(
      waitForMapStyleReady(
        { isStyleLoaded: () => false },
        {
          timeoutMs: 100,
          pollIntervalMs: 25,
          now: () => clock,
          sleep: (milliseconds) => {
            clock += milliseconds;
            return Promise.resolve();
          },
        },
      ),
    ).rejects.toThrow(
      "Mapbox style did not become ready before tour presentation.",
    );
    expect(clock).toBe(100);
  });

  it("waits for load when isStyleLoaded is unavailable", async () => {
    let clock = 0;
    let loadListener: (() => void) | undefined;
    let sleepCount = 0;
    const map = {
      once: vi.fn((event: string, listener: () => void) => {
        if (event === "load") loadListener = listener;
      }),
      setCenter: vi.fn(),
      remove: vi.fn(),
    };
    const tracker = createMapStyleReadinessTracker({
      timeoutMs: 100,
      pollIntervalMs: 25,
      now: () => clock,
      sleep: (milliseconds) => {
        sleepCount += 1;
        clock += milliseconds;
        if (sleepCount === 2) loadListener?.();
        return Promise.resolve();
      },
    });

    tracker.observe(map);
    await expect(tracker.waitUntilReady(map)).resolves.toBeUndefined();
    expect(map.once).toHaveBeenCalledTimes(1);
    expect(clock).toBe(50);
  });

  it("fails closed when load never arrives and isStyleLoaded is unavailable", async () => {
    let clock = 0;
    const map = {
      once: vi.fn(),
      setCenter: vi.fn(),
      remove: vi.fn(),
    };
    const tracker = createMapStyleReadinessTracker({
      timeoutMs: 100,
      pollIntervalMs: 25,
      now: () => clock,
      sleep: (milliseconds) => {
        clock += milliseconds;
        return Promise.resolve();
      },
    });

    tracker.observe(map);
    await expect(tracker.waitUntilReady(map)).rejects.toThrow(
      "Mapbox load event did not arrive before tour presentation.",
    );
    expect(clock).toBe(100);
  });

  it("remembers the first load so later tile loading does not block tour presentation", async () => {
    let loadListener: (() => void) | undefined;
    const sleep = vi.fn(() => Promise.resolve());
    const map = {
      isStyleLoaded: vi.fn(() => false),
      once: vi.fn((event: string, listener: () => void) => {
        if (event === "load") loadListener = listener;
      }),
      setCenter: vi.fn(),
      remove: vi.fn(),
    };
    const tracker = createMapStyleReadinessTracker({ sleep });

    tracker.observe(map);
    expect(map.once).toHaveBeenCalledTimes(1);
    expect(map.once.mock.calls[0]?.[0]).toBe("load");
    expect(typeof map.once.mock.calls[0]?.[1]).toBe("function");
    loadListener?.();

    await expect(tracker.waitUntilReady(map)).resolves.toBeUndefined();
    expect(sleep).not.toHaveBeenCalled();
  });
});
