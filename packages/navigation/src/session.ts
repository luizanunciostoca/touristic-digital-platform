export type NavigationSessionMetadata = Readonly<Record<string, unknown>>;

export class NavigationSessionCancelledError extends Error {
  readonly code = "NAVIGATION_SESSION_CANCELLED";
  readonly sessionId: number | null;
  readonly reason: string;

  constructor(sessionId: number | null, reason = "cancelled") {
    super(`Navigation session ${sessionId ?? "unknown"} is no longer active.`);
    this.name = "NavigationSessionCancelledError";
    this.sessionId = sessionId;
    this.reason = normalizeReason(reason);
  }
}

export interface NavigationSession {
  readonly id: number;
  readonly signal: AbortSignal;
  readonly startedAt: number;
  readonly metadata: NavigationSessionMetadata;
  isActive(): boolean;
  assertActive(): true;
  scheduleTimeout(callback: () => void, delayMs?: number): ReturnType<typeof setTimeout> | null;
  scheduleInterval(callback: () => void, delayMs: number): ReturnType<typeof setInterval> | null;
  addCleanup(callback: NavigationCleanup): () => boolean;
  wait(delayMs: number): Promise<boolean>;
  cancel(reason?: string): boolean;
}

export type NavigationCleanup = (reason: string) => void;

type SessionRecord = {
  id: number;
  controller: AbortController;
  startedAt: number;
  metadata: Record<string, unknown>;
  timeouts: Set<ReturnType<typeof setTimeout>>;
  intervals: Set<ReturnType<typeof setInterval>>;
  cleanups: Set<NavigationCleanup>;
  cleaned: boolean;
  reason: string | null;
};

let sequence = 0;
let activeSession: SessionRecord | null = null;

function normalizeReason(reason: unknown): string {
  if (typeof reason !== "string") return "cancelled";
  const normalized = reason.trim().slice(0, 80);
  return normalized || "cancelled";
}

function normalizeDelay(delayMs: unknown, fallback = 0): number {
  const parsed = Number(delayMs);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(parsed, 24 * 60 * 60 * 1000));
}

function cleanupRecord(record: SessionRecord | null, reason: string): boolean {
  if (!record || record.cleaned) return false;

  record.cleaned = true;
  record.reason = normalizeReason(reason);

  if (!record.controller.signal.aborted) {
    try {
      record.controller.abort(new NavigationSessionCancelledError(record.id, record.reason));
    } catch {
      record.controller.abort();
    }
  }

  for (const timeoutId of record.timeouts) clearTimeout(timeoutId);
  for (const intervalId of record.intervals) clearInterval(intervalId);
  record.timeouts.clear();
  record.intervals.clear();

  for (const cleanup of [...record.cleanups].reverse()) {
    try {
      cleanup(record.reason);
    } catch {
      // Cleanup is best-effort. A failing consumer cannot prevent remaining cleanup.
    }
  }
  record.cleanups.clear();

  return true;
}

function createPublicSession(record: SessionRecord): NavigationSession {
  return Object.freeze({
    id: record.id,
    signal: record.controller.signal,
    startedAt: record.startedAt,
    metadata: Object.freeze({ ...record.metadata }),
    isActive: () => isNavigationSessionActive(record.id),
    assertActive: () => assertNavigationSessionActive(record.id),
    scheduleTimeout: (callback: () => void, delayMs = 0) =>
      scheduleNavigationTimeout(record.id, callback, delayMs),
    scheduleInterval: (callback: () => void, delayMs: number) =>
      scheduleNavigationInterval(record.id, callback, delayMs),
    addCleanup: (callback: NavigationCleanup) =>
      registerNavigationCleanup(record.id, callback),
    wait: (delayMs: number) => waitForNavigationSession(record.id, delayMs),
    cancel: (reason = "cancelled") => cancelNavigationSession(record.id, reason),
  });
}

export function beginNavigationSession(
  metadata: Record<string, unknown> = {},
): NavigationSession {
  if (activeSession) cleanupRecord(activeSession, "superseded");

  const record: SessionRecord = {
    id: ++sequence,
    controller: new AbortController(),
    startedAt: Date.now(),
    metadata: { ...metadata },
    timeouts: new Set(),
    intervals: new Set(),
    cleanups: new Set(),
    cleaned: false,
    reason: null,
  };

  activeSession = record;
  return createPublicSession(record);
}

