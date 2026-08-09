export const ASSISTANT_CONTEXT_VERSION = 2;
export const ASSISTANT_CONTEXT_MAX_HISTORY = 50;
export const ASSISTANT_CONTEXT_SESSION_TTL_MS = 4 * 60 * 60 * 1000;
export const ASSISTANT_CONTEXT_STORAGE_KEY = "assistantContext";
export const ASSISTANT_CONTEXT_SAVE_DELAY_MS = 300;

export interface AssistantHistoryEntry {
  input: string;
  response: string;
  timestamp: number;
}

export interface AssistantGeoPoint {
  lat: number;
  lon: number;
}

export interface AssistantAwaitingState {
  type: string;
  [key: string]: unknown;
}

export interface AssistantContext {
  _version: number;
  lastPlace: string | null;
  lastCategory: string | null;
  lastIntent: string | null;
  lastModifiers: string[];
  lastOptions: unknown[];
  awaiting: AssistantAwaitingState | null;
  fallbackCount: number;
  history: AssistantHistoryEntry[];
  userLocation: AssistantGeoPoint | null;
  pendingRoute: unknown | null;
  selectedDestination: unknown | null;
  locationTracking: boolean;
  hasSharedLocation: boolean;
  lastPlaceHours: unknown | null;
  preferences: Record<string, unknown>;
  sessionStart: number;
}

export interface AssistantContextStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface AssistantContextManagerOptions {
  storage?: AssistantContextStorage;
  now?: () => number;
  saveDelayMs?: number;
}

type ContextListener<K extends keyof AssistantContext> = (
  newValue: AssistantContext[K],
  oldValue: AssistantContext[K],
) => void;

type ListenerRegistry = Map<
  keyof AssistantContext,
  Set<(newValue: unknown, oldValue: unknown) => void>
>;

function cloneValue<T>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

export function createDefaultAssistantContext(
  now: () => number = Date.now,
): AssistantContext {
  return {
    _version: ASSISTANT_CONTEXT_VERSION,
    lastPlace: null,
    lastCategory: null,
    lastIntent: null,
    lastModifiers: [],
    lastOptions: [],
    awaiting: null,
    fallbackCount: 0,
    history: [],
    userLocation: null,
    pendingRoute: null,
    selectedDestination: null,
    locationTracking: false,
    hasSharedLocation: false,
    lastPlaceHours: null,
    preferences: {},
    sessionStart: now(),
  };
}

function stripHistoryHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/?(b|strong|i|em|u|span|p|div|ul|li|ol|h[1-6])[^>]*>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s{2,}/g, " ")
    .trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function migrateAssistantContext(
  saved: Record<string, unknown>,
): Record<string, unknown> {
  const version = typeof saved._version === "number" ? saved._version : 1;
  if (version >= ASSISTANT_CONTEXT_VERSION) return saved;

  return {
    ...saved,
    _version: ASSISTANT_CONTEXT_VERSION,
    lastModifiers: Array.isArray(saved.lastModifiers)
      ? saved.lastModifiers
      : [],
    userLocation: saved.userLocation ?? null,
    pendingRoute: saved.pendingRoute ?? null,
    selectedDestination: saved.selectedDestination ?? null,
    locationTracking: saved.locationTracking ?? false,
    hasSharedLocation: saved.hasSharedLocation ?? false,
    lastPlaceHours: saved.lastPlaceHours ?? null,
  };
}

export function createAssistantContextManager(
  options: AssistantContextManagerOptions = {},
) {
  const storage = options.storage;
  const now = options.now ?? Date.now;
  const saveDelayMs = options.saveDelayMs ?? ASSISTANT_CONTEXT_SAVE_DELAY_MS;
  const listeners: ListenerRegistry = new Map();
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let context = createDefaultAssistantContext(now);

  const scheduleSave = () => {
    if (!storage) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        storage.setItem(ASSISTANT_CONTEXT_STORAGE_KEY, JSON.stringify(context));
      } finally {
        saveTimer = null;
      }
    }, saveDelayMs);
  };

  const load = () => {
    if (!storage) return;

    try {
      const raw = storage.getItem(ASSISTANT_CONTEXT_STORAGE_KEY);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (!isRecord(parsed))
        throw new Error("Invalid assistant context payload");

      const saved = migrateAssistantContext(parsed);
      const sessionStart =
        typeof saved.sessionStart === "number" ? saved.sessionStart : 0;

      if (now() - sessionStart > ASSISTANT_CONTEXT_SESSION_TTL_MS) {
        const preferences = isRecord(saved.preferences)
          ? saved.preferences
          : {};
        context = {
          ...createDefaultAssistantContext(now),
          preferences: cloneValue(preferences),
          lastModifiers: [],
        };
        scheduleSave();
        return;
      }

      context = {
        ...createDefaultAssistantContext(now),
        ...saved,
        _version: ASSISTANT_CONTEXT_VERSION,
      } as AssistantContext;
    } catch {
      context = createDefaultAssistantContext(now);
      try {
        storage.removeItem(ASSISTANT_CONTEXT_STORAGE_KEY);
      } catch {
        // Storage cleanup is best-effort, matching the V1 recovery behavior.
      }
    }
  };

  load();

  const notify = <K extends keyof AssistantContext>(
    field: K,
    newValue: AssistantContext[K],
    oldValue: AssistantContext[K],
  ) => {
    if (oldValue === newValue) return;
    const callbacks = listeners.get(field);
    if (!callbacks) return;
    for (const callback of callbacks) callback(newValue, oldValue);
  };

  return {
    getContext(): AssistantContext {
      return cloneValue(context);
    },

    updateContext(updates: Partial<AssistantContext>): void {
      for (const key of Object.keys(updates) as Array<keyof AssistantContext>) {
        const newValue = updates[key] as AssistantContext[typeof key];
        notify(key, newValue, context[key]);
      }
      context = { ...context, ...updates };
      scheduleSave();
    },

    addToHistory(entry: {
      input?: string;
      response?: string;
      timestamp?: number;
    }): void {
      const nextEntry: AssistantHistoryEntry = {
        input: typeof entry.input === "string" ? entry.input.trim() : "",
        response: stripHistoryHtml(entry.response ?? ""),
        timestamp: entry.timestamp ?? now(),
      };
      context.history = [...context.history, nextEntry].slice(
        -ASSISTANT_CONTEXT_MAX_HISTORY,
      );
      scheduleSave();
    },

    clearContext(): void {
      const preferences = cloneValue(context.preferences);
      context = {
        ...createDefaultAssistantContext(now),
        preferences,
      };
      scheduleSave();
    },

    setPreference(key: string, value: unknown): void {
      context.preferences = { ...context.preferences, [key]: value };
      scheduleSave();
    },

    getPreference(key: string): unknown {
      return cloneValue(context.preferences[key]);
    },

    onContextChange<K extends keyof AssistantContext>(
      field: K,
      callback: ContextListener<K>,
    ): () => void {
      const callbacks = listeners.get(field) ?? new Set();
      const wrapped = callback as (
        newValue: unknown,
        oldValue: unknown,
      ) => void;
      callbacks.add(wrapped);
      listeners.set(field, callbacks);
      return () => callbacks.delete(wrapped);
    },

    flush(): void {
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
      if (storage) {
        storage.setItem(ASSISTANT_CONTEXT_STORAGE_KEY, JSON.stringify(context));
      }
    },
  };
}
