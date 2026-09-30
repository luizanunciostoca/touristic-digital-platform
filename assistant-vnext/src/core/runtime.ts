import { createHash, randomUUID } from "node:crypto";

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = Object.freeze({ now: () => new Date() });

export interface IdGenerator {
  next(prefix: string): string;
}

export const uuidGenerator: IdGenerator = Object.freeze({
  next(prefix: string): string {
    return prefix + "_" + randomUUID();
  },
});

export function sha256Json(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, sortValue(item)]);
    return Object.fromEntries(entries);
  }
  return value;
}

export function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value as Record<string, unknown>)) deepFreeze(item);
  }
  return value as Readonly<T>;
}

export function composeAbortSignal(
  parent: AbortSignal,
  timeoutMs: number,
): Readonly<{ signal: AbortSignal; dispose: () => void }> {
  const controller = new AbortController();
  const abort = () => controller.abort(parent.reason ?? new Error("cancelled"));
  if (parent.aborted) abort();
  else parent.addEventListener("abort", abort, { once: true });

  const timer = setTimeout(() => controller.abort(new Error("timeout")), timeoutMs);
  return Object.freeze({
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer);
      parent.removeEventListener("abort", abort);
    },
  });
}

export function assertNever(value: never): never {
  throw new Error("Unexpected value: " + String(value));
}