export function getActiveNavigationSession(): NavigationSession | null {
  return activeSession ? createPublicSession(activeSession) : null;
}

export function getActiveNavigationSessionId(): number | null {
  return activeSession?.id ?? null;
}

export function isNavigationSessionActive(sessionId: number): boolean {
  return Boolean(
    activeSession &&
      !activeSession.cleaned &&
      !activeSession.controller.signal.aborted &&
      activeSession.id === sessionId,
  );
}

export function assertNavigationSessionActive(sessionId: number): true {
  if (!isNavigationSessionActive(sessionId)) {
    throw new NavigationSessionCancelledError(
      sessionId,
      activeSession?.reason ?? "stale",
    );
  }
  return true;
}

export function cancelNavigationSession(
  sessionId: number | null = null,
  reason = "cancelled",
): boolean {
  if (!activeSession) return false;
  if (sessionId !== null && activeSession.id !== sessionId) return false;

  const record = activeSession;
  const cleaned = cleanupRecord(record, reason);
  if (activeSession === record) activeSession = null;
  return cleaned;
}

export function registerNavigationCleanup(
  sessionId: number,
  callback: NavigationCleanup,
): () => boolean {
  if (typeof callback !== "function") return () => false;

  const record = activeSession;
  if (!record || record.id !== sessionId || record.cleaned) {
    callback("stale");
    return () => false;
  }

  record.cleanups.add(callback);
  return () => record.cleanups.delete(callback);
}

export function scheduleNavigationTimeout(
  sessionId: number,
  callback: () => void,
  delayMs = 0,
): ReturnType<typeof setTimeout> | null {
  if (typeof callback !== "function" || !isNavigationSessionActive(sessionId)) {
    return null;
  }

  const record = activeSession;
  if (!record) return null;

  const timeoutId = setTimeout(() => {
    record.timeouts.delete(timeoutId);
    if (!isNavigationSessionActive(sessionId)) return;
    callback();
  }, normalizeDelay(delayMs));

  record.timeouts.add(timeoutId);
  return timeoutId;
}

export function scheduleNavigationInterval(
  sessionId: number,
  callback: () => void,
  delayMs: number,
): ReturnType<typeof setInterval> | null {
  if (typeof callback !== "function" || !isNavigationSessionActive(sessionId)) {
    return null;
  }

  const record = activeSession;
  if (!record) return null;

  const intervalId = setInterval(() => {
    if (!isNavigationSessionActive(sessionId)) return;
    callback();
  }, Math.max(50, normalizeDelay(delayMs, 1000)));

  record.intervals.add(intervalId);
  return intervalId;
}

export function waitForNavigationSession(
  sessionId: number,
  delayMs: number,
): Promise<boolean> {
  if (!isNavigationSessionActive(sessionId)) return Promise.resolve(false);

  const record = activeSession;
  if (!record) return Promise.resolve(false);

  return new Promise((resolve) => {
    let settled = false;

    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      record.controller.signal.removeEventListener("abort", onAbort);
      resolve(value);
    };

    const onAbort = () => finish(false);
    record.controller.signal.addEventListener("abort", onAbort, { once: true });

    const timeoutId = setTimeout(() => {
      record.timeouts.delete(timeoutId);
      finish(isNavigationSessionActive(sessionId));
    }, normalizeDelay(delayMs));

    record.timeouts.add(timeoutId);
  });
}

export function addNavigationEventListener(
  sessionId: number,
  target: EventTarget,
  type: string,
  listener: EventListenerOrEventListenerObject,
  options?: boolean | AddEventListenerOptions,
): () => boolean {
  if (!isNavigationSessionActive(sessionId)) return () => false;

  target.addEventListener(type, listener, options);
  return registerNavigationCleanup(sessionId, () => {
    target.removeEventListener(type, listener, options);
  });
}

export function resetNavigationSessionManagerForTests(): void {
  cancelNavigationSession(null, "test_reset");
  sequence = 0;
}
