import { afterEach, describe, expect, it, vi } from "vitest";

import {
  beginNavigationSession,
  resetNavigationSessionManagerForTests,
} from "./session.js";
import {
  calculateArrivalDistanceMeters,
  createArrivalLifecycle,
} from "./arrival.js";

afterEach(() => {
  vi.useRealTimers();
  resetNavigationSessionManagerForTests();
});

describe("arrival lifecycle", () => {
  it("preserves V1 approach and arrival thresholds with idempotent notifications", () => {
    const session = beginNavigationSession();
    const onApproaching = vi.fn();
    const onArrived = vi.fn();
    const lifecycle = createArrivalLifecycle({
      sessionId: session.id,
      destination: { latitude: -13.38, longitude: -38.91 },
      ports: { onApproaching, onArrived },
    });

    const far = lifecycle.update({ latitude: -13.3812, longitude: -38.91 });
    expect(far.approaching).toBe(false);
    expect(far.arrived).toBe(false);

    const near = lifecycle.update({ latitude: -13.3807, longitude: -38.91 });
    expect(near.approaching).toBe(true);
    expect(near.arrived).toBe(false);
    expect(near.notifiedApproach).toBe(true);

    const arrived = lifecycle.update({ latitude: -13.3802, longitude: -38.91 });
    expect(arrived.arrived).toBe(true);
    expect(arrived.notifiedArrival).toBe(true);

    lifecycle.update({ latitude: -13.3801, longitude: -38.91 });
    expect(onApproaching).toHaveBeenCalledTimes(1);
    expect(onArrived).toHaveBeenCalledTimes(1);
    expect(lifecycle.isApproachNotified()).toBe(true);
    expect(lifecycle.isArrivalNotified()).toBe(true);
  });

  it("auto-ends after five seconds only while the originating session remains active", async () => {
    vi.useFakeTimers();
    const session = beginNavigationSession();
    const onAutoEnd = vi.fn();
    const lifecycle = createArrivalLifecycle({
      sessionId: session.id,
      destination: { latitude: -13.38, longitude: -38.91 },
      ports: { onAutoEnd },
    });

    lifecycle.update({ latitude: -13.38, longitude: -38.91 });
    await vi.advanceTimersByTimeAsync(4_999);
    expect(onAutoEnd).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(onAutoEnd).toHaveBeenCalledTimes(1);
  });

  it("does not auto-end a stale session after supersession", async () => {
    vi.useFakeTimers();
    const first = beginNavigationSession();
    const onAutoEnd = vi.fn();
    const lifecycle = createArrivalLifecycle({
      sessionId: first.id,
      destination: { latitude: -13.38, longitude: -38.91 },
      ports: { onAutoEnd },
    });

    lifecycle.update({ latitude: -13.38, longitude: -38.91 });
    beginNavigationSession();
    await vi.advanceTimersByTimeAsync(5_000);

    expect(onAutoEnd).not.toHaveBeenCalled();
  });

  it("ignores updates from a cancelled session", () => {
    const session = beginNavigationSession();
    const onApproaching = vi.fn();
    const onArrived = vi.fn();
    const lifecycle = createArrivalLifecycle({
      sessionId: session.id,
      destination: { latitude: -13.38, longitude: -38.91 },
      ports: { onApproaching, onArrived },
    });

    session.cancel("manual");
    const result = lifecycle.update({ latitude: -13.38, longitude: -38.91 });

    expect(result.arrived).toBe(false);
    expect(result.distanceMeters).toBe(Number.POSITIVE_INFINITY);
    expect(onApproaching).not.toHaveBeenCalled();
    expect(onArrived).not.toHaveBeenCalled();
  });

  it("keeps the distance calculation compatible with smartphone-scale thresholds", () => {
    const destination = { latitude: -13.38, longitude: -38.91 };
    const approximately22m = { latitude: -13.3798, longitude: -38.91 };
    const approximately111m = { latitude: -13.379, longitude: -38.91 };

    expect(
      calculateArrivalDistanceMeters(approximately22m, destination),
    ).toBeLessThan(30);
    expect(
      calculateArrivalDistanceMeters(approximately111m, destination),
    ).toBeGreaterThan(100);
  });
});
