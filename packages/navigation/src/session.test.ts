import { afterEach, describe, expect, it, vi } from "vitest";
import {
  NavigationSessionCancelledError,
  addNavigationEventListener,
  assertNavigationSessionActive,
  beginNavigationSession,
  cancelNavigationSession,
  getActiveNavigationSessionId,
  isNavigationSessionActive,
  resetNavigationSessionManagerForTests,
  waitForNavigationSession,
} from "./session.js";

afterEach(() => {
  vi.useRealTimers();
  resetNavigationSessionManagerForTests();
});

describe("navigation session manager", () => {
  it("creates a monotonic active session with immutable metadata", () => {
    const first = beginNavigationSession({ destination: "Farol" });
    expect(first.id).toBe(1);
    expect(first.isActive()).toBe(true);
    expect(first.metadata.destination).toBe("Farol");
    expect(Object.isFrozen(first.metadata)).toBe(true);
    expect(Object.isFrozen(first)).toBe(true);
    expect(getActiveNavigationSessionId()).toBe(1);

    first.cancel("done");
    const second = beginNavigationSession();
    expect(second.id).toBe(2);
  });

  it("supersedes the previous session and aborts its signal", () => {
    const first = beginNavigationSession();
    const firstSignal = first.signal;
    const second = beginNavigationSession();

    expect(firstSignal.aborted).toBe(true);
    expect(first.isActive()).toBe(false);
    expect(second.isActive()).toBe(true);
    expect(getActiveNavigationSessionId()).toBe(second.id);
  });

  it("prevents stale timeouts from executing after supersession", () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    const first = beginNavigationSession();
    first.scheduleTimeout(callback, 100);

    beginNavigationSession();
    vi.advanceTimersByTime(150);

    expect(callback).not.toHaveBeenCalled();
  });

  it("stops intervals and runs cleanups in reverse registration order", () => {
    vi.useFakeTimers();
    const tick = vi.fn();
    const cleanupOrder: string[] = [];
    const session = beginNavigationSession();

    session.scheduleInterval(tick, 50);
    session.addCleanup(() => cleanupOrder.push("first"));
    session.addCleanup(() => cleanupOrder.push("second"));

    vi.advanceTimersByTime(120);
    expect(tick).toHaveBeenCalledTimes(2);

    session.cancel("manual");
    vi.advanceTimersByTime(200);

    expect(tick).toHaveBeenCalledTimes(2);
    expect(cleanupOrder).toEqual(["second", "first"]);
  });

  it("removes session-owned event listeners during cleanup", () => {
    const target = new EventTarget();
    const listener = vi.fn();
    const session = beginNavigationSession();

    addNavigationEventListener(session.id, target, "update", listener);
    target.dispatchEvent(new Event("update"));
    expect(listener).toHaveBeenCalledTimes(1);

    session.cancel();
    target.dispatchEvent(new Event("update"));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("resolves wait false when the session is cancelled and true when it survives", async () => {
    vi.useFakeTimers();
    const cancelled = beginNavigationSession();
    const cancelledWait = waitForNavigationSession(cancelled.id, 100);
    cancelled.cancel();
    await expect(cancelledWait).resolves.toBe(false);

    const active = beginNavigationSession();
    const activeWait = waitForNavigationSession(active.id, 100);
    await vi.advanceTimersByTimeAsync(100);
    await expect(activeWait).resolves.toBe(true);
  });

  it("rejects stale assertions with a normalized cancellation error", () => {
    const session = beginNavigationSession();
    cancelNavigationSession(session.id, "superseded-by-test");

    expect(isNavigationSessionActive(session.id)).toBe(false);
    expect(() => assertNavigationSessionActive(session.id)).toThrow(
      NavigationSessionCancelledError,
    );

    try {
      assertNavigationSessionActive(session.id);
    } catch (error) {
      expect(error).toBeInstanceOf(NavigationSessionCancelledError);
      expect((error as NavigationSessionCancelledError).code).toBe(
        "NAVIGATION_SESSION_CANCELLED",
      );
    }
  });

  it("does not cancel a newer session when a stale id asks for cancellation", () => {
    const first = beginNavigationSession();
    const second = beginNavigationSession();

    expect(cancelNavigationSession(first.id)).toBe(false);
    expect(second.isActive()).toBe(true);
  });
});
