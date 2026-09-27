function booleanFlag(value, fallback = false) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!normalized) return fallback;
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  throw new Error("NOTIFICATIONS_FEATURE_ENABLED_INVALID");
}

function boundedInteger(value, fallback, min, max) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return fallback;
  if (!/^\d+$/u.test(normalized)) return fallback;
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

async function defaultLoadRuntime() {
  const [domain, events, server] = await Promise.all([
    import("@touristic/notifications"),
    import("@touristic/notifications/event-integration"),
    import("@touristic/notifications-server"),
  ]);
  return Object.freeze({ domain, events, server });
}

export function createNotificationsRuntime({
  getEnvironmentValue = (key) => process.env[key] ?? "",
  platformOperations = null,
  loadRuntime = defaultLoadRuntime,
} = {}) {
  const enabled = booleanFlag(
    getEnvironmentValue("NOTIFICATIONS_FEATURE_ENABLED"),
    false,
  );
  const databaseUrl = String(
    getEnvironmentValue("NOTIFICATIONS_DATABASE_URL") ?? "",
  ).trim();
  const schedulerIntervalMs = boundedInteger(
    getEnvironmentValue("NOTIFICATIONS_SCHEDULER_INTERVAL_MS"),
    5_000,
    1_000,
    300_000,
  );
  const batchSize = boundedInteger(
    getEnvironmentValue("NOTIFICATIONS_SCHEDULER_BATCH_SIZE"),
    25,
    1,
    100,
  );

  let started = false;
  let ready = false;
  let pool = null;
  let repository = null;
  let preferences = null;
  let schedulerHost = null;
  let eventFactory = null;

  function emit(name, severity = "info", attributes = {}) {
    platformOperations?.emit?.({
      kind: severity === "error" ? "alert" : "log",
      name,
      severity,
      attributes,
    });
  }

  async function start() {
    if (started) return ready;
    started = true;
    if (!enabled) {
      ready = true;
      return true;
    }

    try {
      if (!databaseUrl) throw new Error("NOTIFICATIONS_DATABASE_URL_REQUIRED");
      const runtime = await loadRuntime();
      pool = runtime.server.createNotificationsMySqlPool(databaseUrl);
      await runtime.server.applyNotificationsSchema(pool);
      repository = new runtime.server.MySqlNotificationOutboxRepository(pool);
      preferences = new runtime.server.MySqlNotificationPreferenceStore(pool);
      const idempotency = new runtime.server.MySqlNotificationIdempotencyStore(
        pool,
      );
      const dispatcher = runtime.domain.createNotificationDispatcher({
        preferences,
        idempotency,
        providers: Object.freeze([]),
      });
      eventFactory = runtime.events.createNotificationJobFromEvent;
      schedulerHost = runtime.server.createMySqlNotificationOutboxRuntime({
        pool,
        dispatcher,
        scheduler: {
          batchSize,
          leaseMs: 30_000,
          maxAttempts: 5,
          retryBaseMs: 5_000,
          retryMaxMs: 300_000,
          observe(observation) {
            emit("notifications.delivery.observed", "info", {
              outcome: observation.outcome,
              attempt: observation.attempt,
              reason: observation.reason ?? null,
              provider: observation.provider ?? null,
            });
          },
        },
        host: {
          intervalMs: schedulerIntervalMs,
          runImmediately: true,
          onRun(result) {
            ready = true;
            emit("notifications.scheduler.completed", "info", result);
          },
          onError(error) {
            ready = false;
            emit("notifications.scheduler.failed", "error", {
              reason:
                error instanceof Error
                  ? error.message.slice(0, 160)
                  : "NOTIFICATIONS_SCHEDULER_FAILED",
            });
          },
        },
      });
      schedulerHost.start();
      ready = true;
      emit("notifications.runtime.started", "info", {
        providerMode: "provider-neutral",
      });
      return true;
    } catch (error) {
      ready = false;
      await schedulerHost?.stop?.().catch(() => undefined);
      schedulerHost = null;
      repository = null;
      preferences = null;
      eventFactory = null;
      await pool?.end?.().catch(() => undefined);
      pool = null;
      emit("notifications.runtime.failed", "error", {
        reason:
          error instanceof Error
            ? error.message.slice(0, 160)
            : "NOTIFICATIONS_RUNTIME_FAILED",
      });
      return false;
    }
  }

  async function stop() {
    await schedulerHost?.stop?.();
    schedulerHost = null;
    repository = null;
    preferences = null;
    eventFactory = null;
    const activePool = pool;
    pool = null;
    ready = false;
    started = false;
    await activePool?.end?.();
  }

  return Object.freeze({
    start,
    stop,
    readinessCheck() {
      if (!enabled && started && ready) {
        return Object.freeze({
          status: "pass",
          critical: false,
          detail: "notifications-disabled",
        });
      }
      return Object.freeze({
        status: ready ? "pass" : "fail",
        critical: enabled,
        detail: ready
          ? "notifications-runtime-ready"
          : "NOTIFICATIONS_RUNTIME_UNAVAILABLE",
      });
    },
    async enqueueEvent({ tenantId, event }) {
      if (!enabled || !ready || !repository || !eventFactory) {
        return "unavailable";
      }
      const job = eventFactory(event);
      if (!job) return "rejected";
      return repository.enqueue({
        tenantId,
        job,
        enqueuedAt: new Date().toISOString(),
      });
    },
    async setPreference(input) {
      if (!enabled || !ready || !preferences) return false;
      await preferences.set(input);
      return true;
    },
    async listPreferences(input) {
      if (!enabled || !ready || !preferences) return Object.freeze([]);
      return preferences.list(input);
    },
  });
}
