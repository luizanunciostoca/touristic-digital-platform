const DEFAULT_FAILURE_THRESHOLD = 3;
const DEFAULT_COOLDOWN_MS = 30_000;

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function safeMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      ([key, item]) =>
        typeof key === "string" &&
        ["string", "number", "boolean"].includes(typeof item),
    ),
  );
}

export function createProviderCircuitBreaker({
  provider = "provider",
  failureThreshold = DEFAULT_FAILURE_THRESHOLD,
  cooldownMs = DEFAULT_COOLDOWN_MS,
  now = Date.now,
  onEvent = () => {},
} = {}) {
  const normalizedProvider =
    String(provider || "provider").trim() || "provider";
  const threshold = positiveInteger(
    failureThreshold,
    DEFAULT_FAILURE_THRESHOLD,
  );
  const cooldown = positiveInteger(cooldownMs, DEFAULT_COOLDOWN_MS);

  let state = "closed";
  let consecutiveFailures = 0;
  let openedAt = null;
  let halfOpenProbeActive = false;

  function emit(type, details = {}) {
    onEvent(
      Object.freeze({
        type,
        provider: normalizedProvider,
        at: new Date(now()).toISOString(),
        ...details,
      }),
    );
  }

  function retryAfterMs(timestamp = now()) {
    if (state !== "open" || openedAt === null) return 0;
    return Math.max(0, cooldown - (timestamp - openedAt));
  }

  function snapshot() {
    const timestamp = now();
    return Object.freeze({
      provider: normalizedProvider,
      state,
      consecutiveFailures,
      failureThreshold: threshold,
      cooldownMs: cooldown,
      retryAfterMs: retryAfterMs(timestamp),
      halfOpenProbeActive,
    });
  }

  function open(reason, metadata) {
    state = "open";
    openedAt = now();
    halfOpenProbeActive = false;
    emit("provider.circuit.opened", {
      reason,
      consecutiveFailures,
      failureThreshold: threshold,
      cooldownMs: cooldown,
      metadata: safeMetadata(metadata),
    });
  }

  function allow(metadata = {}) {
    const timestamp = now();
    if (state === "open") {
      const remaining = retryAfterMs(timestamp);
      if (remaining > 0) {
        emit("provider.circuit.denied", {
          reason: "circuit_open",
          retryAfterMs: remaining,
          metadata: safeMetadata(metadata),
        });
        return Object.freeze({
          allowed: false,
          reason: "circuit_open",
          retryAfterMs: remaining,
        });
      }

      state = "half_open";
      halfOpenProbeActive = false;
      emit("provider.circuit.half_open", {
        metadata: safeMetadata(metadata),
      });
    }

    if (state === "half_open") {
      if (halfOpenProbeActive) {
        emit("provider.circuit.denied", {
          reason: "half_open_probe_in_progress",
          retryAfterMs: cooldown,
          metadata: safeMetadata(metadata),
        });
        return Object.freeze({
          allowed: false,
          reason: "half_open_probe_in_progress",
          retryAfterMs: cooldown,
        });
      }
      halfOpenProbeActive = true;
    }

    return Object.freeze({ allowed: true, reason: null, retryAfterMs: 0 });
  }

  function success(metadata = {}) {
    const changed = state !== "closed" || consecutiveFailures > 0;
    state = "closed";
    consecutiveFailures = 0;
    openedAt = null;
    halfOpenProbeActive = false;
    if (changed) {
      emit("provider.circuit.closed", {
        reason: "provider_success",
        metadata: safeMetadata(metadata),
      });
    }
    return snapshot();
  }

  function failure(reason = "provider_failure", metadata = {}) {
    if (state === "half_open") {
      consecutiveFailures = Math.max(threshold, consecutiveFailures + 1);
      open(reason, metadata);
      return snapshot();
    }

    consecutiveFailures += 1;
    if (consecutiveFailures >= threshold) {
      open(reason, metadata);
    } else {
      emit("provider.circuit.failure", {
        reason,
        consecutiveFailures,
        failureThreshold: threshold,
        metadata: safeMetadata(metadata),
      });
    }
    return snapshot();
  }

  function cancel(metadata = {}) {
    if (state === "half_open" && halfOpenProbeActive) {
      halfOpenProbeActive = false;
      emit("provider.circuit.probe_cancelled", {
        metadata: safeMetadata(metadata),
      });
    }
    return snapshot();
  }

  return Object.freeze({
    allow,
    success,
    failure,
    cancel,
    snapshot,
  });
}
