import { afterEach, describe, expect, it, vi } from "vitest";

import {
  NavigationSessionCancelledError,
  assertNavigationSessionActive,
  beginNavigationSession,
  cancelNavigationSession,
  getActiveNavigationSessionId,
  isNavigationSessionActive,
  resetNavigationSessionManagerForTests,
} from "./session.js";
import {
  V1_NAVIGATION_BASELINE_PROVENANCE,
  V1_SESSION_FIXTURES,
} from "./v1-baseline-fixtures.js";

afterEach(() => {
  vi.useRealTimers();
  resetNavigationSessionManagerForTests();
});

describe("V1 navigation session baseline parity", () => {
  it("pins the V1 navigationSessionManager source and behavior test provenance", () => {
    expect(V1_NAVIGATION_BASELINE_PROVENANCE.commit).toBe(
      "60746fd7fed97b805758b37adfdbe3bad2582bfe",
    );
    expect(V1_NAVIGATION_BASELINE_PROVENANCE.sessionSource.blobSha).toBe(
      "1d769afad37efb349f629fceac0a483ca92fae45",
    );
    expect(V1_NAVIGATION_BASELINE_PROVENANCE.sessionManagerTest.blobSha).toBe(
      "2fc8fcca0475c4066804af11440e7e08ddfbd48d",
    );
  });

  it("supersedes and aborts the previous session", () => {
    const first = beginNavigationSession({
      destination: V1_SESSION_FIXTURES.firstDestination,
    });
    const second = beginNavigationSession({
      destination: V1_SESSION_FIXTURES.secondDestination,
    });

    expect(first.signal.aborted).toBe(true);
    expect(first.isActive()).toBe(false);
    expect(second.isActive()).toBe(true);
    expect(second.id).toBeGreaterThan(first.id);
    expect(getActiveNavigationSessionId()).toBe(second.id);
  });

  it("prevents stale session timeouts from executing after supersession", () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    const first = beginNavigationSession();

    first.scheduleTimeout(callback, V1_SESSION_FIXTURES.staleTimeoutMs);
    beginNavigationSession();
    vi.advanceTimersByTime(V1_SESSION_FIXTURES.staleTimeoutAdvanceMs);

    expect(callback).not.toHaveBeenCalled();
  });

  it("stops intervals and runs cleanup when a session is cancelled", () => {
    vi.useFakeTimers();
    const intervalCallback = vi.fn();
    const cleanup = vi.fn();
    const session = beginNavigationSession();

    session.scheduleInterval(intervalCallback, V1_SESSION_FIXTURES.intervalMs);
    session.addCleanup(cleanup);
    vi.advanceTimersByTime(V1_SESSION_FIXTURES.intervalWarmupMs);
    expect(intervalCallback).toHaveBeenCalledTimes(2);

    expect(
      cancelNavigationSession(session.id, V1_SESSION_FIXTURES.cancelReason),
    ).toBe(true);
    vi.advanceTimersByTime(V1_SESSION_FIXTURES.intervalAfterCancelMs);

    expect(intervalCallback).toHaveBeenCalledTimes(2);
    expect(cleanup).toHaveBeenCalledWith(V1_SESSION_FIXTURES.cancelReason);
  });

  it("resolves session wait false after supersession", async () => {
    vi.useFakeTimers();
    const session = beginNavigationSession();
    const pending = session.wait(V1_SESSION_FIXTURES.waitMs);

    beginNavigationSession();

    await expect(pending).resolves.toBe(false);
  });

  it("throws the normalized typed cancellation error for stale work", () => {
    const session = beginNavigationSession();
    beginNavigationSession();

    expect(() => assertNavigationSessionActive(session.id)).toThrow(
      NavigationSessionCancelledError,
    );
    expect(isNavigationSessionActive(session.id)).toBe(false);

    try {
      assertNavigationSessionActive(session.id);
      throw new Error("Expected stale session assertion to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(NavigationSessionCancelledError);
      if (!(error instanceof NavigationSessionCancelledError)) throw error;
      expect(error.code).toBe("NAVIGATION_SESSION_CANCELLED");
    }
  });
});
