const DEFAULT_THRESHOLDS = Object.freeze([0.5, 0.75, 0.9, 1]);

function positiveFinite(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function nonNegativeInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
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

export function calculateTokenCostUsd({
  promptTokens,
  completionTokens,
  inputUsdPerMillion,
  outputUsdPerMillion,
}) {
  const inputRate = positiveFinite(inputUsdPerMillion);
  const outputRate = positiveFinite(outputUsdPerMillion);
  if (!inputRate || !outputRate) return null;

  const prompt = nonNegativeInteger(promptTokens);
  const completion = nonNegativeInteger(completionTokens);
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
} = {}) {
  const normalizedProvider =
    String(provider || "provider").trim() || "provider";
  const dailyLimit = positiveFinite(dailyLimitUsd);
  const monthlyLimit = positiveFinite(monthlyLimitUsd);
  const reserveUsd = positiveFinite(requestReserveUsd);
  const concurrency = Math.max(1, nonNegativeInteger(maxConcurrency) || 4);
  const normalizedThresholds = [...thresholds]
    .map(Number)
    .filter((value) => Number.isFinite(value) && value > 0 && value <= 1)
    .sort((a, b) => a - b);

  const configured = Boolean(
    dailyLimit &&
    monthlyLimit &&
    reserveUsd &&
    reserveUsd <= dailyLimit &&
    reserveUsd <= monthlyLimit,
  );

  let daily = createWindow(utcDayKey(now()));
  let monthly = createWindow(utcMonthKey(now()));
  let activeRequests = 0;
  let sequence = 0;
  const reservations = new Map();

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
    return Object.freeze({
      provider: normalizedProvider,
      configured,
      activeRequests,
      maxConcurrency: concurrency,
      requestReserveUsd: reserveUsd,
      daily: dailyLimit ? publicWindow(daily, dailyLimit) : null,
      monthly: monthlyLimit ? publicWindow(monthly, monthlyLimit) : null,
    });
  }

  function reject(reason, details = {}) {
    emit("provider.request.denied", { reason, ...details });
    return Object.freeze({ allowed: false, reason, snapshot: snapshot() });
  }

  function reserve(metadata = {}) {
    refreshWindows();
    if (!configured) return reject("budget_not_configured");
    if (activeRequests >= concurrency) {
      return reject("concurrency_limit", {
        activeRequests,
        maxConcurrency: concurrency,
      });
    }

    const dailyCommitted = daily.spentUsd + daily.reservedUsd + reserveUsd;
    if (dailyCommitted > dailyLimit) {
      return reject("daily_budget_exhausted", {
        limitUsd: dailyLimit,
        committedUsd: daily.spentUsd + daily.reservedUsd,
      });
    }

    const monthlyCommitted =
      monthly.spentUsd + monthly.reservedUsd + reserveUsd;
    if (monthlyCommitted > monthlyLimit) {
      return reject("monthly_budget_exhausted", {
        limitUsd: monthlyLimit,
        committedUsd: monthly.spentUsd + monthly.reservedUsd,
      });
    }

    const reservation = Object.freeze({
      id: `${normalizedProvider}:${now()}:${++sequence}`,
      reservedUsd: reserveUsd,
      startedAt: now(),
      metadata: Object.freeze({ ...metadata }),
    });
    reservations.set(reservation.id, reservation);
    activeRequests += 1;
    daily.reservedUsd += reserveUsd;
    monthly.reservedUsd += reserveUsd;
    daily.requests += 1;
    monthly.requests += 1;
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
    daily.reservedUsd = Math.max(
      0,
      daily.reservedUsd - reservation.reservedUsd,
    );
    monthly.reservedUsd = Math.max(
      0,
      monthly.reservedUsd - reservation.reservedUsd,
    );
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
    const explicitCost = Number(usage.costUsd);
    const costUsd =
      Number.isFinite(explicitCost) && explicitCost >= 0
        ? explicitCost
        : reservation.reservedUsd;

    daily.spentUsd += costUsd;
    monthly.spentUsd += costUsd;
    daily.promptTokens += promptTokens;
    monthly.promptTokens += promptTokens;
    daily.completionTokens += completionTokens;
    monthly.completionTokens += completionTokens;
    daily.totalTokens += totalTokens;
    monthly.totalTokens += totalTokens;
    maybeWarn(daily, dailyLimit, "daily");
    maybeWarn(monthly, monthlyLimit, "monthly");
    emit("provider.request.settled", {
      reservationId: reservation.id,
      costUsd,
      promptTokens,
      completionTokens,
      totalTokens,
      latencyMs: Math.max(0, now() - reservation.startedAt),
      usageSource:
        Number.isFinite(explicitCost) && explicitCost >= 0
          ? "provider_usage"
          : "conservative_reservation",
      metadata: reservation.metadata,
    });
    return snapshot();
  }

  function release(reservation, outcome = {}) {
    refreshWindows();
    if (!closeReservation(reservation)) return snapshot();
    emit("provider.request.released", {
      reservationId: reservation.id,
      latencyMs: Math.max(0, now() - reservation.startedAt),
      ...outcome,
      metadata: reservation.metadata,
    });
    return snapshot();
  }

  return Object.freeze({
    configured,
    reserve,
    settle,
    release,
    snapshot,
  });
}
