import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ASSISTANT_CONTEXT_MAX_HISTORY,
  ASSISTANT_CONTEXT_SESSION_TTL_MS,
  ASSISTANT_CONTEXT_STORAGE_KEY,
  createAssistantContextManager,
} from "./context-manager.js";

function createMemoryStorage(seed?: string) {
  const values = new Map<string, string>();
  if (seed !== undefined) values.set(ASSISTANT_CONTEXT_STORAGE_KEY, seed);

  return {
    values,
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      values.delete(key);
    }),
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("assistant V1 context manager", () => {
  it("returns deep copies so callers cannot mutate internal context", () => {
    const manager = createAssistantContextManager();
    manager.setPreference("favorites", ["Forte"]);

    const snapshot = manager.getContext();
    (snapshot.preferences.favorites as string[]).push("Farol");

    expect(manager.getPreference("favorites")).toEqual(["Forte"]);
  });

  it("debounces persistence and stores the latest context", async () => {
    vi.useFakeTimers();
    const storage = createMemoryStorage();
    const manager = createAssistantContextManager({ storage });

    manager.updateContext({ lastPlace: "Forte" });
    manager.updateContext({ lastCategory: "attractions" });
    expect(storage.setItem).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(299);
    expect(storage.setItem).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(
      JSON.parse(storage.values.get(ASSISTANT_CONTEXT_STORAGE_KEY) ?? "{}"),
    ).toMatchObject({
      lastPlace: "Forte",
      lastCategory: "attractions",
    });
  });

  it("migrates legacy schema fields to V2", () => {
    const storage = createMemoryStorage(
      JSON.stringify({
        _version: 1,
        sessionStart: 10_000,
        preferences: { language: "pt" },
      }),
    );
    const manager = createAssistantContextManager({
      storage,
      now: () => 10_100,
    });

    expect(manager.getContext()).toMatchObject({
      _version: 2,
      lastModifiers: [],
      userLocation: null,
      pendingRoute: null,
      selectedDestination: null,
      locationTracking: false,
      hasSharedLocation: false,
      lastPlaceHours: null,
      preferences: { language: "pt" },
    });
  });

  it("expires volatile session state after four hours while preserving preferences", () => {
    vi.useFakeTimers();
    const storage = createMemoryStorage(
      JSON.stringify({
        _version: 2,
        sessionStart: 100,
        lastPlace: "Forte",
        lastModifiers: ["cheap"],
        preferences: { language: "es", favorites: ["Farol"] },
      }),
    );

    const manager = createAssistantContextManager({
      storage,
      now: () => 100 + ASSISTANT_CONTEXT_SESSION_TTL_MS + 1,
    });

    expect(manager.getContext()).toMatchObject({
      lastPlace: null,
      lastModifiers: [],
      preferences: { language: "es", favorites: ["Farol"] },
    });
  });

  it("recovers safely from corrupt persisted JSON", () => {
    const storage = createMemoryStorage("{corrupt");
    const manager = createAssistantContextManager({ storage, now: () => 123 });

    expect(manager.getContext()).toMatchObject({
      lastPlace: null,
      sessionStart: 123,
    });
    expect(storage.removeItem).toHaveBeenCalledWith(
      ASSISTANT_CONTEXT_STORAGE_KEY,
    );
  });

  it("sanitizes history and caps it at the V1 maximum", () => {
    const manager = createAssistantContextManager({ now: () => 500 });

    for (let index = 0; index < ASSISTANT_CONTEXT_MAX_HISTORY + 3; index += 1) {
      manager.addToHistory({
        input: ` input ${index} `,
        response: `<b>Resposta</b><br>${index} &amp; ok`,
        timestamp: index,
      });
    }

    const history = manager.getContext().history;
    expect(history).toHaveLength(ASSISTANT_CONTEXT_MAX_HISTORY);
    expect(history[0]?.input).toBe("input 3");
    expect(history.at(-1)?.response).toBe(
      `Resposta ${ASSISTANT_CONTEXT_MAX_HISTORY + 2} & ok`,
    );
  });

  it("preserves preferences when clearing volatile conversation context", () => {
    const manager = createAssistantContextManager({ now: () => 1_000 });
    manager.setPreference("language", "he");
    manager.updateContext({ lastPlace: "Farol", fallbackCount: 3 });

    manager.clearContext();

    expect(manager.getContext()).toMatchObject({
      lastPlace: null,
      fallbackCount: 0,
      preferences: { language: "he" },
      sessionStart: 1_000,
    });
  });

  it("publishes field changes and supports unsubscribe", () => {
    const manager = createAssistantContextManager();
    const listener = vi.fn();
    const unsubscribe = manager.onContextChange("lastPlace", listener);

    manager.updateContext({ lastPlace: "Gamboa" });
    expect(listener).toHaveBeenCalledWith("Gamboa", null);

    unsubscribe();
    manager.updateContext({ lastPlace: "Garapuá" });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
