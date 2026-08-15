import { randomUUID } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";

const DEFAULT_THRESHOLDS = Object.freeze([0.5, 0.75, 0.9, 1]);
const STATE_VERSION = 1;

function positiveFinite(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function positiveInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function nonNegativeInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function optionalNonNegativeInteger(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function utcDayKey(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function utcMonthKey(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 7);
}

function createWindow(key) {
  return {
    key,
    spentUsd: 0,
    reservedUsd: 0,
    requests: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    warned: new Set(),
  };
}

function restoreWindow(source, expectedKey) {
  const window = createWindow(expectedKey);
  if (!source || source.key !== expectedKey) return window;
  window.spentUsd = Math.max(0, Number(source.spentUsd) || 0);
  window.requests = nonNegativeInteger(source.requests);
  window.promptTokens = nonNegativeInteger(source.promptTokens);
  window.completionTokens = nonNegativeInteger(source.completionTokens);
  window.totalTokens = nonNegativeInteger(source.totalTokens);
  window.warned = new Set(
    Array.isArray(source.warned)
      ? source.warned.filter(
          (value) => Number.isFinite(value) && value > 0 && value <= 1,
        )
      : [],
  );
  return window;
}

function publicWindow(window, limitUsd) {
  const committedUsd = window.spentUsd + window.reservedUsd;
  return Object.freeze({
    key: window.key,
    limitUsd,
    spentUsd: window.spentUsd,
    reservedUsd: window.reservedUsd,
    remainingUsd: Math.max(0, limitUsd - committedUsd),
    utilization: limitUsd > 0 ? committedUsd / limitUsd : 0,
    requests: window.requests,
    promptTokens: window.promptTokens,
    completionTokens: window.completionTokens,
    totalTokens: window.totalTokens,
  });
}

function serializableWindow(window) {
  return {
    key: window.key,
    spentUsd: window.spentUsd,
    reservedUsd: window.reservedUsd,
    requests: window.requests,
    promptTokens: window.promptTokens,
    completionTokens: window.completionTokens,
    totalTokens: window.totalTokens,
    warned: [...window.warned],
  };
}

function cloneMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      ([key, item]) =>
        typeof key === "string" &&
        ["string", "number", "boolean"].includes(typeof item),
    ),
  );
}

export function createJsonFileGovernanceStateStore(filePath) {
  const normalizedPath = String(filePath || "").trim();
  if (!normalizedPath) throw new Error("governance_state_file_required");
  const absolutePath = resolve(normalizedPath);

  return Object.freeze({
    load() {
      try {
        return JSON.parse(readFileSync(absolutePath, "utf8"));
      } catch (error) {
        if (error?.code === "ENOENT") return null;
        throw error;
      }
    },
    save(state) {
      const parent = dirname(absolutePath);
      mkdirSync(parent, { recursive: true, mode: 0o700 });
      const temporaryPath = `${absolutePath}.${process.pid}.${randomUUID()}.tmp`;
      writeFileSync(temporaryPath, `${JSON.stringify(state)}\n`, {
        encoding: "utf8",
        mode: 0o600,
      });
      renameSync(temporaryPath, absolutePath);
    },
  });
}

export function calculateTokenCostUsd({
  promptTokens,
  completionTokens,
  inputUsdPerMillion,
  outputUsdPerMillion,
}) {
  const inputRate = positiveFinite(inputUsdPerMillion);
  const outputRate = positiveFinite(outputUsdPerMillion);
  const prompt = optionalNonNegativeInteger(promptTokens);
  const completion = optionalNonNegativeInteger(completionTokens);
  if (!inputRate || !outputRate || prompt === null || completion === null) {
    return null;
  }

  return (prompt * inputRate + completion * outputRate) / 1_000_000;
}

