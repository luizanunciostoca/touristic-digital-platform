import { describe, expect, it } from "vitest";

import { waitForMapStyleReady } from "./map-style-readiness.js";

describe("Mapbox style readiness", () => {
  it("returns immediately when the map does not expose style readiness", async () => {
    await expect(waitForMapStyleReady({})).resolves.toBeUndefined();
  });

  it("returns immediately when the style is already loaded", async () => {
    await expect(
      waitForMapStyleReady({ isStyleLoaded: () => true }),
    ).resolves.toBeUndefined();
  });

  it("polls readiness after the initial Mapbox load event has already passed", async () => {
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
        sleep: async (milliseconds) => {
          clock += milliseconds;
        },
      }),
    ).resolves.toBeUndefined();
    expect(polls).toBe(4);
  });

  it("fails closed instead of hanging when the style never becomes ready", async () => {
    let clock = 0;
    await expect(
      waitForMapStyleReady(
        { isStyleLoaded: () => false },
        {
          timeoutMs: 100,
          pollIntervalMs: 25,
          now: () => clock,
          sleep: async (milliseconds) => {
            clock += milliseconds;
          },
        },
      ),
    ).rejects.toThrow(
      "Mapbox style did not become ready before tour presentation.",
    );
    expect(clock).toBe(100);
  });
});