export function createProviderCostGovernor({
  provider,
  dailyLimitUsd,
  monthlyLimitUsd,
  requestReserveUsd,
  maxConcurrency = 4,
  now = Date.now,
  onEvent = () => {},
  thresholds = DEFAULT_THRESHOLDS,
  stateStore = null,
  requirePersistentState = false,
  createReservationId = randomUUID,
} = {}) {
  const normalizedProvider =
    String(provider || "provider").trim() || "provider";
  const dailyLimit = positiveFinite(dailyLimitUsd);
  const monthlyLimit = positiveFinite(monthlyLimitUsd);
  const reserveUsd = positiveFinite(requestReserveUsd);
  const concurrency = positiveInteger(maxConcurrency);
  const normalizedThresholds = [...thresholds]
    .map(Number)
    .filter((value) => Number.isFinite(value) && value > 0 && value <= 1)
    .sort((a, b) => a - b);

  const baseConfigured = Boolean(
    dailyLimit &&
      monthlyLimit &&
      reserveUsd &&
      concurrency &&
      reserveUsd <= dailyLimit &&
      reserveUsd <= monthlyLimit &&
      (!requirePersistentState || stateStore),
  );

  let daily = createWindow(utcDayKey(now()));
  let monthly = createWindow(utcMonthKey(now()));
  let activeRequests = 0;
  const reservations = new Map();
  let persistenceHealthy = true;
  let recoveredReservations = 0;
  let initializationError = null;

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

  function refreshWindows() {
    const timestamp = now();
    const nextDay = utcDayKey(timestamp);
    const nextMonth = utcMonthKey(timestamp);
    if (daily.key !== nextDay) daily = createWindow(nextDay);
    if (monthly.key !== nextMonth) monthly = createWindow(nextMonth);
  }

  function serializedState() {
    return {
      version: STATE_VERSION,
      provider: normalizedProvider,
      daily: serializableWindow(daily),
      monthly: serializableWindow(monthly),
      reservations: [...reservations.values()].map((reservation) => ({
        id: reservation.id,
        reservedUsd: reservation.reservedUsd,
        startedAt: reservation.startedAt,
        dayKey: reservation.dayKey,
        monthKey: reservation.monthKey,
        metadata: reservation.metadata,
      })),
    };
  }

  function persist(reason) {
    if (!stateStore) return !requirePersistentState;
    try {
      stateStore.save(serializedState());
      return true;
    } catch (error) {
      persistenceHealthy = false;
      emit("provider.governance.persistence_failed", {
        reason,
        errorCode: typeof error?.code === "string" ? error.code : "unknown",
      });
      return false;
    }
  }

  function recoverPersistedState() {
    if (!stateStore) return;
    try {
      const persisted = stateStore.load();
      if (!persisted) return;
      if (
        persisted.version !== STATE_VERSION ||
        persisted.provider !== normalizedProvider
      ) {
        throw new Error("governance_state_incompatible");
      }

      const timestamp = now();
      const currentDay = utcDayKey(timestamp);
      const currentMonth = utcMonthKey(timestamp);
      daily = restoreWindow(persisted.daily, currentDay);
      monthly = restoreWindow(persisted.monthly, currentMonth);

      const orphaned = Array.isArray(persisted.reservations)
        ? persisted.reservations
        : [];
      for (const candidate of orphaned) {
        const amount = positiveFinite(candidate?.reservedUsd);
        if (!amount) continue;
        const metadata = Object.freeze(cloneMetadata(candidate.metadata));
        if (candidate.dayKey === currentDay) daily.spentUsd += amount;
        if (candidate.monthKey === currentMonth) monthly.spentUsd += amount;
        recoveredReservations += 1;
        emit("provider.request.recovered", {
          reservationId: String(candidate.id || "unknown"),
          costUsd: amount,
          dayKey: String(candidate.dayKey || ""),
          monthKey: String(candidate.monthKey || ""),
          usageSource: "conservative_orphan_recovery",
          metadata,
        });
      }

      if (orphaned.length > 0 && !persist("orphan_recovery")) {
        initializationError = "state_recovery_persistence_failed";
      }
    } catch (error) {
      persistenceHealthy = false;
      initializationError =
        error?.message === "governance_state_incompatible"
          ? "state_incompatible"
          : "state_load_failed";
      emit("provider.governance.persistence_failed", {
        reason: "initialization",
        errorCode: typeof error?.code === "string" ? error.code : "unknown",
      });
    }
  }

  recoverPersistedState();

  function maybeWarn(window, limit, period) {
    const utilization =
      limit > 0 ? (window.spentUsd + window.reservedUsd) / limit : 0;
    for (const threshold of normalizedThresholds) {
      if (utilization < threshold || window.warned.has(threshold)) continue;
      window.warned.add(threshold);
      emit("provider.budget.threshold", {
        period,
        threshold,
        utilization,
        spentUsd: window.spentUsd,
        reservedUsd: window.reservedUsd,
        limitUsd: limit,
      });
    }
  }

  function snapshot() {
    refreshWindows();
    const dailySnapshot = dailyLimit ? publicWindow(daily, dailyLimit) : null;
    const monthlySnapshot = monthlyLimit
      ? publicWindow(monthly, monthlyLimit)
      : null;
    return Object.freeze({
      provider: normalizedProvider,
      configured: baseConfigured && persistenceHealthy,
      activeRequests,
      maxConcurrency: concurrency,
      requestReserveUsd: reserveUsd,
      persistence: Object.freeze({
        required: requirePersistentState,
        configured: Boolean(stateStore),
        healthy: persistenceHealthy,
        recoveredReservations,
        initializationError,
      }),
      breached: Boolean(
        (dailySnapshot && dailySnapshot.spentUsd > dailySnapshot.limitUsd) ||
          (monthlySnapshot &&
            monthlySnapshot.spentUsd > monthlySnapshot.limitUsd),
      ),
      daily: dailySnapshot,
      monthly: monthlySnapshot,
    });
  }

  function reject(reason, details = {}) {
    emit("provider.request.denied", { reason, ...details });
    return Object.freeze({ allowed: false, reason, snapshot: snapshot() });
  }

  function reserve(metadata = {}) {
    refreshWindows();
    const safeMetadata = Object.freeze(cloneMetadata(metadata));
    if (!baseConfigured) {
      return reject("budget_not_configured", { metadata: safeMetadata });
    }
    if (!persistenceHealthy) {
      return reject("state_persistence_unavailable", {
        metadata: safeMetadata,
      });
    }
    if (activeRequests >= concurrency) {
      return reject("concurrency_limit", {
        activeRequests,
        maxConcurrency: concurrency,
        metadata: safeMetadata,
      });
    }

    const dailyCommitted = daily.spentUsd + daily.reservedUsd + reserveUsd;
    if (dailyCommitted > dailyLimit) {
      return reject("daily_budget_exhausted", {
        limitUsd: dailyLimit,
        committedUsd: daily.spentUsd + daily.reservedUsd,
        metadata: safeMetadata,
      });
    }

    const monthlyCommitted =
      monthly.spentUsd + monthly.reservedUsd + reserveUsd;
    if (monthlyCommitted > monthlyLimit) {
      return reject("monthly_budget_exhausted", {
        limitUsd: monthlyLimit,
        committedUsd: monthly.spentUsd + monthly.reservedUsd,
        metadata: safeMetadata,
      });
    }

    const startedAt = now();
    const reservation = Object.freeze({
      id: `${normalizedProvider}:${createReservationId()}`,
      reservedUsd: reserveUsd,
      startedAt,
      dayKey: daily.key,
      monthKey: monthly.key,
      metadata: safeMetadata,
    });
    reservations.set(reservation.id, reservation);
    activeRequests += 1;
    daily.reservedUsd += reserveUsd;
    monthly.reservedUsd += reserveUsd;
    daily.requests += 1;
    monthly.requests += 1;

    if (!persist("reservation")) {
      reservations.delete(reservation.id);
      activeRequests = Math.max(0, activeRequests - 1);
      daily.reservedUsd = Math.max(0, daily.reservedUsd - reserveUsd);
      monthly.reservedUsd = Math.max(0, monthly.reservedUsd - reserveUsd);
      daily.requests = Math.max(0, daily.requests - 1);
      monthly.requests = Math.max(0, monthly.requests - 1);
      return reject("state_persistence_failed", { metadata: safeMetadata });
    }

    maybeWarn(daily, dailyLimit, "daily");
    maybeWarn(monthly, monthlyLimit, "monthly");
    emit("provider.request.reserved", {
      reservationId: reservation.id,
      reservedUsd: reserveUsd,
      activeRequests,
      metadata: reservation.metadata,
    });
    return Object.freeze({ allowed: true, reservation });
  }

  function closeReservation(reservation) {
    if (!reservation || !reservations.has(reservation.id)) return false;
    reservations.delete(reservation.id);
    activeRequests = Math.max(0, activeRequests - 1);
    if (reservation.dayKey === daily.key) {
      daily.reservedUsd = Math.max(
        0,
        daily.reservedUsd - reservation.reservedUsd,
      );
    }
    if (reservation.monthKey === monthly.key) {
      monthly.reservedUsd = Math.max(
        0,
        monthly.reservedUsd - reservation.reservedUsd,
      );
    }
    return true;
  }

  function settle(reservation, usage = {}) {
    refreshWindows();
    if (!closeReservation(reservation)) return snapshot();

    const promptTokens = nonNegativeInteger(usage.promptTokens);
    const completionTokens = nonNegativeInteger(usage.completionTokens);
    const totalTokens = nonNegativeInteger(
      usage.totalTokens || promptTokens + completionTokens,
    );
    const hasExplicitCost =
      typeof usage.costUsd === "number" &&
      Number.isFinite(usage.costUsd) &&
      usage.costUsd >= 0;
    const costUsd = hasExplicitCost ? usage.costUsd : reservation.reservedUsd;

    if (reservation.dayKey === daily.key) {
      daily.spentUsd += costUsd;
      daily.promptTokens += promptTokens;
      daily.completionTokens += completionTokens;
      daily.totalTokens += totalTokens;
    }
    if (reservation.monthKey === monthly.key) {
      monthly.spentUsd += costUsd;
      monthly.promptTokens += promptTokens;
      monthly.completionTokens += completionTokens;
      monthly.totalTokens += totalTokens;
    }
    const persisted = persist("settlement");
    maybeWarn(daily, dailyLimit, "daily");
    maybeWarn(monthly, monthlyLimit, "monthly");
    const breached =
      daily.spentUsd > dailyLimit || monthly.spentUsd > monthlyLimit;
    if (breached) {
      emit("provider.budget.overrun", {
        reservationId: reservation.id,
        costUsd,
        dailySpentUsd: daily.spentUsd,
        dailyLimitUsd: dailyLimit,
        monthlySpentUsd: monthly.spentUsd,
        monthlyLimitUsd: monthlyLimit,
        metadata: reservation.metadata,
      });
    }
    emit("provider.request.settled", {
      reservationId: reservation.id,
      costUsd,
      promptTokens,
      completionTokens,
      totalTokens,
      latencyMs: Math.max(0, now() - reservation.startedAt),
      usageSource: hasExplicitCost
        ? "provider_usage"
        : "conservative_reservation",
      persistenceHealthy: persisted,
      metadata: reservation.metadata,
    });
    return snapshot();
  }

  function release(reservation, outcome = {}) {
    refreshWindows();
    if (!closeReservation(reservation)) return snapshot();
    const persisted = persist("release");
    emit("provider.request.released", {
      reservationId: reservation.id,
      latencyMs: Math.max(0, now() - reservation.startedAt),
      persistenceHealthy: persisted,
      ...cloneMetadata(outcome),
      metadata: reservation.metadata,
    });
    return snapshot();
  }

  return Object.freeze({
    get configured() {
      return baseConfigured && persistenceHealthy;
    },
    reserve,
    settle,
    release,
    snapshot,
  });
}
